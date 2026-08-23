/**
 * Mixer Layout - Restructures the UI into an audio-mixer-inspired layout.
 * 
 * - Top mixer strip: channel faders for key controls
 * - Right sidebar: collapsible sections for grouped settings
 * - Canvas area: center
 * - Layers: right sidebar (always visible)
 * 
 * This script moves (not clones) existing DOM elements, so all
 * event listeners and ID references are preserved.
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        // PERF: Defer heavy DOM restructuring until after splash animation starts
        // This prevents jitter during the title fadein.
        // The desktop build has no splash animation to protect (the window is
        // invisible until everything is built), so that 800ms is pure launch
        // latency there — build straight away instead.
        var splash = document.getElementById('splash-screen');
        if (window.Boot && window.Boot.usesWindowFade) {
            requestAnimationFrame(initMixerLayout);
        } else if (splash) {
            // Wait for splash animations to complete their initial render
            // then do heavy DOM work during the "hold" phase before fadeout
            setTimeout(function() {
                requestAnimationFrame(initMixerLayout);
            }, 800); // Splash title animation is 0.8s, start after it settles
        } else {
            requestAnimationFrame(initMixerLayout);
        }
    });

    function initMixerLayout() {
        // Build ONCE. The build re-parents live nodes by id, so a second run
        // steals them into a second strip/sidebar and leaves the first pair
        // half-empty. Two DOMContentLoaded deliveries (or a deferred rAF that
        // fires after a manual re-init) used to produce exactly that.
        if (document.getElementById('mixer-strip')) return;

        const controls = document.querySelector('.controls');
        const canvasArea = document.getElementById('canvas-area');
        if (!controls || !canvasArea) return;

        const strip = buildMixerStrip(controls);
        const sidebar = buildSidebar(controls);

        // Add entrance animation classes. The staggered slide-in is the WEB
        // build's entrance; on the desktop build the window fade is the
        // entrance, and starting these off-screen would mean the panels are
        // still flying in after the window has materialized (see
        // orchestrateEntrance below and js/00a-boot.js).
        if (!(window.Boot && window.Boot.usesWindowFade)) {
            strip.classList.add('ui-enter');
            sidebar.classList.add('ui-enter');
            canvasArea.classList.add('ui-enter');
        }

        // Create main-area wrapper
        const mainArea = document.createElement('div');
        mainArea.id = 'main-area';

        // Insert mixer strip before canvas-area
        canvasArea.parentNode.insertBefore(strip, canvasArea);

        // Insert main-area wrapper before canvas-area
        canvasArea.parentNode.insertBefore(mainArea, canvasArea);

        // Move canvas-area into main-area
        mainArea.appendChild(canvasArea);

        // Append sidebar to main-area
        mainArea.appendChild(sidebar);

        // Move any remaining dynamic content from .controls to sidebar
        // (e.g., component system)
        const remaining = controls.querySelectorAll('.collapsible-section, #component-controls');
        remaining.forEach(function(el) {
            // Convert .collapsible-section to .sidebar-section format
            if (el.classList.contains('collapsible-section')) {
                el.classList.remove('collapsible-section');
                el.classList.add('sidebar-section');
                // Convert header
                var hdr = el.querySelector('.section-header, .collapsible-header');
                if (hdr) {
                    hdr.removeAttribute('onclick');
                    hdr.addEventListener('click', function() {
                        this.parentElement.classList.toggle('collapsed');
                    });
                    // Convert toggle icon to chevron
                    var toggle = hdr.querySelector('.section-toggle, .icon');
                    if (toggle) {
                        toggle.className = 'section-chevron';
                        toggle.textContent = '▾';
                    }
                }
                // Convert content to section-body
                var content = el.querySelector('.section-content, .collapsible-content');
                if (content) {
                    content.className = 'section-body';
                }
            }
            sidebar.appendChild(el);
        });

        // Hide old controls (CSS also hides it, but belt-and-suspenders)
        controls.style.display = 'none';

        // Periodic sync for brush size value (no native display span)
        const brushSlider = document.getElementById('brushSize');
        const brushDisplay = document.getElementById('mixer-brushValue');
        if (brushSlider && brushDisplay) {
            function syncBrush() {
                // Compare before writing: the 2s fallback interval otherwise
                // invalidates style/layout every tick even when nothing
                // changed (UI audit Stage 1 — no-op DOM writes aren't free).
                // Fine tips (down to 0.001) need 3 decimals or the readout
                // reads a flat "0.0" across the whole detail range.
                var n = parseFloat(brushSlider.value);
                var v = (n < 1) ? n.toFixed(3) : n.toFixed(1);
                if (brushDisplay.textContent !== v) brushDisplay.textContent = v;
            }
            brushSlider.addEventListener('input', syncBrush);
            brushSlider.addEventListener('change', syncBrush);
            // Slow fallback for programmatic value changes (2s instead of 300ms)
            setInterval(syncBrush, 2000);
            syncBrush();
        }

        // ── Responsive typography: detect HiDPI / 4K and set --ui-scale ──
        initResponsiveScale();

        // ── Sidebar resize handle ──
        initSidebarResize(sidebar);

        // ── Splash → entrance animation sequence ──
        orchestrateEntrance(strip, sidebar, canvasArea);

        // ── COS Oscillator UI: inject after sliders are in their final positions ──
        if (window.cosOscillator && typeof window.cosOscillator.buildUI === 'function') {
            window.cosOscillator.buildUI();
        }

        // This build is what shrinks the drawing area: the strip and the fixed
        // bottom nav take height off it and the sidebar takes width. 01-config
        // placed the canvas long before any of that existed (measured: ~130ms
        // vs ~850ms), so between the two the frame is a full sidebar wider and
        // a nav taller than the area it sits in. The ResizeObserver in
        // 01-config does eventually catch it, but only after an 80ms debounce
        // and a rendering-update delivery — three quarters of a second of boot
        // spent with the canvas hanging past the edges. Re-fit it here, where
        // we already know the chrome just changed.
        if (typeof window.fitCanvasIntoArea === 'function') {
            var pinned = typeof window.canvasHasPinnedSize === 'function' && window.canvasHasPinnedSize();
            window.fitCanvasIntoArea({ fill: !pinned });
        }
    }

    function initResponsiveScale() {
        // Single scaling mechanism: JS only computes --ui-scale; all zooming
        // is done in CSS via `zoom: var(--ui-scale)` rules (init-responsive.css).
        // Elements added later pick the zoom up automatically from their class.
        var _scale = 1;

        function computeScale() {
            var dpr = window.devicePixelRatio || 1;
            var cssW = window.innerWidth;
            var scale = 1;
            // Continuous scale: UI was designed for ~1440px viewport.
            // Wider viewports get proportionally larger UI elements.
            // Formula: linear ramp from 1.0 at 1600px to 1.8 at 3840px
            if (cssW > 1600) {
                scale = Math.round(Math.min(1.8, 1 + (cssW - 1600) * 0.00036) * 100) / 100;
            }
            // Also scale up for high-DPI screens even with moderate viewport
            // (physical 4K with high OS scaling — viewport looks ok-ish but text is still small)
            if (scale === 1 && dpr >= 2 && cssW >= 1200) {
                scale = 1.15;
            }
            _scale = scale;
            document.documentElement.style.setProperty('--ui-scale', scale);
            console.log('[UI Scale] dpr=' + dpr + ' cssW=' + cssW + ' → scale=' + scale);
        }
        computeScale();
        window.addEventListener('resize', computeScale);
        // Detect DPI changes (e.g. dragging to a different monitor)
        // Use recursive matchMedia that re-binds after each change
        function watchDpr() {
            var mq = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
            mq.addEventListener('change', function onDprChange() {
                mq.removeEventListener('change', onDprChange);
                computeScale();
                watchDpr(); // re-bind with new DPR
            });
        }
        watchDpr();
        // Coordinate helper for fixed-position math on zoomed elements:
        // style px = screen px / scale.
        window.UIScale = {
            get: function() { return _scale; },
            fromVisual: function(px) { return px / _scale; }
        };
        // Back-compat no-op (zooming is CSS-driven now)
        window._uiScaleReapply = function() {};
    }

    function initSidebarResize(sidebar) {
        var handle = document.createElement('div');
        handle.className = 'sidebar-resize-handle';
        sidebar.appendChild(handle);

        var startX = 0, startW = 0, dragging = false;
        handle.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            startW = sidebar.offsetWidth;
            handle.classList.add('active');
            handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', function(e) {
            if (!dragging) return;
            var zoom = window.UIScale ? window.UIScale.get() : 1;
            var delta = startX - e.clientX; // dragging left = wider
            // offsetWidth and delta are in screen pixels (zoomed), convert to base width
            var newW = Math.max(220, Math.min(420, (startW + delta) / zoom));
            document.documentElement.style.setProperty('--sidebar-width', Math.round(newW) + 'px');
        });
        handle.addEventListener('pointerup', function(e) {
            dragging = false;
            handle.classList.remove('active');
        });
        handle.addEventListener('pointercancel', function() {
            dragging = false;
            handle.classList.remove('active');
        });
    }

    function orchestrateEntrance(strip, sidebar, canvasArea) {
        var splash = document.getElementById('splash-screen');
        var titlebar = document.getElementById('custom-titlebar');

        // ── Desktop: the WINDOW fade is the entrance (js/00a-boot.js) ──
        // Everything must already be in its final position when the window
        // materializes — a panel still sliding in afterwards is exactly the
        // stutter the fade exists to remove. So: settle now, report the
        // layout gate, and let the fade do the rest.
        if (window.Boot && window.Boot.usesWindowFade) {
            [titlebar, strip, sidebar, canvasArea].forEach(function (el) {
                if (el) el.classList.remove('ui-enter', 'ui-ready');
            });
            if (window.Boot.titleCard && splash) {
                // Title card rides in with the window, then dissolves off the
                // already-running app underneath it.
                window.Boot.onReveal(function (info) {
                    setTimeout(function () {
                        splash.classList.add('ready');
                        setTimeout(function () {
                            splash.classList.add('fade-out');
                            setTimeout(function () {
                                if (splash.parentNode) splash.parentNode.removeChild(splash);
                            }, 700);
                        }, 260);
                    }, (info.fadeMs || 0) + (info.titleHoldMs || 0));
                });
            } else if (splash && splash.parentNode) {
                // No title card: drop it before the reveal so what fades up
                // is the finished, running app.
                splash.parentNode.removeChild(splash);
            }
            window.Boot.done('layout');
            return;
        }

        // Web build below. Boot's reveal callbacks (first-run hint, restore
        // prompt) are shared with the desktop path, so the layout gate is
        // reported here too — there it just resolves without a window fade.
        if (window.Boot) window.Boot.done('layout');

        // If no splash screen, just show UI immediately
        if (!splash) {
            if (titlebar) titlebar.classList.remove('ui-enter');
            strip.classList.remove('ui-enter');
            sidebar.classList.remove('ui-enter');
            canvasArea.classList.remove('ui-enter');
            return;
        }

        function doTransition() {
            // Brief pause to show "ready" flourish, then fade out
            setTimeout(function() {
                splash.classList.add('fade-out');

                // Stagger UI entrance
                setTimeout(function() { if (titlebar) titlebar.classList.add('ui-ready'); }, 100);
                setTimeout(function() { strip.classList.add('ui-ready'); }, 180);
                setTimeout(function() { canvasArea.classList.add('ui-ready'); }, 260);
                setTimeout(function() { sidebar.classList.add('ui-ready'); }, 320);

                // Clean up after animations
                setTimeout(function() {
                    if (splash.parentNode) splash.parentNode.removeChild(splash);
                    [titlebar, strip, sidebar, canvasArea].forEach(function(el) {
                        if (el) {
                            el.classList.remove('ui-enter', 'ui-ready');
                            el.classList.add('ui-settled');
                        }
                    });
                    setTimeout(function() {
                        [titlebar, strip, sidebar, canvasArea].forEach(function(el) {
                            if (el) el.classList.remove('ui-settled');
                        });
                    }, 100);
                }, 800);
            }, 250); // Brief pause after ready state
        }

        // Wait for scripts to load, then transition
        if (window.__scriptsReady) {
            doTransition();
        } else {
            window.__onScriptsReady = doTransition;
        }
    }

    // One shared disclosure affordance (user-test 2026-08-15): Brush Size,
    // Fluid, and Multi-Brush each hid extra controls behind a DIFFERENT
    // secret handshake — a clickable label with an 8px chevron, a select
    // disguised as a label, a clickable value cell. None read as
    // interactive. Every channel with more-settings now also carries an
    // explicit gear button in its header; the original triggers stay
    // clickable for muscle memory.
    function makeChGear(title) {
        var g = document.createElement('button');
        g.type = 'button';
        g.className = 'ch-gear';
        g.title = title;
        // U+2699 + VS15 forces the monochrome TEXT gear glyph (no emoji
        // coloring), so currentColor styling applies like any icon font.
        g.textContent = '⚙︎';
        return g;
    }

    // Delegate the gear to an existing trigger element and mirror its
    // active state (set/cleared by the panel handlers AND the outside-click
    // closers — a MutationObserver keeps the gear honest either way). The
    // delegated .click() raises a fresh event targeting the trigger, which
    // every outside-click closer already exempts.
    function wireGearToTrigger(gear, trigger) {
        if (!trigger) { gear.disabled = true; return; }
        gear.addEventListener('click', function (e) {
            e.stopPropagation();
            trigger.click();
        });
        try {
            new MutationObserver(function () {
                gear.classList.toggle('active', trigger.classList.contains('active'));
            }).observe(trigger, { attributes: true, attributeFilter: ['class'] });
        } catch (_) {}
    }

    // ─── BRUSH TIP: one vocabulary, two doors ────────────────────
    // These five glyphs are the app's whole visual language for the splat
    // stamp. The brush drawer's Tip row and the square swatch beside the
    // Brush Size fader both read this list, so a tip can never be drawn as
    // one shape in one place and another shape somewhere else.
    var BRUSH_TIPS = [
        { v: 0, glyph: '◌', name: 'Soft',   title: 'Soft — the classic gaussian dab' },
        { v: 1, glyph: '⬤', name: 'Blob',   title: 'Blob — noise-notched round stamp' },
        { v: 2, glyph: '■', name: 'Chisel', title: 'Chisel — squared press' },
        { v: 3, glyph: '▬', name: 'Streak', title: 'Streak — elongated smear' },
        { v: 4, glyph: '◯', name: 'Ring',   title: 'Ring — thin dye band, hollow center' }
    ];

    // The drawer owns the tip's commit path (config + persistence + the
    // Texture slider's enabled state + preset-dirty). The strip swatch is a
    // second DOOR onto those setters, never a second copy of them.
    var BrushTipCtl = null;     // {setTip, markDirty, openImport} — set by buildBrushPanel
    var tipSwatchSync = null;   // set by buildTipSwatch — repaints the swatch (+ an open menu)
    function syncTipSwatch() { if (tipSwatchSync) tipSwatchSync(); }

    function activeShapeEntry() {
        if (!window.BrushShapes) return null;
        var id = window.BrushShapes.activeId();
        if (!id) return null;
        var lst = window.BrushShapes.list() || [];
        for (var i = 0; i < lst.length; i++) if (lst[i].id === id) return lst[i];
        return null;
    }

    // ── Styled confirm (2026-08-18) ───────────────────────────────────────
    // window.confirm() renders the OS/Chromium dialog — a white box titled
    // with the app's internal hostname, sitting outside everything this app
    // looks like. Same shape as the native call (a promise of yes/no) so a
    // call site swaps over in one line.
    window.appConfirm = function appConfirm(opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var modal = document.getElementById('appConfirmModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'appConfirmModal';
                modal.className = 'delete-modal app-confirm-modal';
                modal.innerHTML =
                    '<div class="delete-modal-content">' +
                        '<div class="delete-modal-title" id="appConfirmTitle"></div>' +
                        '<div class="delete-modal-message" id="appConfirmMessage"></div>' +
                        '<div class="delete-modal-actions">' +
                            '<button type="button" class="delete-modal-cancel" id="appConfirmCancel"></button>' +
                            '<button type="button" class="delete-modal-confirm" id="appConfirmOk"></button>' +
                        '</div>' +
                    '</div>';
                document.body.appendChild(modal);
            }
            var titleEl = modal.querySelector('#appConfirmTitle');
            var msgEl = modal.querySelector('#appConfirmMessage');
            var okEl = modal.querySelector('#appConfirmOk');
            var cancelEl = modal.querySelector('#appConfirmCancel');
            titleEl.textContent = opts.title || 'Are you sure?';
            msgEl.textContent = opts.message || '';
            msgEl.style.display = opts.message ? '' : 'none';
            okEl.textContent = opts.confirmLabel || 'OK';
            cancelEl.textContent = opts.cancelLabel || 'Cancel';
            // cancelLabel: null → one button, i.e. an alert rather than a question
            cancelEl.style.display = (opts.cancelLabel === null) ? 'none' : '';
            okEl.classList.toggle('app-confirm-safe', opts.danger === false);

            var done = function (val) {
                modal.classList.remove('show');
                okEl.onclick = cancelEl.onclick = modal.onmousedown = null;
                document.removeEventListener('keydown', onKey, true);
                resolve(val);
            };
            var onKey = function (e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
                else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
            };
            okEl.onclick = function () { done(true); };
            cancelEl.onclick = function () { done(false); };
            // Backdrop click is the safe answer, same as Esc
            modal.onmousedown = function (e) { if (e.target === modal) done(false); };
            document.addEventListener('keydown', onKey, true);
            modal.classList.add('show');
            (opts.cancelLabel === null ? okEl : cancelEl).focus();
        });
    };

    // Same dialog, one button — the styled stand-in for window.alert().
    window.appAlert = function appAlert(title, message, okLabel) {
        return window.appConfirm({
            title: title, message: message,
            confirmLabel: okLabel || 'OK', cancelLabel: null, danger: false
        });
    };

    // ── Per-shape actions (edit / delete) ─────────────────────────────────
    // Right-click used to go straight to a delete confirm, which made the
    // only thing you could do to a saved shape destroy it. It opens this
    // instead, so editing one is a normal thing to do.
    var _shapeMenuEl = null;
    function closeShapeMenu() {
        if (!_shapeMenuEl) return;
        _shapeMenuEl.remove();
        _shapeMenuEl = null;
        document.removeEventListener('mousedown', _onShapeMenuOutside, true);
        document.removeEventListener('keydown', _onShapeMenuKey, true);
        window.removeEventListener('resize', closeShapeMenu);
    }
    function _onShapeMenuOutside(e) { if (_shapeMenuEl && !_shapeMenuEl.contains(e.target)) closeShapeMenu(); }
    function _onShapeMenuKey(e) { if (e.key === 'Escape') closeShapeMenu(); }

    function openShapeMenu(shape, x, y) {
        closeShapeMenu();
        var m = document.createElement('div');
        m.className = 'brush-shape-menu';
        var mk = function (label, cls, fn) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'brush-shape-menu-item' + (cls ? ' ' + cls : '');
            b.textContent = label;
            b.addEventListener('click', function () { closeShapeMenu(); fn(); });
            m.appendChild(b);
        };
        var head = document.createElement('div');
        head.className = 'brush-shape-menu-head';
        head.textContent = shape.name;
        head.title = shape.name;
        m.appendChild(head);
        mk('✏️ Edit shape', '', function () {
            if (window.BrushShapes && window.BrushShapes.beginEdit) window.BrushShapes.beginEdit(shape.id);
        });
        mk('🗑 Delete', 'danger', function () {
            window.appConfirm({
                title: 'Delete brush shape?',
                message: '"' + shape.name + '" will be removed from your brush shapes. This cannot be undone.',
                confirmLabel: 'Delete',
                cancelLabel: 'Keep'
            }).then(function (ok) {
                if (ok && window.BrushShapes) window.BrushShapes.remove(shape.id);
            });
        });
        // Body-mounted so it escapes the drawer/tip-menu overflow and stacking
        document.body.appendChild(m);
        var r = m.getBoundingClientRect();
        var px = Math.min(x, window.innerWidth - r.width - 8);
        var py = Math.min(y, window.innerHeight - r.height - 8);
        m.style.left = Math.max(8, px) + 'px';
        m.style.top = Math.max(8, py) + 'px';
        _shapeMenuEl = m;
        // Deferred so the click that opened it doesn't immediately close it
        setTimeout(function () {
            document.addEventListener('mousedown', _onShapeMenuOutside, true);
            document.addEventListener('keydown', _onShapeMenuKey, true);
            window.addEventListener('resize', closeShapeMenu);
        }, 0);
    }

    // Custom stamp swatches (33-brush-shapes) + the import tile, shared by
    // the drawer's shapes row and the strip's tip menu — one renderer, so a
    // shape selects, deletes and highlights identically wherever it's clicked.
    function renderShapeTiles(row, opts) {
        opts = opts || {};
        row.innerHTML = '';
        var lst = (window.BrushShapes && window.BrushShapes.list()) || [];
        var act = (window.BrushShapes && window.BrushShapes.activeId()) || null;
        lst.forEach(function (s) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'brush-tip-btn brush-shape-btn' + (s.id === act ? ' active' : '');
            b.style.backgroundImage = 'url("' + s.dataURL + '")';
            // Pin the sizing longhands inline: every .brush-tip-btn state
            // rule (:hover, .active) uses the `background:` shorthand,
            // which resets size/repeat/position — inline always wins, so
            // the thumbnail can never blow up to natural size in a state
            // whose CSS override was missed.
            b.style.backgroundSize = 'contain';
            b.style.backgroundRepeat = 'no-repeat';
            b.style.backgroundPosition = 'center';
            b.title = s.name + ' — click to paint with this shape · right-click to edit or delete';
            b.addEventListener('click', function () {
                if (!window.BrushShapes) return;
                window.BrushShapes.setActive(window.BrushShapes.activeId() === s.id ? null : s.id);
                if (BrushTipCtl) BrushTipCtl.markDirty();
                if (opts.onPick) opts.onPick();
            });
            b.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (!window.BrushShapes) return;
                openShapeMenu(s, e.clientX, e.clientY);
            });
            row.appendChild(b);
        });
        var addB = document.createElement('button');
        addB.type = 'button';
        addB.className = 'brush-tip-btn brush-shape-add';
        addB.textContent = '＋';
        addB.title = 'Add brush shape — import an image and cut it out with the mask tools (incl. Instant Roto). You can also drop an image anywhere on this row.';
        addB.addEventListener('click', function () { if (opts.onImport) opts.onImport(); });
        row.appendChild(addB);
    }

    // The square appended to the Brush Size fader: it SHOWS the tip you are
    // painting with (built-in glyph, or the custom stamp's own thumbnail) and
    // opens a tip menu. Until now the tip lived only inside the brush drawer —
    // nothing anywhere on screen said which tip was loaded, and changing it
    // meant opening a drawer from the fader that sets its size.
    function buildTipSwatch() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ch-tip-swatch';

        // The stamp thumbnail rides an inner span so the button's own
        // background stays free for the hover/active fills.
        var face = document.createElement('span');
        face.className = 'ch-tip-face';
        btn.appendChild(face);

        var menu = document.createElement('div');
        menu.className = 'arm-colors-panel brush-tip-menu';
        menu.style.display = 'none';
        menu.style.position = 'fixed';   // the strip is overflow-x:auto — a popup inside it would clip
        document.body.appendChild(menu);
        menu.addEventListener('click', function (e) { e.stopPropagation(); });

        var head = document.createElement('div');
        head.className = 'arm-colors-header';
        head.textContent = 'Brush Tip';
        menu.appendChild(head);

        var list = document.createElement('div');
        list.className = 'brush-tip-menu-list';
        menu.appendChild(list);

        var itemBtns = [];
        BRUSH_TIPS.forEach(function (t) {
            var it = document.createElement('button');
            it.type = 'button';
            it.className = 'brush-tip-item';
            it.dataset.tip = String(t.v);
            it.title = t.title;
            var g = document.createElement('span');
            g.className = 'brush-tip-item-glyph';
            g.textContent = t.glyph;
            var n = document.createElement('span');
            n.className = 'brush-tip-item-name';
            n.textContent = t.name;
            it.appendChild(g);
            it.appendChild(n);
            it.addEventListener('click', function () {
                // Same order as the drawer's tip row: a built-in tip dismisses
                // any custom shape override first, then commits.
                if (window.BrushShapes && window.BrushShapes.activeId()) window.BrushShapes.setActive(null);
                if (BrushTipCtl) { BrushTipCtl.setTip(t.v); BrushTipCtl.markDirty(); }
                closeMenu();
            });
            itemBtns.push(it);
            list.appendChild(it);
        });

        var shapesLabel = document.createElement('label');
        shapesLabel.className = 'brush-section-label';
        shapesLabel.textContent = 'Shapes';
        menu.appendChild(shapesLabel);

        var shapesRow = document.createElement('div');
        // brush-shapes-area is 32-file-drop's hook: dropping an image on the
        // menu's shapes row imports it, exactly as it does on the drawer's.
        shapesRow.className = 'brush-tip-row brush-shapes-row brush-shapes-area';
        menu.appendChild(shapesRow);

        function renderTiles() {
            renderShapeTiles(shapesRow, {
                onImport: function () {
                    closeMenu();  // the mask editor takes the screen from here
                    if (BrushTipCtl) BrushTipCtl.openImport();
                },
                onPick: closeMenu
            });
        }

        function positionMenu() {
            // Fixed left/top are read in the --ui-scale zoomed space: measure in
            // screen px, divide by zoom (same math as the arm-colors popup).
            var z = window.UIScale ? window.UIScale.get() : 1;
            var rect = btn.getBoundingClientRect();
            var w = 172;
            var left = rect.left + rect.width / 2 - (w * z) / 2;
            left = Math.max(4, Math.min(left, window.innerWidth - w * z - 4));
            menu.style.left = (left / z) + 'px';
            menu.style.top = ((rect.bottom + 4) / z) + 'px';
            menu.style.width = w + 'px';
            menu.style.maxHeight = Math.max(180, (window.innerHeight - rect.bottom - 16) / z) + 'px';
            menu.style.overflowY = 'auto';
        }

        function openMenu() {
            renderTiles();
            positionMenu();   // position BEFORE it paints
            menu.style.display = 'block';
            btn.classList.add('active');
        }
        function closeMenu() {
            menu.style.display = 'none';
            btn.classList.remove('active');
        }

        function refresh() {
            var entry = activeShapeEntry();
            var tip = (window.config && window.config.BRUSH_TIP) | 0;
            if (tip < 0 || tip >= BRUSH_TIPS.length) tip = 0;
            if (entry) {
                // A custom stamp overrides the built-in tip — show the stamp.
                face.textContent = '';
                face.style.backgroundImage = 'url("' + entry.dataURL + '")';
                btn.title = 'Brush tip: ' + entry.name + ' (custom shape) — click to change';
            } else {
                face.style.backgroundImage = '';
                face.textContent = BRUSH_TIPS[tip].glyph;
                btn.title = 'Brush tip: ' + BRUSH_TIPS[tip].name + ' — click to change';
            }
            itemBtns.forEach(function (b) {
                b.classList.toggle('active', !entry && parseInt(b.dataset.tip, 10) === tip);
            });
            if (menu.style.display !== 'none') renderTiles();
        }
        tipSwatchSync = refresh;

        // No stopPropagation on the swatch: letting the click bubble lets the
        // brush drawer's own outside-click closer retire the drawer, so the
        // two never sit stacked on top of each other.
        btn.addEventListener('click', function () {
            if (menu.style.display === 'none') openMenu(); else closeMenu();
        });
        document.addEventListener('click', function (e) {
            if (menu.style.display !== 'none' && !menu.contains(e.target)
                && e.target !== btn && !btn.contains(e.target)) closeMenu();
        });
        window.addEventListener('resize', function () {
            if (menu.style.display !== 'none') positionMenu();
        });

        refresh();
        return btn;
    }

    // ─── MIXER STRIP ─────────────────────────────────────────────
    function buildMixerStrip(controls) {
        const strip = document.createElement('div');
        strip.id = 'mixer-strip';

        // Channel faders for key controls
        // (renames 2026-07-29: 'Size'→'Brush Size' and 'Brush'→'Multi-Brush' —
        // the multiplier channel mirrors strokes across 1-8 arms, so
        // "Multi-Brush" says what it does; the brush-settings panel moved to
        // the Brush Size label, sliding in from the left.)
        var sizeChannel = faderChannel('Brush Size', 'orange', 'brushSize', null, 'mixer-brushValue');
        // The BRUSH SIZE label is the brush-settings trigger (D1): the everyday
        // brush controls (presets / target / tip / feel) live in a left slide-in
        // panel — too common to bury in the sidebar. The sidebar Brush section
        // keeps the rarer replay + splat-ramp controls.
        buildBrushPanel(sizeChannel.querySelector('.ch-label'));
        var sizeGear = makeChGear('Brush settings & presets');
        wireGearToTrigger(sizeGear, sizeChannel.querySelector('.ch-label'));
        sizeChannel.querySelector('.ch-header').appendChild(sizeGear);
        // The tip swatch rides the FADER row, not the header: tip and size are
        // the two halves of one answer to "what am I painting with", and the
        // header already carries the label, the value and the gear.
        var sizeFaderRow = sizeChannel.querySelector('.ch-fader');
        if (sizeFaderRow) {
            sizeFaderRow.appendChild(buildTipSwatch());
            sizeChannel.classList.add('ch-has-tip');   // buys the fader back its width
        }
        strip.appendChild(sizeChannel);

        var fluidChannel = faderChannel('Fluid', 'blue', 'curl', 'curlValue');
        // The Fluid gear opens the material picker (the disguised
        // #materialMode select). showPicker needs Chromium 121+; older
        // builds at least get focus so the arrow keys work.
        var fluidGear = makeChGear('Material mode — Fluid / Paint-Wet / Paint-Thick');
        fluidGear.addEventListener('click', function (e) {
            e.stopPropagation();
            var sel = document.getElementById('materialMode');
            if (!sel) return;
            if (typeof sel.showPicker === 'function') {
                try { sel.showPicker(); return; } catch (_) {}
            }
            sel.focus();
        });
        fluidChannel.querySelector('.ch-header').appendChild(fluidGear);
        strip.appendChild(fluidChannel);

        strip.appendChild(faderChannel('Viscosity', 'purple', 'sharpness', 'sharpnessValue'));
        strip.appendChild(faderChannel('Isolation', 'green', 'velocityInfluence', 'velocityInfluenceValue'));
        var brushChannel = faderChannel('Multi-Brush', 'yellow', 'multiplier', 'multiplierValue');
        // The multiplier value ("1x") IS the brush-colors trigger — click it to
        // open the per-arm brush color controls; the gear is the discoverable
        // second door to the same popup.
        // Query from the (detached) channel: faderChannel already re-parented
        // the value element, so document.getElementById would miss it here.
        buildArmColorsDropdown(brushChannel.querySelector('#multiplierValue'));
        var armGear = makeChGear('Multi-brush arm colors & symmetry');
        wireGearToTrigger(armGear, brushChannel.querySelector('#multiplierValue'));
        brushChannel.querySelector('.ch-header').appendChild(armGear);
        strip.appendChild(brushChannel);
        strip.appendChild(faderChannel('Time', 'pink', 'timeScale', 'timeScaleValue'));
        strip.appendChild(faderChannel('Density', 'cyan', 'densityDissipation', 'densityValue'));
        strip.appendChild(faderChannel('Velocity', 'cyan', 'velocityDissipation', 'velocityValue'));

        strip.appendChild(divider());

        // Color channel
        strip.appendChild(buildColorChannel());

        strip.appendChild(divider());

        // Quick actions
        strip.appendChild(buildActionsChannel(controls));

        strip.appendChild(divider());

        // Presets
        strip.appendChild(buildPresetsChannel(controls));

        return strip;
    }

    // Tooltips for mixer channels
    var CHANNEL_TOOLTIPS = {
        'Brush Size': 'Brush size for painting fluid — the ⚙ opens brush settings & presets',
        'Fluid': 'Material mode (Fluid / Paint-Wet / Paint-Thick) + amount — the ⚙ opens the material picker',
        'Viscosity': 'Sharpness/detail enhancement',
        'Isolation': 'Motion isolation - how much color follows velocity',
        'Multi-Brush': 'Brush arms (1-8x mirrored strokes) — the ⚙ opens arm colors & symmetry',
        'Time': 'Simulation time scale',
        'Density': 'How fast color fades',
        'Velocity': 'How fast motion fades',
        'Color': 'Current brush color'
    };

    // ── Perceptual fader curves (Density, Time) ──────────────────────────
    // Both faders were linear in a number whose PERCEIVED effect is not.
    //
    // Density is the per-frame decay base d, applied as pow(d, dt*60). What
    // you see is the dye's half-life, and that is hyperbolic in d:
    //
    //     d           0.85    0.95     0.99    0.993    0.999
    //     half-life   71ms    225ms    1.15s   1.6s     11.5s
    //
    // The bottom two thirds of the travel all read as "vanishes instantly",
    // everything usable is in the top ~18%, and all eight built-in presets
    // sit in the top ~7% (the 0.993 default lands at 92% of travel). Time is
    // a plain dt multiplier over 0.01–3, so everything below 1× — the half
    // people actually reach for — gets ~15% of the fader.
    //
    // The fix leaves the canonical <input> completely alone: same id, same
    // min/max/step, same stored value, same events, same registry entry. It
    // is hidden inside the channel and a visible proxy — deliberately NOT
    // registered in ParamRegistry, because the persistence format IS the
    // canonical element's value — maps fader position through the curve and
    // drives it with a dispatched 'input'. Presets, the multiplayer mirror,
    // COS, undo and save/load all still read the same element and cannot
    // tell the difference.
    //
    // Reflection runs one way only, FROM the canonical, via its 'input' plus
    // a poll: Ctrl+scroll and the COS oscillator both write .value with no
    // event at all, and if the proxy ever pushed back the two would fight.

    function curveCfg(key, fallback) {
        const v = (window.config || {})[key];
        return (typeof v === 'number' && isFinite(v)) ? v : fallback;
    }
    // The sim decays dye by pow(d, dt*60) per step, so a half-life of t
    // seconds is d = 0.5^(1/(60t)). Only meaningful below 1.
    function baseOfHalfLife(t) { return Math.exp(Math.log(0.5) / (60 * t)); }
    function halfLifeOfBase(d) { return Math.log(0.5) / (60 * Math.log(d)); }

    // Each curve maps fader fraction p ∈ [0,1] to the canonical value and
    // back. Ranges come from the element so the curve can never drift from
    // the DOM/registry pair the way a copied constant would.
    const FADER_CURVES = {
        densityDissipation: {
            toCanonical: function (p, el) {
                const a = curveCfg('DENSITY_FADER_HOLD_A', 0.86);
                const b = curveCfg('DENSITY_FADER_HOLD_B', 0.92);
                const lo = curveCfg('DENSITY_FADER_TAU_MIN', 0.12);
                const hi = curveCfg('DENSITY_FADER_TAU_MAX', 60);
                const max = parseFloat(el.max);
                if (p >= b) return 1 + (p - b) / (1 - b) * (max - 1);
                if (p >= a) return 1;                       // the detent
                return baseOfHalfLife(lo * Math.pow(hi / lo, p / a));
            },
            fromCanonical: function (v, el) {
                const a = curveCfg('DENSITY_FADER_HOLD_A', 0.86);
                const b = curveCfg('DENSITY_FADER_HOLD_B', 0.92);
                const lo = curveCfg('DENSITY_FADER_TAU_MIN', 0.12);
                const hi = curveCfg('DENSITY_FADER_TAU_MAX', 60);
                const max = parseFloat(el.max);
                if (v >= 1) return (v <= 1 || max <= 1) ? a : b + (v - 1) / (max - 1) * (1 - b);
                const tau = Math.min(hi, Math.max(lo, halfLifeOfBase(v)));
                return a * Math.log(tau / lo) / Math.log(hi / lo);
            }
        },
        timeScale: {
            toCanonical: function (p, el) {
                const a = curveCfg('TIME_FADER_HOLD_A', 0.70);
                const b = curveCfg('TIME_FADER_HOLD_B', 0.76);
                const lo = parseFloat(el.min), max = parseFloat(el.max);
                if (p >= b) return Math.pow(max, (p - b) / (1 - b));
                if (p >= a) return 1;                       // the detent
                return lo * Math.pow(1 / lo, p / a);
            },
            fromCanonical: function (v, el) {
                const a = curveCfg('TIME_FADER_HOLD_A', 0.70);
                const b = curveCfg('TIME_FADER_HOLD_B', 0.76);
                const lo = parseFloat(el.min), max = parseFloat(el.max);
                if (v >= 1) return (v <= 1 || max <= 1) ? a : b + Math.log(v) / Math.log(max) * (1 - b);
                return a * Math.log(Math.max(lo, v) / lo) / Math.log(1 / lo);
            }
        }
    };

    // Snap to the canonical's own grid, so the value the proxy computes is
    // byte-identical to the one the input would have stored anyway — the
    // round trip below depends on it.
    function quantizeTo(el, v) {
        const min = parseFloat(el.min), max = parseFloat(el.max);
        const step = parseFloat(el.step) || 0.0001;
        const snapped = min + Math.round((v - min) / step) * step;
        const dec = (String(el.step).split('.')[1] || '').length;
        return Math.min(max, Math.max(min, parseFloat(snapped.toFixed(dec))));
    }

    const _faderProxies = [];

    function attachPerceptualProxy(fader, canonical) {
        const curve = FADER_CURVES[canonical.id];
        if (!curve) return null;

        // The canonical keeps living inside .ch-fader — COS finds its host
        // with slider.closest('.ch-fader') and would lose its button if the
        // element moved elsewhere. Hiding it via a wrapper (rather than the
        // input itself) also hides the printed scale the slider updater
        // wraps around it, whenever it gets around to doing that.
        const vault = document.createElement('div');
        vault.className = 'ch-canonical';
        vault.style.display = 'none';
        vault.appendChild(canonical);
        fader.appendChild(vault);

        const proxy = document.createElement('input');
        proxy.type = 'range';
        proxy.min = 0; proxy.max = 1; proxy.step = 0.001;
        proxy.id = canonical.id + 'Perceptual';
        proxy.className = 'ch-perceptual';
        // A 0–1 scale would print numbers that mean nothing; the channel's
        // value readout already shows the real figure.
        proxy.dataset.noScale = '1';
        proxy.setAttribute('aria-label', canonical.id + ' (perceptual)');
        fader.appendChild(proxy);

        let selfWrite = false;
        proxy.addEventListener('input', function () {
            // Same gate the canonical sim sliders use: a multiplayer host
            // holding the settings lock owns these, and the proxy is a
            // second door into the same value.
            if (window.__mpSettingsLocked && !window.__mpApplyingRemote) {
                reflect();
                return;
            }
            const v = quantizeTo(canonical, curve.toCanonical(parseFloat(proxy.value), canonical));
            selfWrite = true;
            canonical.value = v;
            canonical.style.setProperty('--val', v);
            canonical.dispatchEvent(new Event('input', { bubbles: true }));
            selfWrite = false;
        });

        // Move the thumb to wherever the canonical actually is — but only if
        // it is not already showing that value. Without the tolerance test a
        // drag inside the detent (many fader positions, one canonical value)
        // would be yanked back to the detent's edge under the finger.
        function reflect() {
            if (selfWrite) return;
            const v = parseFloat(canonical.value);
            if (!isFinite(v)) return;
            const shown = quantizeTo(canonical, curve.toCanonical(parseFloat(proxy.value), canonical));
            const step = parseFloat(canonical.step) || 0.0001;
            if (Math.abs(shown - v) <= step * 0.5) return;
            const p = Math.min(1, Math.max(0, curve.fromCanonical(v, canonical)));
            proxy.value = p;
            proxy.style.setProperty('--val', p);
        }

        canonical.addEventListener('input', reflect);
        canonical.addEventListener('change', reflect);
        reflect();
        _faderProxies.push(reflect);
        return proxy;
    }

    // Ctrl+scroll and the COS oscillator write canonical.value directly with
    // no event, so an event listener alone would leave the thumb stale. One
    // shared low-rate poll covers every proxy.
    function startPerceptualFaderPoll() {
        if (window.__perceptualFaderPoll) return;
        window.__perceptualFaderPoll = setInterval(function () {
            for (let i = 0; i < _faderProxies.length; i++) _faderProxies[i]();
        }, 250);
    }

    // Console hook: re-seat every thumb after dialling the curve constants.
    window.refreshFaderCurves = function () {
        for (let i = 0; i < _faderProxies.length; i++) _faderProxies[i]();
        return _faderProxies.length + ' fader(s) re-seated';
    };

    function faderChannel(label, accent, sliderId, existingValueId, newValueId) {
        const ch = document.createElement('div');
        ch.className = 'mixer-channel';
        if (accent) ch.dataset.accent = accent;

        const slider = document.getElementById(sliderId);

        // Header row: label top-left, value top-right (above the slider).
        const head = document.createElement('div');
        head.className = 'ch-header';

        const lbl = document.createElement('div');
        lbl.className = 'ch-label';
        // The Fluid channel's LABEL is the material selector — one compact
        // widget in the row that already exists, rather than a second
        // control row above the fader.
        const matSel = (sliderId === 'curl') ? document.getElementById('materialMode') : null;
        if (matSel) {
            matSel.style.cssText = '';
            lbl.appendChild(matSel);
            // Re-fit the select to its text in the strip's font — deferred a
            // tick: the label is still detached, and computed styles on a
            // detached node measure with the wrong font.
            setTimeout(function () {
                if (window.MaterialModes && window.MaterialModes.resizeLabel) window.MaterialModes.resizeLabel();
            }, 0);
        } else {
            lbl.textContent = label;
        }
        if (CHANNEL_TOOLTIPS[label]) lbl.title = CHANNEL_TOOLTIPS[label];
        head.appendChild(lbl);

        let val = null;
        if (existingValueId) {
            val = document.getElementById(existingValueId);
            if (val) val.classList.add('ch-value');
        } else {
            val = document.createElement('div');
            val.className = 'ch-value';
            if (newValueId) val.id = newValueId;
            if (slider) val.textContent = fmtSlider(slider);
        }
        if (val) head.appendChild(val);

        ch.appendChild(head);

        if (slider) {
            const fader = document.createElement('div');
            fader.className = 'ch-fader';
            if (FADER_CURVES[sliderId]) {
                // Hides the canonical inside the channel and mounts the
                // perceptual proxy in its place.
                attachPerceptualProxy(fader, slider);
                startPerceptualFaderPoll();
            } else {
                fader.appendChild(slider);
            }
            ch.appendChild(fader);
        }

        return ch;
    }

    function buildColorChannel() {
        const ch = document.createElement('div');
        ch.className = 'mixer-channel ch-wide';
        ch.dataset.accent = 'pink';

        // The swatch sits INLINE with the mode switch instead of on a row of
        // its own: the colour channel was three stacked rows (label+swatch /
        // modes / ignite) and drove the strip's height.
        const picker = document.getElementById('colorPicker');

        // --- Toggle row: [Rnd|Cycle segmented switch] + gap + [Cap] ---
        // Rnd/Step/Rainbow are mutually exclusive -> ONE gapless segmented
        // switch; Gate is an independent toggle drawn separately with its own
        // border (design handoff Task 6: touching cells mean pick one,
        // separated cells mean pick any).
        var toggleRow = document.createElement('div');
        toggleRow.className = 'ch-toggle-row';

        var segWrap = document.createElement('div');
        segWrap.className = 'ch-seg-switch';
        toggleRow.appendChild(segWrap);

        var rnd = document.getElementById('randomColor');
        var stepEl = document.getElementById('stepPalette');

        // Enforce mutual exclusivity on load (stale settings may have both checked)
        if (rnd && stepEl && rnd.checked && stepEl.checked) {
            stepEl.checked = false;
        }

        // Rnd / Step / Rainbow are three VIEWS of the active brush's colour mode
        // (multiArmColors[0].mode). Each chip calls the controller in 05g;
        // syncBrushColorUI reflects the mode back onto them via data-brush-mode,
        // and keeps them in step with the Brush Colors panel's arm-0 row.
        function arm0Mode() {
            var a0 = (window.multiArmColors || [])[0];
            return a0 ? a0.mode : 'main';
        }
        function makeColorModeChip(labelText, modeKey, dataKey, title, initActive) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ch-text-toggle' + (initActive ? ' active' : '');
            btn.textContent = labelText;
            btn.dataset.brushMode = dataKey;
            if (title) btn.title = title;
            btn.addEventListener('click', function () {
                var next = (arm0Mode() === modeKey) ? 'fixed' : modeKey;
                if (typeof window.setActiveBrushColorMode === 'function') {
                    window.setActiveBrushColorMode(next);
                }
            });
            segWrap.appendChild(btn);
            return btn;
        }

        // Hidden native checkboxes stay in the DOM as derived reflections
        // (save/load, palette auto-step, updatePaletteStepIndicator read them).
        if (rnd) {
            rnd.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
            ch.appendChild(rnd);
            makeColorModeChip('Rnd', 'random', 'rnd', 'Random — a new colour each stroke',
                rnd.checked || arm0Mode() === 'random');
        }
        if (stepEl) {
            stepEl.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
            ch.appendChild(stepEl);
            // 'Palette' (renamed from 'Step' 2026-08-15, Gabriel's pick):
            // advances one palette colour per stroke. The mode key/checkbox
            // id stay 'step'; the carousel label became 'Palettes' to
            // disambiguate.
            makeColorModeChip('Palette', 'step', 'step', 'Palette mode — advance one palette colour each stroke',
                stepEl.checked || arm0Mode() === 'step');
        }
        // Rainbow chip removed 2026-08-15 (photosensitivity: a new random
        // colour every splat strobes while painting). Stale saved 'rainbow'
        // modes coerce to 'fixed' at every ingest (05g allowlist + 12's
        // preset/autoload sanitizers).

        // Cap Color chip (renamed from 'Gate' 2026-08-15 — user-test copy
        // pass; the id colorGate and all persisted keys stay). Independent of
        // Rnd/Cycle exclusivity: clamps dye at the stroke's own color so
        // repeated paint can't overflow into white.
        var gateEl = document.getElementById('colorGate');
        if (gateEl) {
            gateEl.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
            var gateBtn = document.createElement('button');
            gateBtn.type = 'button';
            gateBtn.className = 'ch-text-toggle ch-gate-toggle' + (gateEl.checked ? ' active' : '');
            gateBtn.textContent = 'Cap';
            gateBtn.title = 'Cap Color — lock the max at the stroke\'s original color so repeated strokes can\'t blow out to white';
            gateBtn.addEventListener('click', function () {
                gateEl.checked = !gateEl.checked;
                gateEl.dispatchEvent(new Event('change', { bubbles: true }));
                gateBtn.classList.toggle('active', gateEl.checked);
            });
            gateEl.addEventListener('change', function () {
                gateBtn.classList.toggle('active', gateEl.checked);
            });
            ch.appendChild(gateEl);
            toggleRow.appendChild(gateBtn);
        }

        ch.appendChild(toggleRow);

        // Ignite — momentary density nudge (window.DyeNudge, 05h). Not gated
        // on the Gate toggle: its reason to exist is someone parked at
        // Density 1.0 who wants a lift without touching the decay rate, and
        // that is true with or without the cap on.
        //
        // Hold-to-lock, the voice-memo gesture: pressing slides a padlock out
        // to the right, and releasing ON it latches Ignite on instead of
        // ending the hold. Releasing anywhere else is a normal release. The
        // long boosts this control is for are exactly the ones you do not
        // want to hold a mouse button down through.
        var nudgeRow = document.createElement('div');
        nudgeRow.className = 'ch-toggle-row ch-nudge-row';

        var igniteBtnColor = document.createElement('button');
        igniteBtnColor.type = 'button';
        igniteBtnColor.className = 'ch-text-toggle ch-nudge-btn';
        igniteBtnColor.textContent = '🔥 Ignite';
        igniteBtnColor.title = 'Hold to perk the fluid up — faded dye is pulled back to the colour it was '
            + 'painted at, past even the Cap Color limit. Slide right onto the lock to keep it on. '
            + 'Your density decay setting is untouched.';

        // Latch cell (Task 7): permanently visible so the second mode is
        // discoverable — a small indicator that is hollow when unlatched and
        // fills white-on-accent when latched. Click toggles the latch; the
        // old drag-onto-it gesture still arms it mid-hold.
        var igniteLock = document.createElement('div');
        igniteLock.className = 'ch-ignite-lock';
        igniteLock.title = 'Ignite latch — click to keep Ignite on hands-free';
        var igniteDot = document.createElement('span');
        igniteDot.className = 'ch-ignite-dot';
        igniteLock.appendChild(igniteDot);

        var igniteLocked = false, lockArmed = false, ignitePid = null;

        function igniteEngage() {
            if (window.DyeNudge) window.DyeNudge.press();
            igniteBtnColor.classList.add('active');
        }
        function igniteStop() {
            igniteLocked = false;
            if (window.DyeNudge) window.DyeNudge.release();
            igniteBtnColor.classList.remove('active', 'locked');
            nudgeRow.classList.remove('holding', 'armed');
            igniteLock.classList.remove('armed', 'latched');
        }
        function setArmed(v) {
            if (v === lockArmed) return;
            lockArmed = v;
            igniteLock.classList.toggle('armed', v);
            nudgeRow.classList.toggle('armed', v);
        }

        igniteBtnColor.addEventListener('pointerdown', function (e) {
            // While locked, a press is the way out — no new hold begins.
            if (igniteLocked) { igniteStop(); return; }
            e.preventDefault();
            ignitePid = e.pointerId;
            // Capture so the drag keeps reporting after the pointer leaves the
            // button; without it the lock target is unreachable by drag.
            try { igniteBtnColor.setPointerCapture(ignitePid); } catch (_) {}
            setArmed(false);
            nudgeRow.classList.add('holding');
            igniteEngage();
        });

        igniteBtnColor.addEventListener('pointermove', function (e) {
            if (ignitePid === null || igniteLocked) return;
            var r = igniteLock.getBoundingClientRect();
            // Generous vertical slop: the row is 16px tall and the gesture is
            // horizontal, so drifting off the top or bottom mid-slide should
            // not disarm.
            setArmed(e.clientX >= r.left && e.clientX <= r.right + 12
                  && e.clientY >= r.top - 14 && e.clientY <= r.bottom + 14);
        });

        function igniteRelease() {
            if (ignitePid === null) return;
            try { igniteBtnColor.releasePointerCapture(ignitePid); } catch (_) {}
            ignitePid = null;
            if (lockArmed) {
                // Latch: DyeNudge sustains for as long as release() is never
                // called, so locking is simply declining to release.
                igniteLocked = true;
                setArmed(false);
                igniteBtnColor.classList.add('locked');
                igniteLock.classList.add('latched');
                nudgeRow.classList.add('holding');
                return;
            }
            igniteStop();
        }
        igniteBtnColor.addEventListener('pointerup', igniteRelease);
        igniteBtnColor.addEventListener('pointercancel', igniteRelease);
        // The latch cell toggles: click latches Ignite on from idle (engage
        // and decline to release), click again unlatches. Mid-hold the button
        // owns the pointer, so releases there are handled by igniteRelease.
        igniteLock.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (igniteLocked) { igniteStop(); return; }
            if (ignitePid !== null) return;
            igniteEngage();
            igniteLocked = true;
            igniteBtnColor.classList.add('locked');
            igniteLock.classList.add('latched');
        });

        // The swatch leads the second row: row 1 is the four colour toggles
        // at a legible width, row 2 is swatch + Ignite + latch.
        if (picker) {
            picker.className = 'ch-color-input';
            picker.style.cssText = '';
            picker.title = 'Fluid colour — click to pick';
            nudgeRow.appendChild(picker);
        }
        nudgeRow.appendChild(igniteBtnColor);
        nudgeRow.appendChild(igniteLock);
        ch.appendChild(nudgeRow);

        return ch;
    }

    function buildActionsChannel(controls) {
        const wrap = document.createElement('div');
        wrap.className = 'mixer-actions';

        // Transport: pause + freeze are compact icon buttons sharing one row;
        // Clear spans the full width below. Two rows instead of three keeps the
        // block close to the fader height. Styling/state via .mixer-actions CSS.
        const transportRow = document.createElement('div');
        transportRow.className = 'transport-row';

        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.style.cssText = '';
            pauseBtn.textContent = '⏸';
            pauseBtn.title = 'Pause / resume simulation (Shift+Space)';
            transportRow.appendChild(pauseBtn);
        }

        const freezeBtn = document.getElementById('freezeBtn');
        if (freezeBtn) {
            freezeBtn.style.cssText = '';
            freezeBtn.textContent = '🛑';
            freezeBtn.title = 'Freeze / unfreeze fluid motion (Space)';
            transportRow.appendChild(freezeBtn);
        }

        wrap.appendChild(transportRow);

        const clearBtn = controls.querySelector('button[onclick*="clearCanvas"]');
        if (clearBtn) {
            clearBtn.style.cssText = '';
            clearBtn.textContent = 'Clear';
            clearBtn.title = 'Clear the canvas';
            wrap.appendChild(clearBtn);
        }

        return wrap;
    }

    // Presets as a select-style popup (Gabriel, 2026-07-29): one trigger in
    // the strip opens a vertical scrolling list of built-in + user presets,
    // with a sticky "+ New Preset" footer that can never scroll under the
    // fold (the old flex-wrap chip area hid it once presets multiplied).
    function buildPresetsChannel(controls) {
        const wrap = document.createElement('div');
        wrap.className = 'mixer-presets-channel';

        // Select-style trigger, shows the active preset name when one is set
        var trigger = document.createElement('button');
        trigger.id = 'mixerPresetsTrigger';
        trigger.className = 'mixer-presets-trigger';
        trigger.innerHTML = '<span class="mixer-presets-trigger-label">Presets</span><span class="mixer-presets-trigger-chev">▾</span>';
        trigger.title = 'Load or save presets';
        wrap.appendChild(trigger);
        var triggerLabel = trigger.querySelector('.mixer-presets-trigger-label');
        function setTriggerLabel(name) {
            triggerLabel.textContent = name || 'Presets';
            triggerLabel.classList.toggle('has-preset', !!name);
        }

        // Popup: header + scrollable list + sticky footer (footer is a
        // non-scrolling sibling of the list, so it is ALWAYS visible).
        var panel = document.createElement('div');
        panel.className = 'arm-colors-panel mixer-presets-panel';
        panel.style.display = 'none';
        panel.style.position = 'fixed';
        document.body.appendChild(panel);

        var header = document.createElement('div');
        header.className = 'arm-colors-header';
        header.textContent = 'Presets';
        panel.appendChild(header);

        var list = document.createElement('div');
        list.className = 'mixer-presets-list';
        panel.appendChild(list);

        // Move built-in preset buttons into the list; their inline
        // onclick="applyPreset('…')" IS the load handler, and keeping the
        // .mixer-preset-btn class keeps 04b updatePresetButtons highlighting.
        const presetsDiv = controls.querySelector('.presets');
        if (presetsDiv) {
            while (presetsDiv.firstChild) {
                var child = presetsDiv.firstChild;
                if (child.tagName === 'BUTTON') {
                    child.classList.add('mixer-preset-btn');
                    child.addEventListener('click', function (e) {
                        setTriggerLabel(e.currentTarget.textContent.trim());
                    });
                }
                list.appendChild(child);
            }
        }

        // Separator between built-in and user presets
        var sep = document.createElement('div');
        sep.className = 'preset-sep';
        list.appendChild(sep);

        // Container for dynamically rendered user presets
        var userWrap = document.createElement('div');
        userWrap.id = 'mixerUserPresets';
        userWrap.className = 'mixer-user-presets';
        list.appendChild(userWrap);

        // Sticky footer: "+ New Preset" + inline name input
        var footer = document.createElement('div');
        footer.className = 'mixer-presets-footer';
        panel.appendChild(footer);

        var saveBtn = document.createElement('button');
        saveBtn.className = 'mixer-preset-save';
        saveBtn.textContent = '+ New Preset';
        saveBtn.title = 'Save current settings as preset';
        footer.appendChild(saveBtn);

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'mixerPresetNameInput';
        nameInput.className = 'mixer-preset-name-input';
        nameInput.placeholder = 'Name...';
        nameInput.maxLength = 24;
        nameInput.spellcheck = false;
        nameInput.autocomplete = 'off';
        nameInput.style.display = 'none';
        footer.appendChild(nameInput);

        // Open/close (same idiom as the arm-colors popup)
        var PANEL_W = 210;
        function positionPanel() {
            var z = window.UIScale ? window.UIScale.get() : 1;
            var rect = trigger.getBoundingClientRect();
            var left = rect.left + rect.width / 2 - (PANEL_W * z) / 2;
            left = Math.max(4, Math.min(left, window.innerWidth - PANEL_W * z - 4));
            panel.style.left = (left / z) + 'px';
            panel.style.top = ((rect.bottom + 6) / z) + 'px';
            panel.style.width = PANEL_W + 'px';
        }
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'flex';
            trigger.classList.toggle('active', !open);
            if (!open) { positionPanel(); renderMixerUserPresets(); }
        });
        document.addEventListener('click', function (e) {
            if (panel.style.display !== 'none' && !panel.contains(e.target)
                && e.target !== trigger && !trigger.contains(e.target)) {
                panel.style.display = 'none';
                trigger.classList.remove('active');
            }
        });
        panel.addEventListener('click', function (e) { e.stopPropagation(); });
        window.addEventListener('resize', function () {
            if (panel.style.display !== 'none') positionPanel();
        });

        // Wire save flow
        saveBtn.addEventListener('click', function() {
            if (nameInput.style.display === 'none') {
                nameInput.style.display = '';
                nameInput.value = '';
                nameInput.focus();
                saveBtn.textContent = 'Save \u2713';
            } else {
                doSave();
            }
        });

        nameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); doSave(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelSave(); }
        });

        nameInput.addEventListener('blur', function() {
            // Small delay so click on saveBtn registers first
            setTimeout(function() {
                if (nameInput.style.display !== 'none' && !nameInput.value.trim()) {
                    cancelSave();
                }
            }, 200);
        });

        function cancelSave() {
            nameInput.style.display = 'none';
            nameInput.value = '';
            saveBtn.textContent = '+ New Preset';
        }

        function doSave() {
            var name = (nameInput.value || '').trim();
            if (!name) { cancelSave(); return; }
            if (!window.Settings) { cancelSave(); return; }
            var existing = window.Settings.getAllPresets();
            if (existing[name]) {
                nameInput.style.border = '1px solid #ff6b6b';
                nameInput.placeholder = 'Name exists!';
                nameInput.value = '';
                setTimeout(function() {
                    nameInput.style.border = '';
                    nameInput.placeholder = 'Name...';
                }, 1500);
                return;
            }
            var snapshot = typeof window.capturePresetSnapshot === 'function' ? window.capturePresetSnapshot() : null;
            if (!snapshot) { cancelSave(); return; }
            var ok = typeof window.saveUserPreset === 'function'
                ? window.saveUserPreset(name, snapshot)
                : window.Settings.savePreset(name, snapshot);
            cancelSave();
            if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
        }

        // Render user presets into the popup list (rows: load + delete)
        function renderMixerUserPresets() {
            if (!userWrap || !window.Settings) return;
            var presets = window.Settings.getAllPresets();
            var names = Object.keys(presets).sort(function(a, b) {
                return ((presets[b] && presets[b].timestamp) || 0) - ((presets[a] && presets[a].timestamp) || 0);
            });
            userWrap.innerHTML = '';
            names.forEach(function(name) {
                var row = document.createElement('div');
                row.className = 'mixer-user-preset-row';
                var btn = document.createElement('button');
                btn.className = 'mixer-user-preset-btn'; // styled in 20-mixer-strip.css
                btn.textContent = name;
                btn.title = 'Load "' + name + '"';
                btn.addEventListener('click', function() {
                    var snapshot = presets[name];
                    // Full-state apply — see 12-save-load: a preset click must
                    // land on a complete deterministic state.
                    if (snapshot && typeof window.applyPresetSnapshotFull === 'function') {
                        window.applyPresetSnapshotFull(snapshot);
                    } else if (snapshot && typeof window.applyPresetSnapshot === 'function') {
                        window.applyPresetSnapshot(snapshot);
                    }
                    // Built-in active state clears through the real state owner
                    // (04b activePreset), not a cosmetic class sweep.
                    if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
                    // Highlight this preset in BOTH user-preset surfaces
                    // (strip + sidebar list render the same presets).
                    document.querySelectorAll('.mixer-user-preset-btn, .user-preset-btn').forEach(function(b) {
                        b.classList.toggle('active', b.textContent === name);
                    });
                    setTriggerLabel(name);
                });
                row.appendChild(btn);
                var del = document.createElement('button');
                del.className = 'mixer-user-preset-delete';
                del.textContent = '×';
                del.title = 'Delete "' + name + '"';
                del.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (!confirm('Delete preset "' + name + '"?')) return;
                    window.Settings.deletePreset(name);
                    if (triggerLabel.textContent === name) setTriggerLabel(null);
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                });
                row.appendChild(del);
                userWrap.appendChild(row);
            });
        }

        // Initial render + expose for refresh
        setTimeout(renderMixerUserPresets, 500);
        window.renderMixerUserPresets = renderMixerUserPresets;

        return wrap;
    }

    // ─── SIDEBAR ─────────────────────────────────────────────────
    function buildSidebar(controls) {
        const sidebar = document.createElement('div');
        sidebar.id = 'sidebar-right';

        // Mobile close button (keep at top)
        moveEl('mobileMenuClose', sidebar);

        // Clustered into three colour groups (Gabriel, 2026-08-22). The nav had
        // 16 flat sections in 7 accent colours, which read as 16 unrelated
        // things. Colour is now the ONLY grouping signal — no group headings,
        // no icons, no emoji — so the three runs must stay contiguous here:
        // reordering a section across a run silently breaks the clustering.
        //   core       = what you paint with (the medium, and who is holding it)
        //   expressive = what it performs    (motion, sound, capture, show)
        //   system     = the app around it   (workspace, output, config)
        // No saved order exists — only per-section collapse state is persisted
        // (keyed by title), so reordering here applies to every user.
        sidebar.appendChild(buildMultiArtistSection());
        sidebar.appendChild(buildSimulationSection());
        sidebar.appendChild(buildColorsSection(controls));
        sidebar.appendChild(buildLayersSection(controls));
        sidebar.appendChild(buildMutationSection());

        sidebar.appendChild(buildRecordingSection());
        sidebar.appendChild(buildBrushSection());
        sidebar.appendChild(buildEffectsSection(controls));
        sidebar.appendChild(buildAnimationsSection(controls));
        sidebar.appendChild(buildAudioSection());
        sidebar.appendChild(buildKaleidoscopeSection(controls));
        sidebar.appendChild(buildBrandingSection());

        sidebar.appendChild(buildFocusSection());
        sidebar.appendChild(buildDisplaySection(controls));
        sidebar.appendChild(buildExportSection());
        sidebar.appendChild(buildSettingsSection(controls));

        stampGroupRows(sidebar);
        buildQualityUnderbar();

        return sidebar;
    }

    // Each group paints ONE gradient across all of its labels, and every label
    // shows only its own slice of it (see .section-title in css/21-sidebar.css).
    // That needs two numbers per section: how many rows the group has, and
    // which row this is. Stamped here rather than hardcoded so the slices stay
    // correct if the order above ever changes — get these wrong and the ramp
    // silently repeats or skips instead of reading as one surface.
    function stampGroupRows(sidebar) {
        const byGroup = {};
        sidebar.querySelectorAll('.sidebar-section[data-group]').forEach(function (sec) {
            (byGroup[sec.dataset.group] = byGroup[sec.dataset.group] || []).push(sec);
        });
        Object.keys(byGroup).forEach(function (key) {
            const run = byGroup[key];
            run.forEach(function (sec, i) {
                sec.style.setProperty('--rows', run.length);
                sec.style.setProperty('--i', i);
            });
        });
    }

    // UX-9.1 — quality underbar: a slim always-visible cluster pinned to the
    // top-right corner surfacing the two knobs users reach for most (Visual
    // Quality + Physics Detail), without opening the Simulation panel. v1 per
    // Gabriel: these two controls, top-right; de-band etc. stay in the panel.
    function buildQualityUnderbar() {
        if (document.getElementById('quality-underbar')) return;
        const bar = document.createElement('div');
        bar.id = 'quality-underbar';
        // Minimalist (After Effects): no external labels — each control is a
        // custom dropdown showing just its value; the label sits ABOVE the
        // options as a themeable list header on open (the native <optgroup>
        // popup can't be dark-themed in this build — white OS frame — so we
        // drive a hidden native <select> from a custom list instead).
        // Copy pass 2026-08-15: 'Visual Quality'/'Physics Detail' said
        // nothing. Honest names + a one-line mechanism caption in the open
        // list, and a permanent micro-label above each resting pill so the
        // two aren't just two unlabeled numbers at the bottom of the screen.
        [['visualResolution', 'Image Sharpness', 'Resolution of the paint itself — sharper costs GPU'],
         ['physicsResolution', 'Motion Detail', 'Resolution of the motion sim — finer swirls cost GPU']
        ].forEach(function (pair) {
            const sel = document.getElementById(pair[0]);
            if (sel) bar.appendChild(makeQubDropdown(sel, pair[1], pair[2]));
        });
        document.body.appendChild(bar);
        // Trim the right edge to #canvas-area's right — the drawing region's
        // edge, i.e. where the nav begins. canvas-area is left:0, so only its
        // WIDTH changes (sidebar resize / window / sim-res) and a ResizeObserver
        // on it catches every case; no fragile position tracking.
        const place = function () {
            const ca = document.getElementById('canvas-area');
            let right = 0;
            if (ca) {
                const r = ca.getBoundingClientRect();
                if (r.right > 1 && r.right < window.innerWidth - 1) right = Math.round(window.innerWidth - r.right);
            }
            bar.style.right = right + 'px';
        };
        requestAnimationFrame(place);
        setTimeout(place, 400);
        window.addEventListener('resize', place);
        if (window.ResizeObserver) {
            const ca = document.getElementById('canvas-area');
            if (ca) { try { new ResizeObserver(place).observe(ca); } catch (e) {} }
        }
    }

    // Custom themeable dropdown that drives a hidden native <select> (so all
    // existing change bindings + save/load keep working by id). Opens UPWARD
    // with a label header on top — the fix for the unstylable native popup.
    function makeQubDropdown(sel, labelText, captionText) {
        sel.classList.add('qub-native-hidden');
        const wrap = document.createElement('div');
        wrap.className = 'qub-dd';
        // Permanent micro-label above the resting pill — without it the bar
        // reads as two bare numbers ("2048 ▾ 512 ▾") with no clue which is
        // which until hover.
        const cap = document.createElement('div');
        cap.className = 'qub-dd-cap';
        cap.textContent = labelText;
        wrap.appendChild(cap);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qub-dd-btn';
        btn.title = captionText ? (labelText + ' — ' + captionText) : labelText;
        const val = document.createElement('span');
        val.className = 'qub-dd-val';
        btn.appendChild(val);
        btn.insertAdjacentHTML('beforeend', '<span class="qub-dd-chev">▾</span>');
        const list = document.createElement('div');
        list.className = 'qub-dd-list';
        const hdr = document.createElement('div');
        hdr.className = 'qub-dd-hdr';
        hdr.textContent = labelText;
        list.appendChild(hdr);
        if (captionText) {
            // One-line mechanism caption under the open-list header — the
            // custom list makes this possible where native <option> can't.
            const sub = document.createElement('div');
            sub.className = 'qub-dd-sub';
            sub.textContent = captionText;
            list.appendChild(sub);
        }

        const syncVal = function () {
            const o = sel.options[sel.selectedIndex];
            val.textContent = o ? o.text : '';
        };
        const rebuild = function () {
            Array.prototype.slice.call(list.querySelectorAll('.qub-dd-opt')).forEach(function (o) { o.remove(); });
            Array.prototype.forEach.call(sel.options, function (opt) {
                const o = document.createElement('div');
                o.className = 'qub-dd-opt' + (opt.selected ? ' sel' : '');
                o.textContent = opt.text;
                o.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (sel.value !== opt.value) {
                        sel.value = opt.value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    syncVal();
                    close();
                });
                list.appendChild(o);
            });
        };
        const onDoc = function (e) { if (!wrap.contains(e.target)) close(); };
        const close = function () {
            wrap.classList.remove('open');
            document.removeEventListener('mousedown', onDoc);
        };
        const open = function () {
            rebuild();
            wrap.classList.add('open');
            setTimeout(function () { document.addEventListener('mousedown', onDoc); }, 0);
        };
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            wrap.classList.contains('open') ? close() : open();
        });
        // Keep the button in sync if the select is driven from elsewhere.
        sel.addEventListener('change', syncVal);

        wrap.appendChild(btn);
        wrap.appendChild(list);
        wrap.appendChild(sel); // hidden state-holder stays in the DOM
        syncVal();
        return wrap;
    }

    // --- Section builders ---

    function buildMutationSection() {
        const { sec, body } = makeSection('Mutate shader', 'core', true);
        sec.id = 'mutation-section';

        // ── Controls row ──
        const controlsRow = document.createElement('div');
        controlsRow.className = 'mutation-controls';

        // Scope — a binary choice (engine contract: strictly 'basic'|'all'),
        // so a two-cell segmented toggle instead of a dropdown hiding two
        // options. The hidden native select stays as the state-holder:
        // getOptions() keeps reading #mutationScope by id, unchanged (the
        // codebase's established hidden-native-control pattern).
        const scopeWrap = document.createElement('div');
        scopeWrap.className = 'mutation-field';
        scopeWrap.innerHTML = '<label>Scope</label>';
        const scopeSel = document.createElement('select');
        scopeSel.id = 'mutationScope';
        scopeSel.innerHTML = '<option value="basic">Basic</option><option value="all">All</option>';
        scopeSel.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
        const scopeSeg = document.createElement('div');
        scopeSeg.className = 'ch-seg-switch mutation-scope-seg';
        [['basic', 'Basic', 'Mutate the everyday look params only'],
         ['all',   'All',   'Mutate everything mutable, including rarely-touched params']
        ].forEach(function (m) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ch-text-toggle' + (scopeSel.value === m[0] ? ' active' : '');
            b.textContent = m[1];
            b.title = m[2];
            b.addEventListener('click', function () {
                scopeSel.value = m[0];
                Array.prototype.forEach.call(
                    scopeSeg.querySelectorAll('.ch-text-toggle'),
                    function (x) { x.classList.remove('active'); });
                b.classList.add('active');
            });
            scopeSeg.appendChild(b);
        });
        scopeWrap.appendChild(scopeSeg);
        scopeWrap.appendChild(scopeSel);
        controlsRow.appendChild(scopeWrap);

        // Strength — a standard sidebar row (.control-group: sidebar
        // typography + the full-row drag forwarding, which the bespoke
        // .mutation-field row missed), shown as a percentage. data-no-scale
        // skips the auto-printed 0.05/0.53/1 stops — arbitrary-looking
        // numbers for a subjective subtle→wild control.
        const strWrap = document.createElement('div');
        strWrap.className = 'control-group';
        strWrap.innerHTML = '<label>Strength <span id="mutationStrengthVal" class="value-display">30%</span></label>';
        const strSlider = document.createElement('input');
        strSlider.type = 'range'; strSlider.id = 'mutationStrength';
        strSlider.min = '0.05'; strSlider.max = '1'; strSlider.step = '0.05'; strSlider.value = '0.3';
        strSlider.setAttribute('data-no-scale', '1');
        strSlider.title = 'How far each mutation may push a param — subtle nudges left, wild swings right';
        strSlider.addEventListener('input', function () {
            var disp = document.getElementById('mutationStrengthVal');
            if (disp) disp.textContent = Math.round(parseFloat(this.value) * 100) + '%';
        });
        strWrap.appendChild(strSlider);
        controlsRow.appendChild(strWrap);

        // Count
        const cntWrap = document.createElement('div');
        cntWrap.className = 'mutation-field';
        cntWrap.innerHTML = '<label>Variants</label>';
        const cntSel = document.createElement('select');
        cntSel.id = 'mutationCount';
        cntSel.innerHTML = '<option value="4">4</option><option value="6" selected>6</option><option value="9">9</option><option value="12">12</option>';
        cntWrap.appendChild(cntSel);
        controlsRow.appendChild(cntWrap);

        body.appendChild(controlsRow);

        // ── Action buttons ──
        const actionsRow = document.createElement('div');
        actionsRow.className = 'mutation-actions';

        const mutBtn = document.createElement('button');
        mutBtn.id = 'mutationGenerate';
        mutBtn.className = 'mutation-btn mutation-btn-primary';
        mutBtn.textContent = 'Mutate';

        const undoBtn = document.createElement('button');
        undoBtn.id = 'mutationUndo';
        undoBtn.className = 'mutation-btn';
        undoBtn.textContent = '← Undo';
        undoBtn.disabled = true;

        const redoBtn = document.createElement('button');
        redoBtn.id = 'mutationRedo';
        redoBtn.className = 'mutation-btn';
        redoBtn.textContent = 'Redo →';
        redoBtn.disabled = true;

        const resetBtn = document.createElement('button');
        resetBtn.id = 'mutationReset';
        resetBtn.className = 'mutation-btn';
        resetBtn.textContent = 'Reset';

        actionsRow.appendChild(mutBtn);
        actionsRow.appendChild(undoBtn);
        actionsRow.appendChild(redoBtn);
        actionsRow.appendChild(resetBtn);
        body.appendChild(actionsRow);

        // ── Lock toggles ──
        const lockRow = document.createElement('div');
        lockRow.className = 'mutation-locks';
        lockRow.innerHTML = '<label class="mutation-locks-label">Lock:</label>';
        var lockGroups = [
            { key: 'colors', label: 'Colors' },
            { key: 'kaleido', label: 'Kaleido' },
            { key: 'simulation', label: 'Sim' },
            { key: 'effects', label: 'Effects' },
            { key: 'animations', label: 'Anim' },
            { key: 'audio', label: 'Audio' }
        ];
        lockGroups.forEach(function (g) {
            var lbl = document.createElement('label');
            lbl.className = 'mutation-lock-chip';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.lockGroup = g.key;
            cb.className = 'mutation-lock-cb';
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(' ' + g.label));
            lockRow.appendChild(lbl);
        });
        body.appendChild(lockRow);

        // ── Variant grid ──
        const grid = document.createElement('div');
        grid.id = 'mutationGrid';
        grid.className = 'mutation-grid';
        grid.style.display = 'none';
        body.appendChild(grid);

        // ── Diff panel (shows changes for hovered/selected variant) ──
        const diffPanel = document.createElement('div');
        diffPanel.id = 'mutationDiff';
        diffPanel.className = 'mutation-diff';
        diffPanel.style.display = 'none';
        body.appendChild(diffPanel);

        // ── Chain breadcrumb ──
        const chainWrap = document.createElement('div');
        chainWrap.id = 'mutationChain';
        chainWrap.className = 'mutation-chain';
        body.appendChild(chainWrap);

        // ── Wire up logic ──
        // Pass button references directly to avoid getElementById issues.
        // No arbitrary delay: wireMutationUI already self-retries every
        // 100ms until its dependencies (mutation engine + snapshot fns)
        // exist — the old flat 200ms just added dead air (UI audit Stage 2).
        wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn);

        return sec;
    }

    function wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn) {
        // Self-retry until ALL dependencies exist (engine + snapshot fns) —
        // the engine check used to warn-and-die, silently leaving the panel
        // dead if load order ever shifted; now every path converges.
        var engine = window.mutationEngine;
        if (!engine || !window.capturePresetSnapshot || !window.applyPresetSnapshot) {
            setTimeout(function() { wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn); }, 100);
            return;
        }
        console.log('[Mutation] UI wired successfully');

        var _variants = [];
        var _baseSnapshot = null;

        // Lock group → parameter ID mapping
        var LOCK_GROUPS = {
            colors: ['color.background', 'color.brush', 'randomColor', 'stepPalette', 'palette'],
            kaleido: ['kaleidoToggle', 'kAnimateRot', 'kaleidoSegments', 'kAngle', 'kSpinSpeed',
                      'kTwist', 'kZoom', 'kBlend', 'kaleidoMode',
                      'kaleido.mode', 'kaleido.segments', 'kaleido.angle', 'kaleido.twist', 'kaleido.zoom', 'kaleido.blend'],
            simulation: ['densityDissipation', 'velocityDissipation', 'pressureDissipation',
                         'pressureIteration', 'curl', 'sharpness', 'multiplier',
                         'velocityInfluence', 'brushSize'],
            effects: ['enableLighting', 'enableLightShift', 'microDetailToggle',
                      'lightIntensity', 'lightAmbient', 'lightSpeed', 'clarity', 'vibrance',
                      'glowToggle', 'glowIntensity', 'glowThreshold',
                      'scatterToggle', 'scatterAmount', 'scatterReach', 'scatterSource', 'scatterBlockToggle',
                      'shadingIntensity', 'displayShadingToggle',
                      'lightShiftSpeed', 'lightShiftThreshold', 'lightShiftIntensity', 'lightShiftSaturation',
                      'lightPos', 'lightShiftPath'],
            animations: ['shootingStarToggle',
                         'ssFrequency', 'ssAngle', 'ssLength', 'ssSize', 'ssVariance', 'ssGravity', 'ssOrigin'],
            audio: ['audioReactToggle', 'arMapAutoSplat', 'arMapSize', 'arMapKaleido', 'arMapColor',
                    'audioSensitivity', 'audioBeatThreshold']
        };

        function getLockedParams() {
            var locks = {};
            document.querySelectorAll('.mutation-lock-cb:checked').forEach(function (cb) {
                var group = cb.dataset.lockGroup;
                if (LOCK_GROUPS[group]) {
                    LOCK_GROUPS[group].forEach(function (id) { locks[id] = true; });
                }
            });
            return locks;
        }

        function getOptions() {
            var scope = document.getElementById('mutationScope');
            var strength = document.getElementById('mutationStrength');
            return {
                scope: scope ? scope.value : 'basic',
                strength: strength ? parseFloat(strength.value) : 0.3,
                locks: getLockedParams()
            };
        }

        function getCount() {
            var el = document.getElementById('mutationCount');
            return el ? parseInt(el.value, 10) : 6;
        }

        // Generate variants
        function doMutate() {
            if (!window.capturePresetSnapshot) return;
            _baseSnapshot = window.capturePresetSnapshot();
            if (!_baseSnapshot) return;

            // Push base to chain if chain is empty
            if (engine.chain.length === 0) {
                engine.chain.push(_baseSnapshot, 'Origin');
            }

            var opts = getOptions();
            var count = getCount();
            _variants = engine.generateVariations(_baseSnapshot, count, opts);
            renderGrid();
        }

        // Render the variant grid
        function renderGrid() {
            var grid = document.getElementById('mutationGrid');
            if (!grid) return;
            grid.innerHTML = '';

            if (_variants.length === 0) {
                grid.style.display = 'none';
                grid.innerHTML = '';
                return;
            }
            grid.style.display = '';

            _variants.forEach(function (variant, idx) {
                var card = document.createElement('div');
                card.className = 'mutation-card';
                card.dataset.index = idx;

                // Color swatch preview
                var swatch = document.createElement('div');
                swatch.className = 'mutation-swatch';
                var bg = (variant.colors && variant.colors.background) || '#000';
                var br = (variant.colors && variant.colors.brush) || '#fff';
                swatch.style.background = 'linear-gradient(135deg, ' + bg + ' 50%, ' + br + ' 50%)';
                card.appendChild(swatch);

                // Summary label
                var label = document.createElement('div');
                label.className = 'mutation-card-label';
                var diff = engine.diffSummary(_baseSnapshot, variant);
                label.textContent = diff.length + ' change' + (diff.length !== 1 ? 's' : '');
                card.appendChild(label);

                // Key changes preview
                var preview = document.createElement('div');
                preview.className = 'mutation-card-preview';
                var topChanges = diff.slice(0, 3).map(function (d) {
                    if (d.type === 'color') return d.param.split('.')[1];
                    if (d.type === 'checkbox') return d.param;
                    return d.param + ' ' + (d.pct > 0 ? d.pct + '%' : '');
                });
                preview.textContent = topChanges.join(', ');
                card.appendChild(preview);

                // Click to apply
                card.addEventListener('click', function () {
                    applyVariant(idx);
                });

                grid.appendChild(card);
            });
        }

        // Apply a specific variant
        function applyVariant(idx) {
            var variant = _variants[idx];
            if (!variant || !window.applyPresetSnapshot) return;

            window.applyPresetSnapshot(variant);

            // Push to chain
            engine.chain.push(variant, 'Mutation ' + engine.chain.length);

            // Highlight selected card
            document.querySelectorAll('.mutation-card').forEach(function (c) {
                c.classList.toggle('mutation-card-active', parseInt(c.dataset.index, 10) === idx);
            });

            // Show diff
            showDiff(variant);

            // Update chain display
            renderChain();
            updateNavButtons();

            // Use this variant as new base for next mutation
            _baseSnapshot = variant;
        }

        // Show diff panel
        function showDiff(variant) {
            var panel = document.getElementById('mutationDiff');
            if (!panel || !_baseSnapshot) return;
            var diff = engine.diffSummary(_baseSnapshot, variant);
            if (diff.length === 0) {
                panel.style.display = 'none';
                return;
            }
            panel.style.display = 'block';
            var html = '<div class="mutation-diff-title">' + diff.length + ' parameter' + (diff.length !== 1 ? 's' : '') + ' changed:</div>';
            diff.forEach(function (d) {
                var from = d.type === 'color' ? '<span class="mutation-color-dot" style="background:' + d.from + '"></span>' :
                           d.type === 'checkbox' ? (d.from ? 'ON' : 'OFF') :
                           (typeof d.from === 'number' ? d.from.toFixed(3) : d.from);
                var to = d.type === 'color' ? '<span class="mutation-color-dot" style="background:' + d.to + '"></span>' :
                         d.type === 'checkbox' ? (d.to ? 'ON' : 'OFF') :
                         (typeof d.to === 'number' ? d.to.toFixed(3) : d.to);
                html += '<div class="mutation-diff-row"><span class="mutation-diff-param">' + d.param + '</span> ' + from + ' → ' + to + '</div>';
            });
            panel.innerHTML = html;
        }

        // Render chain breadcrumbs
        function renderChain() {
            var wrap = document.getElementById('mutationChain');
            if (!wrap) return;
            var entries = engine.chain.getAll();
            if (entries.length < 2) { wrap.innerHTML = ''; return; }

            wrap.innerHTML = '';
            entries.forEach(function (entry, i) {
                var crumb = document.createElement('span');
                crumb.className = 'mutation-crumb' + (entry.active ? ' mutation-crumb-active' : '');
                crumb.textContent = entry.label;
                crumb.title = new Date(entry.timestamp).toLocaleTimeString();
                crumb.addEventListener('click', function () {
                    var jumped = engine.chain.jump(i);
                    if (jumped && window.applyPresetSnapshot) {
                        window.applyPresetSnapshot(jumped.snapshot);
                        _baseSnapshot = jumped.snapshot;
                        _variants = [];
                        renderGrid();
                        renderChain();
                        updateNavButtons();
                    }
                });
                wrap.appendChild(crumb);
                if (i < entries.length - 1) {
                    var arrow = document.createElement('span');
                    arrow.className = 'mutation-crumb-arrow';
                    arrow.textContent = '→';
                    wrap.appendChild(arrow);
                }
            });
        }

        function updateNavButtons() {
            var undo = document.getElementById('mutationUndo');
            var redo = document.getElementById('mutationRedo');
            if (undo) undo.disabled = engine.chain.index <= 0;
            if (redo) redo.disabled = engine.chain.index >= engine.chain.length - 1;
        }

        // ── Button wiring (using passed references) ──
        if (mutBtn) {
            mutBtn.addEventListener('click', doMutate);
        }

        if (undoBtn) undoBtn.addEventListener('click', function () {
            var entry = engine.chain.back();
            if (entry && window.applyPresetSnapshot) {
                window.applyPresetSnapshot(entry.snapshot);
                _baseSnapshot = entry.snapshot;
                _variants = [];
                renderGrid();
                renderChain();
                updateNavButtons();
            }
        });

        if (redoBtn) redoBtn.addEventListener('click', function () {
            var entry = engine.chain.forward();
            if (entry && window.applyPresetSnapshot) {
                window.applyPresetSnapshot(entry.snapshot);
                _baseSnapshot = entry.snapshot;
                _variants = [];
                renderGrid();
                renderChain();
                updateNavButtons();
            }
        });

        if (resetBtn) resetBtn.addEventListener('click', function () {
            var first = engine.chain.length > 0 ? engine.chain.jump(0) : null;
            if (first && window.applyPresetSnapshot) {
                window.applyPresetSnapshot(first.snapshot);
                _baseSnapshot = first.snapshot;
            }
            engine.chain.clear();
            _variants = [];
            renderGrid();
            renderChain();
            updateNavButtons();
            var diff = document.getElementById('mutationDiff');
            if (diff) diff.style.display = 'none';
        });

        // Initial state
        renderGrid();
        console.log('[Mutation] UI wired');
    }

    function buildLayersSection(controls) {
        const { sec, body, header } = makeSection('Layers', 'core', true);
        sec.classList.add('section-layers');

        // Action buttons in header
        const actions = document.createElement('div');
        actions.className = 'section-header-actions';
        const captureBtn = document.getElementById('captureBtn');
        if (captureBtn) { captureBtn.style.cssText = 'font-size:11px;padding:3px 8px;'; captureBtn.textContent = 'Capture Layer'; actions.appendChild(captureBtn); }
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) { uploadBtn.style.cssText = ''; uploadBtn.textContent = '📁'; actions.appendChild(uploadBtn); }

        // Path layer button
        var pathBtn = document.createElement('button');
        pathBtn.type = 'button';
        pathBtn.textContent = '✏️';
        pathBtn.title = 'Add Path Layer';
        pathBtn.style.cssText = 'font-size:11px;padding:3px 6px;cursor:pointer;';
        pathBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (window.pathLayers) {
                window.pathLayers.create();
                window.pathLayers.render();
            }
        });
        actions.appendChild(pathBtn);

        // Collision layer button with source picker
        var collisionBtn = document.createElement('button');
        collisionBtn.type = 'button';
        collisionBtn.textContent = '🧱';
        collisionBtn.title = 'Add Collision Layer — pick a picture, cut the subject out, get a wall';
        collisionBtn.style.cssText = 'font-size:11px;padding:3px 6px;cursor:pointer;position:relative;';
        actions.appendChild(collisionBtn);

        var collisionMenu = document.createElement('div');
        collisionMenu.className = 'collision-source-menu';
        collisionMenu.style.display = 'none';
        // Both entries open the mask wizard on the picture (23-depth-collision
        // startFrom*), with step 3's collider hand-off pre-checked — the wall
        // comes from a mask the user cut, not from a depth guess.
        collisionMenu.innerHTML =
            '<button type="button" data-src="image">📁 From Image…</button>' +
            '<button type="button" data-src="snapshot">📸 From Canvas</button>';
        collisionBtn.appendChild(collisionMenu);

        var collisionFileInput = document.createElement('input');
        collisionFileInput.type = 'file';
        collisionFileInput.accept = 'image/png,image/jpeg,image/webp';
        collisionFileInput.style.display = 'none';
        body.appendChild(collisionFileInput);

        collisionBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            collisionMenu.style.display = collisionMenu.style.display === 'none' ? 'flex' : 'none';
        });

        collisionMenu.addEventListener('click', function (e) {
            e.stopPropagation();
            var src = e.target.dataset.src;
            if (!src) return;
            collisionMenu.style.display = 'none';

            if (src === 'image') {
                collisionFileInput.click();
            } else if (src === 'snapshot' && window.collisionLayers) {
                window.collisionLayers.startFromCanvas();
            }
        });

        collisionFileInput.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (file && window.collisionLayers) {
                window.collisionLayers.startFromImageFile(file);
            }
            collisionFileInput.value = '';
        });

        // Close menu on outside click
        document.addEventListener('click', function () { collisionMenu.style.display = 'none'; });

        // 7.2: action buttons belong in the section BODY, not the header —
        // the header stays title-only (matches the per-layer-item fix in 05k).
        actions.classList.add('layers-toolbar');
        body.appendChild(actions);

        moveEl('layersPanel', body);

        // Path Layers subsection
        var pathLayersSubsection = document.createElement('div');
        pathLayersSubsection.className = 'layers-subsection';
        var pathHeader = document.createElement('div');
        pathHeader.className = 'layers-subsection-header';
        pathHeader.innerHTML = '<span class="layers-subsection-title">✏️ Path Layers</span>';
        var newPathBtn = document.createElement('button');
        newPathBtn.type = 'button';
        newPathBtn.className = 'subsection-add-btn';
        newPathBtn.textContent = '+ New Path';
        newPathBtn.title = 'Create a new path layer';
        newPathBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (window.pathLayers) {
                window.pathLayers.create();
                window.pathLayers.render();
            }
        });
        pathHeader.appendChild(newPathBtn);
        pathLayersSubsection.appendChild(pathHeader);
        var pathList = document.createElement('div');
        pathList.id = 'pathLayersList';
        pathLayersSubsection.appendChild(pathList);
        body.appendChild(pathLayersSubsection);

        // Layer-related options, grouped instead of loose checkboxes
        var optsGroup = document.createElement('div');
        optsGroup.className = 'layers-options-group';
        optsGroup.innerHTML = '<div class="layers-options-title">Capture & Preview</div>';
        body.appendChild(optsGroup);
        moveCheckboxGroup('hoverCaptureToggle', optsGroup);
        moveCheckboxGroup('detachCaptureToggle', optsGroup);
        moveEl('imageUpload', body);

        const preview = document.getElementById('previewToggle');
        if (preview) {
            preview.style.display = 'none';
            var previewCb = document.createElement('div');
            previewCb.className = 'checkbox-group';
            previewCb.innerHTML = '<input type="checkbox" id="showPreviewLayersCb"><label for="showPreviewLayersCb">Show Preview Layers</label>';
            optsGroup.appendChild(previewCb);
            body.appendChild(preview);
            var cb = previewCb.querySelector('input');
            cb.addEventListener('change', function () {
                preview.style.display = cb.checked ? '' : 'none';
            });
        }

        // Initialize path layers UI after DOM is ready
        setTimeout(function() {
            if (window.pathLayers) {
                window.pathLayers.render();
            }
        }, 100);

        return sec;
    }

    function buildAnimationsSection(controls) {
        const { sec, body } = makeSection('Animations', 'expressive', true);

        const grid = document.createElement('div');
        grid.className = 'anim-grid';

        moveEl('smashBtn', grid);
        moveEl('jellyfishBtn', grid);

        const portraitBtn = controls.querySelector('button[onclick*="playPortraitAnimation"]');
        if (portraitBtn) { portraitBtn.style.cssText = ''; grid.appendChild(portraitBtn); }

        moveEl('vortexBtn', grid);
        moveEl('portalBtn', grid);
        moveEl('chimeraBtn', grid);

        body.appendChild(grid);

        // Toggle animations (full-width, with collapsible settings)
        moveEl('shootingStarWrap', body);

        return sec;
    }

    function buildKaleidoscopeSection(controls) {
        const { sec, body } = makeSection('Kaleidoscope', 'expressive', true);

        // Mandala Studio leads the section: it's the guided way in (it rigs
        // the raw controls below for you), so it should be the first thing
        // read. Its panel keeps the toggle+collapsible pattern rather than
        // being emptied, since it only applies while the mode is on.
        moveCheckboxGroup('mandalaToggle', body);
        const mandalaPanel = document.getElementById('mandalaPanel');
        if (mandalaPanel) body.appendChild(mandalaPanel);

        moveCheckboxGroup('kaleidoToggle', body);

        // Move contents from kaleidoscope panel
        const panel = document.getElementById('kaleidoPanel');
        if (panel) {
            while (panel.firstChild) {
                body.appendChild(panel.firstChild);
            }
        }

        return sec;
    }

    function buildSimulationSection() {
        const { sec, body } = makeSection('Simulation', 'core', true);

        // UX-9.1: Image Sharpness + Motion Detail live in the quality
        // underbar (buildQualityUnderbar) for always-visible quick access.
        moveControlGroup('fpsCap', body);
        moveControlGroup('pressureDissipation', body);
        moveControlGroup('pressureIteration', body);
        moveControlGroup('velocityCap', body);
        // P15-1 wetness: dry paint holds, wet paint flows (+ dry-time
        // half-life) — sim-behavior sliders, so they live here (moved out
        // of Effects per Gabriel 2026-07-23)
        moveControlGroup('wetInfluence', body);
        moveControlGroup('wetDrying', body);
        moveCheckboxGroup('macCormackToggle', body);
        moveCheckboxGroup('multigridToggle', body);
        // Multigrid tuning panel — same toggle+panel pattern as
        // microDetailPanel/glowPanel in the Effects section
        const multigridPanel = document.getElementById('multigridPanel');
        if (multigridPanel) body.appendChild(multigridPanel);

        return sec;
    }

    function buildEffectsSection(controls) {
        const { sec, body } = makeSection('Effects', 'expressive', true);

        // Curl-noise micro-swirl (dye advection wisps)
        moveControlGroup('swirl', body);
        // Sharpen kernel scale (coarse emboss at high values)
        moveControlGroup('ridges', body);

        // Surface shading (Pavel-style pseudo-normal lighting)
        moveCheckboxGroup('displayShadingToggle', body);
        moveEl('shadingIntensityGroup', body);

        moveCheckboxGroup('enableLighting', body);
        const lightControls = document.getElementById('lightSourceControls');
        if (lightControls) body.appendChild(lightControls);

        moveCheckboxGroup('enableLightShift', body);
        const shiftControls = document.getElementById('lightShiftControls');
        if (shiftControls) body.appendChild(shiftControls);

        // Micro Detail toggle + panel
        moveCheckboxGroup('microDetailToggle', body);
        const microDetailPanel = document.getElementById('microDetailPanel');
        if (microDetailPanel) body.appendChild(microDetailPanel);

        // Glow toggle + panel
        moveCheckboxGroup('glowToggle', body);
        const glowPanel = document.getElementById('glowPanel');
        if (glowPanel) body.appendChild(glowPanel);

        return sec;
    }

    function buildColorsSection(controls) {
        const { sec, body } = makeSection('Colors and palettes', 'core', true);

        // Color action buttons (Save / Clear)
        const colorActions = controls.querySelector('.color-actions');
        if (colorActions) body.appendChild(colorActions);

        // Saved colors swatch area
        moveEl('savedColors', body);

        // Step palette checkbox
        moveCheckboxGroup('stepPalette', body);

        // Palette management container
        const paletteCarousel = document.getElementById('paletteCarousel');
        if (paletteCarousel) {
            // Walk up to find the wrapper div
            let container = paletteCarousel.parentElement;
            if (container) body.appendChild(container);
        }

        return sec;
    }

    function buildDisplaySection(controls) {
        const { sec, body } = makeSection('Display', 'system', true);
        // Photosensitivity protection first — safety leads the section.
        moveCheckboxGroup('photoSafeToggle', body);

        // Window mode (Windowed / Borderless / Fullscreen) — first, because it
        // is the only way back out of a fullscreen mode.
        moveControlGroup('windowMode', body);

        // Move background color group (contains color picker + transparent toggle)
        const bgPicker = document.getElementById('backgroundColorPicker');
        if (bgPicker) {
            const group = bgPicker.closest('.control-group');
            if (group) { group.style.cssText = ''; body.appendChild(group); }
        }

        // Canvas opacity
        moveControlGroup('canvasOpacity', body);

        // Preserve fluid opacity
        moveCheckboxGroup('preserveFluidOpacity', body);

        // Background transparency
        moveControlGroup('captureDimming', body);

        // Toggles
        moveCheckboxGroup('cursorToggle', body);
        moveCheckboxGroup('showCanvasHandles', body);
        moveCheckboxGroup('lockCanvasBorders', body);
        moveCheckboxGroup('statsToggle', body);

        return sec;
    }

    function buildBrushSection() {
        // Everyday brush controls (target/tip/feel/presets) moved to the strip's
        // Brush dropdown (buildBrushPanel) 2026-07-16 — this section keeps the
        // rarer stroke-replay + splat-ramp machinery.
        const { sec, body } = makeSection('Stroke and replay', 'expressive', true);

        // --- Replay Mode ---
        var modeLabel = document.createElement('label');
        modeLabel.className = 'brush-section-label';
        modeLabel.textContent = 'Replay Mode';
        body.appendChild(modeLabel);

        var modeRow = document.createElement('div');
        modeRow.className = 'brush-mode-row';

        var strokeBtn = document.createElement('button');
        strokeBtn.type = 'button';
        strokeBtn.className = 'brush-mode-btn active';
        strokeBtn.textContent = 'Stroke';
        strokeBtn.dataset.mode = 'stroke';

        var timeBtn = document.createElement('button');
        timeBtn.type = 'button';
        timeBtn.className = 'brush-mode-btn';
        timeBtn.textContent = 'Time';
        timeBtn.dataset.mode = 'time';

        modeRow.appendChild(strokeBtn);
        modeRow.appendChild(timeBtn);
        body.appendChild(modeRow);

        // --- Time period input (visible only in time mode) ---
        var timeGroup = document.createElement('div');
        timeGroup.className = 'brush-time-group';
        timeGroup.style.display = 'none';

        var timeLbl = document.createElement('label');
        timeLbl.className = 'brush-section-label';
        timeLbl.textContent = 'Replay Period';

        var timeInputWrap = document.createElement('div');
        timeInputWrap.className = 'brush-time-input-wrap';

        var timeInput = document.createElement('input');
        timeInput.type = 'number';
        timeInput.id = 'replayTimePeriod';
        timeInput.min = '1';
        timeInput.max = '60';
        timeInput.value = '5';
        timeInput.step = '1';

        var timeSuffix = document.createElement('span');
        timeSuffix.className = 'brush-time-suffix';
        timeSuffix.textContent = 'sec';

        timeInputWrap.appendChild(timeInput);
        timeInputWrap.appendChild(timeSuffix);
        timeGroup.appendChild(timeLbl);
        timeGroup.appendChild(timeInputWrap);
        body.appendChild(timeGroup);

        // --- Replay Speed ---
        var speedGroup = document.createElement('div');
        speedGroup.className = 'control-group';

        var speedLbl = document.createElement('label');
        speedLbl.setAttribute('for', 'replaySpeed');
        speedLbl.innerHTML = 'Replay Speed <span class="value-display" id="replaySpeedValue">1×</span>';

        var speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.id = 'replaySpeed';
        speedSlider.min = '0.25';
        speedSlider.max = '4';
        speedSlider.value = '1';
        speedSlider.step = '0.25';

        speedGroup.appendChild(speedLbl);
        speedGroup.appendChild(speedSlider);
        body.appendChild(speedGroup);

        // "Replay uses current color" removed 2026-08-16. It handed the live
        // colour to the splat without exactColor, so the arm modes resolved on
        // top of it — and arm 0 sits in 'fixed' mode for anyone who has ever
        // touched the colour picker, which discarded the live colour entirely.
        // The checkbox therefore did nothing for most users, diverged what
        // recordings stored from what the painter saw, and on watchers (whose
        // pointer colour defaults to red until they paint) could repaint peer
        // replays red. Faithful replay is now the only behaviour.

        // --- Splat In ---
        var splatInLabel = document.createElement('label');
        splatInLabel.className = 'brush-section-label';
        splatInLabel.textContent = 'Splat In';
        body.appendChild(splatInLabel);

        var splatInSelect = document.createElement('select');
        splatInSelect.id = 'splatInMode';
        splatInSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,200,100,0.3);color:white;border-radius:4px;margin-bottom:6px;';
        [['instant','Instant'],['linear','Linear'],['easing','Easing'],['time','Over time']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0]; o.textContent = opt[1];
            splatInSelect.appendChild(o);
        });
        body.appendChild(splatInSelect);

        // Ramp-distance slider (how far the brush travels before reaching full
        // size). Built by a small helper shared by in/out.
        // Ramp cap raised 0.5 -> 2.0 canvas-widths (2026-08-16): a fast stroke
        // crossed half a canvas width in ~200ms, so even "Easing" read as
        // instant — the range simply could not express a gradual entrance.
        // Step 0.01 -> 0.005 for finer control near the short end, where most
        // of the useful settings live. Neither value is a registry param and
        // snapshots apply them unclamped, so widening cannot invalidate
        // anything already saved.
        function makeRampRow(id, getDist) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:-2px 0 8px;';
            var lab = document.createElement('span');
            lab.textContent = 'Ramp';
            lab.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.45);min-width:30px;';
            var slider = document.createElement('input');
            slider.type = 'range'; slider.id = id;
            slider.min = '0'; slider.max = '2'; slider.step = '0.005';
            slider.value = String(getDist());
            slider.style.cssText = 'flex:1;min-width:0;';
            var val = document.createElement('span');
            val.style.cssText = 'font-size:10px;font-family:monospace;color:#f2f3f5;min-width:38px;text-align:right;';
            val.textContent = fmtRamp(parseFloat(slider.value));
            row.appendChild(lab); row.appendChild(slider); row.appendChild(val);
            return { row: row, slider: slider, val: val };
        }
        // Sub-1% settings are usable now that the step is 0.005, so the readout
        // needs a decimal down there or several distinct values all read "1%".
        function fmtRamp(v) {
            var pct = v * 100;
            return (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '%';
        }
        var inRamp = makeRampRow('splatInDist', function () { return window.splatInDist != null ? window.splatInDist : 0.15; });
        body.appendChild(inRamp.row);

        // --- Splat Out ---
        var splatOutLabel = document.createElement('label');
        splatOutLabel.className = 'brush-section-label';
        splatOutLabel.textContent = 'Splat Out';
        body.appendChild(splatOutLabel);

        var splatOutSelect = document.createElement('select');
        splatOutSelect.id = 'splatOutMode';
        splatOutSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,200,100,0.3);color:white;border-radius:4px;margin-bottom:6px;';
        [['instant','Instant'],['linear','Linear'],['easing','Easing'],['time','Over time']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0]; o.textContent = opt[1];
            splatOutSelect.appendChild(o);
        });
        body.appendChild(splatOutSelect);

        var outRamp = makeRampRow('splatOutDist', function () { return window.splatOutDist != null ? window.splatOutDist : 0.15; });
        body.appendChild(outRamp.row);

        // --- Wire splat in/out ---
        // One row, two meanings: the distance modes ramp over TRAVEL (a % of
        // canvas width) and "Over time" ramps over SECONDS, so the row retargets
        // itself rather than adding a second slider that is dead half the time.
        // It stays dimmed and disabled for Instant, which has nothing to ramp.
        function rampSpec(mode) {
            return (mode === 'time')
                ? { label: 'Time', min: '0.05', max: '3', step: '0.05' }
                : { label: 'Ramp', min: '0',    max: '2', step: '0.005' };
        }
        function fmtSecs(v) { return (v < 1 ? Math.round(v * 1000) + 'ms' : v.toFixed(2) + 's'); }
        function syncRamp(ramp, sel, kind) {
            var mode = sel.value;
            var on = mode !== 'instant';
            ramp.row.style.opacity = on ? '1' : '0.4';
            ramp.slider.disabled = !on;
            var spec = rampSpec(mode);
            ramp.row.firstChild.textContent = spec.label;
            ramp.slider.min = spec.min; ramp.slider.max = spec.max; ramp.slider.step = spec.step;
            if (mode === 'time') {
                var ms = (kind === 'in' ? window.splatInMs : window.splatOutMs);
                if (typeof ms !== 'number') ms = 350;
                ramp.slider.value = String(ms / 1000);
                ramp.val.textContent = fmtSecs(ms / 1000);
            } else {
                var d = (kind === 'in' ? window.splatInDist : window.splatOutDist);
                if (typeof d !== 'number') d = 0.15;
                ramp.slider.value = String(d);
                ramp.val.textContent = fmtRamp(d);
            }
            // The fill is painted from a CSS var that only tracks input/change,
            // so a programmatic min/max/value swap leaves it stale.
            ramp.slider.style.setProperty('--min', ramp.slider.min);
            ramp.slider.style.setProperty('--max', ramp.slider.max);
            ramp.slider.style.setProperty('--val', ramp.slider.value);
        }
        splatInSelect.addEventListener('change', function() {
            window.splatInMode = splatInSelect.value;
            syncRamp(inRamp, splatInSelect, 'in');
            try { if (window.settingsManager) window.settingsManager.set('brush.splatInMode', splatInSelect.value); } catch(_) {}
        });
        splatOutSelect.addEventListener('change', function() {
            window.splatOutMode = splatOutSelect.value;
            syncRamp(outRamp, splatOutSelect, 'out');
            try { if (window.settingsManager) window.settingsManager.set('brush.splatOutMode', splatOutSelect.value); } catch(_) {}
        });
        inRamp.slider.addEventListener('input', function() {
            var v = parseFloat(inRamp.slider.value);
            if (splatInSelect.value === 'time') {
                window.splatInMs = v * 1000;
                inRamp.val.textContent = fmtSecs(v);
                try { if (window.settingsManager) window.settingsManager.set('brush.splatInMs', window.splatInMs); } catch(_) {}
            } else {
                window.splatInDist = v;
                inRamp.val.textContent = fmtRamp(v);
                try { if (window.settingsManager) window.settingsManager.set('brush.splatInDist', v); } catch(_) {}
            }
        });
        outRamp.slider.addEventListener('input', function() {
            var v = parseFloat(outRamp.slider.value);
            if (splatOutSelect.value === 'time') {
                window.splatOutMs = v * 1000;
                outRamp.val.textContent = fmtSecs(v);
                try { if (window.settingsManager) window.settingsManager.set('brush.splatOutMs', window.splatOutMs); } catch(_) {}
            } else {
                window.splatOutDist = v;
                outRamp.val.textContent = fmtRamp(v);
                try { if (window.settingsManager) window.settingsManager.set('brush.splatOutDist', v); } catch(_) {}
            }
        });

        // --- Wire mode toggle ---
        function setMode(mode) {
            window.replayMode = mode;
            strokeBtn.classList.toggle('active', mode === 'stroke');
            timeBtn.classList.toggle('active', mode === 'time');
            timeGroup.style.display = mode === 'time' ? '' : 'none';
            try {
                if (window.settingsManager) window.settingsManager.set('brush.replayMode', mode);
            } catch (_) {}
        }

        strokeBtn.addEventListener('click', function () { setMode('stroke'); });
        timeBtn.addEventListener('click', function () { setMode('time'); });

        // --- Wire time period ---
        timeInput.addEventListener('change', function () {
            var v = Math.max(1, Math.min(60, parseInt(timeInput.value, 10) || 5));
            timeInput.value = v;
            window.replayTimePeriod = v;
            try {
                if (window.settingsManager) window.settingsManager.set('brush.replayTimePeriod', v);
            } catch (_) {}
        });

        // --- Wire replay speed ---
        var speedDisplay = speedLbl.querySelector('.value-display');
        speedSlider.addEventListener('input', function () {
            var v = parseFloat(speedSlider.value);
            window.replaySpeed = v;
            if (speedDisplay) speedDisplay.textContent = v.toFixed(2).replace(/\.?0+$/, '') + '×';
            try {
                if (window.settingsManager) window.settingsManager.set('brush.replaySpeed', v);
            } catch (_) {}
        });

        // --- Load saved settings ---
        try {
            if (window.settingsManager) {
                var savedMode = window.settingsManager.get('brush.replayMode');
                if (savedMode === 'time') setMode('time'); else setMode('stroke');

                var savedPeriod = window.settingsManager.get('brush.replayTimePeriod');
                if (typeof savedPeriod === 'number' && savedPeriod >= 1) {
                    timeInput.value = savedPeriod;
                    window.replayTimePeriod = savedPeriod;
                }

                var savedSpeed = window.settingsManager.get('brush.replaySpeed');
                if (typeof savedSpeed === 'number') {
                    speedSlider.value = savedSpeed;
                    window.replaySpeed = savedSpeed;
                    if (speedDisplay) speedDisplay.textContent = savedSpeed.toFixed(2).replace(/\.?0+$/, '') + '×';
                }

                var savedSplatIn = window.settingsManager.get('brush.splatInMode');
                if (savedSplatIn) {
                    splatInSelect.value = savedSplatIn;
                    window.splatInMode = savedSplatIn;
                }
                var savedSplatOut = window.settingsManager.get('brush.splatOutMode');
                if (savedSplatOut) {
                    splatOutSelect.value = savedSplatOut;
                    window.splatOutMode = savedSplatOut;
                }
                // Values only — syncRamp below points the row at whichever of
                // these the restored mode actually uses.
                var savedInDist = window.settingsManager.get('brush.splatInDist');
                if (typeof savedInDist === 'number') window.splatInDist = savedInDist;
                var savedOutDist = window.settingsManager.get('brush.splatOutDist');
                if (typeof savedOutDist === 'number') window.splatOutDist = savedOutDist;
                var savedInMs = window.settingsManager.get('brush.splatInMs');
                if (typeof savedInMs === 'number') window.splatInMs = savedInMs;
                var savedOutMs = window.settingsManager.get('brush.splatOutMs');
                if (typeof savedOutMs === 'number') window.splatOutMs = savedOutMs;
            }
        } catch (_) {}
        // Point each ramp row at its mode's units and reflect the restored value
        syncRamp(inRamp, splatInSelect, 'in');
        syncRamp(outRamp, splatOutSelect, 'out');

        // Defaults
        if (!window.replayMode) window.replayMode = 'stroke';
        if (!window.replayTimePeriod) window.replayTimePeriod = 5;
        if (!window.splatInMode) window.splatInMode = 'instant';
        if (!window.splatOutMode) window.splatOutMode = 'instant';

        return sec;
    }

    // ─── BRUSH PANEL (D1) ────────────────────────────────────────────
    // The everyday brush controls in a dropdown off the strip's Brush
    // channel LABEL (the value stays the arm-colors trigger). Built
    // eagerly so saved settings restore at startup, shown on demand.
    // Controls keep their legacy element ids + 'brush.*' settings keys,
    // so values saved when they lived in the sidebar migrate untouched.
    function buildBrushPanel(trigger) {
        if (!trigger) return;
        trigger.classList.add('brush-trigger');
        var chev = document.createElement('span');
        chev.className = 'brush-trigger-chev';
        chev.textContent = '▸'; // panel slides in from the left edge
        trigger.appendChild(chev);

        var panel = document.createElement('div');
        panel.className = 'arm-colors-panel brush-settings-panel slide-left';
        panel.style.position = 'fixed';
        document.body.appendChild(panel);

        var PANEL_W = 252;
        function positionPanel() {
            // Left-edge drawer: pinned to x=0, top aligned under the strip row
            // the trigger lives in. Zoomed via --ui-scale: compute in screen
            // px, divide by zoom (same math as the arm-colors panel).
            var z = window.UIScale ? window.UIScale.get() : 1;
            var strip = document.getElementById('mixer-strip');
            var rect = (strip || trigger).getBoundingClientRect();
            panel.style.left = '0px';
            panel.style.top = ((rect.bottom + 6) / z) + 'px';
            panel.style.width = PANEL_W + 'px';
            // The panel outgrew short viewports (shapes row, splat-mode row):
            // cap it to the space under the strip and scroll the overflow.
            panel.style.maxHeight = Math.max(200, (window.innerHeight - rect.bottom - 18) / z) + 'px';
            panel.style.overflowY = 'auto';
        }

        var header = document.createElement('div');
        header.className = 'arm-colors-header';
        header.textContent = 'Brush';
        panel.appendChild(header);

        function num(v, d) { return typeof v === 'number' ? v : d; }
        function pct(v) { return Math.round(v * 100) + '%'; }
        // Sub-5% values show one decimal — the Spacing slider's low end goes
        // to 0.1%, which plain pct() would round to a flat 0%.
        function pctFine(v) { return v < 0.05 ? (v * 100).toFixed(1) + '%' : Math.round(v * 100) + '%'; }

        // Manual tweaks diverge from the applied preset → clear the chip
        // highlight. Preset apply drives the same handlers, so it flags
        // itself to keep its own highlight.
        var applyingPreset = false;
        function markDirty() {
            if (applyingPreset) return;
            panel.querySelectorAll('.brush-preset-btn.active').forEach(function (b) {
                b.classList.remove('active');
            });
        }

        // Setter registry: preset apply drives every control through the
        // same commit path as user input (config + persist + display).
        var SETTERS = {};

        function sLabel(text) {
            var l = document.createElement('label');
            l.className = 'brush-section-label';
            l.textContent = text;
            panel.appendChild(l);
        }

        function pSlider(id, label, min, max, step, key, fmt, presetKey) {
            var group = document.createElement('div');
            group.className = 'control-group';
            var lbl = document.createElement('label');
            lbl.setAttribute('for', id);
            lbl.innerHTML = label + ' <span class="value-display" id="' + id + 'Value"></span>';
            var slider = document.createElement('input');
            slider.type = 'range'; slider.id = id;
            slider.min = String(min); slider.max = String(max); slider.step = String(step);
            var cur = (window.config && typeof window.config[key] === 'number') ? window.config[key] : min;
            try {
                var saved = window.settingsManager && window.settingsManager.get('brush.' + id);
                if (typeof saved === 'number') { cur = saved; if (window.config) window.config[key] = saved; }
            } catch (_) {}
            slider.value = String(cur);
            var disp = lbl.querySelector('.value-display');
            disp.textContent = fmt(cur);
            function commit(v) {
                if (window.config) window.config[key] = v;
                disp.textContent = fmt(v);
                try { if (window.settingsManager) window.settingsManager.set('brush.' + id, v); } catch (_) {}
            }
            slider.addEventListener('input', function () {
                commit(parseFloat(slider.value));
                markDirty();
            });
            if (presetKey) SETTERS[presetKey] = function (v) {
                if (typeof v !== 'number') return;
                v = Math.max(min, Math.min(max, v));
                slider.value = String(v);
                commit(v);
            };
            group.appendChild(lbl); group.appendChild(slider);
            panel.appendChild(group);
            return group;
        }

        function pCheckbox(id, label, key, presetKey) {
            var row = document.createElement('div');
            row.className = 'control-group checkbox-group';
            var cb = document.createElement('input');
            cb.type = 'checkbox'; cb.id = id;
            var on = !!(window.config && window.config[key]);
            try {
                var saved = window.settingsManager && window.settingsManager.get('brush.' + id);
                if (typeof saved === 'boolean') { on = saved; if (window.config) window.config[key] = saved; }
            } catch (_) {}
            cb.checked = on;
            var lbl = document.createElement('label');
            lbl.setAttribute('for', id);
            lbl.style.margin = '0';
            lbl.textContent = label;
            function commit(v) {
                cb.checked = v;
                if (window.config) window.config[key] = v;
                try { if (window.settingsManager) window.settingsManager.set('brush.' + id, v); } catch (_) {}
            }
            cb.addEventListener('change', function () { commit(cb.checked); markDirty(); });
            if (presetKey) SETTERS[presetKey] = function (v) { if (typeof v === 'boolean') commit(v); };
            row.appendChild(cb); row.appendChild(lbl);
            panel.appendChild(row);
            return row;
        }

        // ── Presets: named brush states, quick-switch chips ──
        var chipsWrap = document.createElement('div');
        chipsWrap.className = 'brush-presets-chips';
        panel.appendChild(chipsWrap);

        var saveRow = document.createElement('div');
        saveRow.className = 'brush-presets-save-row';
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'mixer-preset-save';
        saveBtn.textContent = 'Brush Preset +';
        saveBtn.title = 'Save the current brush as a preset';
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'mixer-preset-name-input';
        nameInput.placeholder = 'Brush name...';
        nameInput.maxLength = 24;
        nameInput.spellcheck = false;
        nameInput.autocomplete = 'off';
        nameInput.style.display = 'none';
        saveRow.appendChild(saveBtn);
        saveRow.appendChild(nameInput);
        panel.appendChild(saveRow);

        function loadBrushPresets() {
            try {
                var arr = window.settingsManager && window.settingsManager.get('brush.presets');
                return Array.isArray(arr) ? arr : [];
            } catch (_) { return []; }
        }
        function storeBrushPresets(list) {
            try { if (window.settingsManager) window.settingsManager.set('brush.presets', list); } catch (_) {}
        }
        function captureBrushPreset(name) {
            var c = window.config || {};
            var sizeSlider = document.getElementById('brushSize');
            return {
                name: name,
                size: sizeSlider ? parseFloat(sizeSlider.value) : num(c.SPLAT_RADIUS, 0.011) * 1000,
                target: (c.BRUSH_TARGET === 'sketch' || c.BRUSH_TARGET === 'mask') ? c.BRUSH_TARGET : 'fluid',
                eraser: !!c.BRUSH_ERASER,
                tip: c.BRUSH_TIP | 0,
                tipTexture: num(c.BRUSH_TIP_TEXTURE, 0.7),
                angle: num(c.BRUSH_ANGLE, 0),
                flow: num(c.BRUSH_FLOW, 1),
                hardness: num(c.BRUSH_HARDNESS, 0.8),
                stabilizer: num(c.BRUSH_STABILIZER, 0),
                spacing: num(c.BRUSH_SPACING, 0.35),
                jitter: num(c.BRUSH_JITTER, 0),
                splatMode: c.BRUSH_CONTINUOUS ? 'constant' : 'move',
                shape: (window.BrushShapes && window.BrushShapes.activeId()) || null
            };
        }
        function applyBrushPreset(p) {
            applyingPreset = true;
            try {
                if (typeof p.size === 'number') {
                    // The Size fader owns SPLAT_RADIUS — drive it like a user
                    // drag so 05h's binding and the strip display both update.
                    var s = document.getElementById('brushSize');
                    if (s) {
                        var v = Math.max(parseFloat(s.min), Math.min(parseFloat(s.max), p.size));
                        s.value = v;
                        s.style.setProperty('--val', s.value);
                        s.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                if (SETTERS.target) SETTERS.target(p.target);
                if (SETTERS.tip) SETTERS.tip(p.tip | 0);
                ['tipTexture', 'angle', 'flow', 'hardness', 'stabilizer', 'spacing', 'jitter',
                 'eraser', 'splatMode', 'shape'
                ].forEach(function (k) {
                    if (SETTERS[k] && p[k] !== undefined) SETTERS[k](p[k]);
                });
                // Migration defaults: presets saved before the splat-mode /
                // custom-shape controls existed carry neither key — they were
                // authored with On-Move + no shape, so applying them must
                // reset both or the current shape/Constant mode silently
                // overrides the preset's brush.
                if (p.splatMode === undefined && SETTERS.splatMode) SETTERS.splatMode('move');
                if (p.shape === undefined && SETTERS.shape) SETTERS.shape(null);
            } finally { applyingPreset = false; }
        }
        // D7-1: let a .fluid project import refresh the brush-preset chips.
        window.__refreshBrushPresets = function () { try { renderPresetChips(); } catch (_) {} };
        function renderPresetChips() {
            chipsWrap.innerHTML = '';
            var list = loadBrushPresets();
            // (empty state intentionally renders nothing — the helper text
            // added a scrollbar's worth of height for most screens)
            if (!list.length) return;
            list.forEach(function (p) {
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'brush-preset-btn' + (p.eraser ? ' eraser' : '');
                chip.textContent = p.name;
                chip.title = 'Load brush "' + p.name + '"' + (p.eraser ? ' (eraser)' : '');
                var del = document.createElement('span');
                del.className = 'brush-preset-del';
                del.textContent = '×';
                del.title = 'Delete "' + p.name + '"';
                del.addEventListener('click', function (e) {
                    e.stopPropagation();
                    storeBrushPresets(loadBrushPresets().filter(function (q) { return q.name !== p.name; }));
                    renderPresetChips();
                });
                chip.appendChild(del);
                chip.addEventListener('click', function () {
                    applyBrushPreset(p);
                    chipsWrap.querySelectorAll('.brush-preset-btn').forEach(function (b) {
                        b.classList.toggle('active', b === chip);
                    });
                });
                chipsWrap.appendChild(chip);
            });
        }
        function cancelPresetSave() {
            nameInput.style.display = 'none';
            nameInput.value = '';
            saveBtn.textContent = 'Brush Preset +';
        }
        function doSaveBrushPreset() {
            var name = (nameInput.value || '').trim();
            if (!name) { cancelPresetSave(); return; }
            // Same name = overwrite (a brush you re-dial is the same brush)
            var list = loadBrushPresets().filter(function (q) { return q.name !== name; });
            list.unshift(captureBrushPreset(name));
            if (list.length > 24) list.length = 24;
            storeBrushPresets(list);
            cancelPresetSave();
            renderPresetChips();
        }
        saveBtn.addEventListener('click', function () {
            if (nameInput.style.display === 'none') {
                nameInput.style.display = '';
                nameInput.value = '';
                nameInput.focus();
                saveBtn.textContent = 'Save ✓';
            } else {
                doSaveBrushPreset();
            }
        });
        nameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); doSaveBrushPreset(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelPresetSave(); }
        });

        // ── Paint target: fluid splats vs collider painting ──
        // 2026-08-16 user-test simplification (Gabriel): the Sketch/Mask
        // buttons and the entire Sketch Layer + Mask sections below them
        // collapsed into ONE 'Paint Collider' action — the old controls
        // were 'complex and a little overwhelming'. The sketch/mask ROUTES
        // survive untouched underneath: the Layers panel's per-layer 🖌️
        // still paints raster layers (BRUSH_TARGET 'sketch'), brush presets
        // with target:'sketch'/'mask' still apply via SETTERS.target, and
        // collision layers keep their controls in the Layers panel.
        sLabel('Paint Into');
        var targetRow = document.createElement('div');
        targetRow.className = 'brush-mode-row';
        var fluidBtn = document.createElement('button');
        fluidBtn.type = 'button'; fluidBtn.className = 'brush-mode-btn active'; fluidBtn.textContent = 'Fluid';
        fluidBtn.title = 'Strokes splat velocity + dye into the fluid sim (the classic brush)';
        var colliderBtn = document.createElement('button');
        colliderBtn.type = 'button'; colliderBtn.className = 'brush-mode-btn'; colliderBtn.textContent = '🧱 Paint Collider';
        colliderBtn.title = 'Paint walls with your brush: strokes build a live collider layer (see the Layers panel) that the fluid flows around — shown as a red film while painting. Click Fluid to paint dye again.';
        targetRow.appendChild(fluidBtn); targetRow.appendChild(colliderBtn);
        panel.appendChild(targetRow);
        var VALID_TARGETS = { fluid: 1, sketch: 1, mask: 1 };
        function setBrushTarget(t) {
            if (!VALID_TARGETS[t]) t = 'fluid';
            if (window.config) window.config.BRUSH_TARGET = t;
            fluidBtn.classList.toggle('active', t === 'fluid');
            // 'mask' IS collider painting; 'sketch' (entered from the Layers
            // panel's per-layer paint button) lights neither option here.
            colliderBtn.classList.toggle('active', t === 'mask');
            try { if (window.settingsManager) window.settingsManager.set('brush.target', t); } catch (_) {}
        }
        SETTERS.target = setBrushTarget;
        fluidBtn.addEventListener('click', function () { setBrushTarget('fluid'); markDirty(); });
        function enterColliderPainting() {
            var cl = window.collisionLayers;
            if (!window.Masks || !cl || typeof cl.setMaskLive !== 'function') {
                setBrushTarget('mask'); // the paint route works even if binding can't
                return;
            }
            var src = cl.boundColliderSource && cl.boundColliderSource();
            var liveOnMask = typeof cl.isSketchLive === 'function' && cl.isSketchLive()
                && src && src.kind === 'mask';
            if (liveOnMask) {
                // A live mask collider already exists — re-enter painting
                // into ITS mask (imports may have activated a different
                // one). Starting over = delete the collision layer in the
                // Layers panel and press this again.
                try { if (window.Masks.setActive) window.Masks.setActive(src.id); } catch (_) {}
            } else {
                // Fresh collider: create-and-activate a new mask, then bind
                // a NEW live collision layer to it. rebind is load-bearing:
                // plain setMaskLive(true) keeps any previous binding (the
                // on-branch only rebinds when the source KIND differs) and
                // the button would silently paint into nothing.
                window.Masks.create('Collider');
                cl.setMaskLive(true, { rebind: true });
            }
            setBrushTarget('mask');
        }
        colliderBtn.addEventListener('click', function () { enterColliderPainting(); markDirty(); });
        try {
            var savedTarget = window.settingsManager && window.settingsManager.get('brush.target');
            setBrushTarget(savedTarget);
        } catch (_) { setBrushTarget('fluid'); }

        // ── Tip: the splat-shader stamp shapes as brush tips (D1) ──
        sLabel('Tip');
        var tipRow = document.createElement('div');
        tipRow.className = 'brush-tip-row';
        var tipBtns = [];
        // ONE rule for "which tip reads as selected", because a custom stamp
        // overrides the built-in tips: with a stamp loaded, NO glyph is the
        // active tip. Three places used to decide this and this one forgot the
        // stamp, so applying a preset (or any SETTERS.tip write) while a shape
        // was loaded lit a glyph AND the shape at once — two active brushes on
        // screen, only one of them real.
        function syncTipActive() {
            var act = (window.BrushShapes && window.BrushShapes.activeId()) || null;
            var cur = (window.config && window.config.BRUSH_TIP) | 0;
            tipBtns.forEach(function (b) {
                b.classList.toggle('active', !act && parseInt(b.dataset.tip, 10) === cur);
            });
        }
        function setBrushTip(v) {
            v = v | 0;
            if (v < 0 || v > 4) v = 0;
            if (window.config) window.config.BRUSH_TIP = v;
            syncTipActive();
            syncTexState();
            syncTipSwatch();   // the strip swatch is the other face of this control
            try { if (window.settingsManager) window.settingsManager.set('brush.tip', v); } catch (_) {}
        }
        SETTERS.tip = setBrushTip;
        BRUSH_TIPS.forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'brush-tip-btn';
            b.dataset.tip = String(t.v);
            b.textContent = t.glyph;
            b.title = t.title;
            b.addEventListener('click', function () {
                // Picking a built-in tip dismisses any custom shape override
                if (window.BrushShapes && window.BrushShapes.activeId()) window.BrushShapes.setActive(null);
                setBrushTip(t.v);
                markDirty();
            });
            tipBtns.push(b);
            tipRow.appendChild(b);
        });
        panel.appendChild(tipRow);

        // ── Custom shapes: user-authored stamp textures (33-brush-shapes).
        // Import → the mask editor opens in adhoc mode (full stamp suite +
        // Instant Roto) → Apply saves the cut-out as a stamp swatch here.
        // The area is also an image drop target (32-file-drop).
        var shapesArea = document.createElement('div');
        shapesArea.className = 'brush-shapes-area';
        var shapesRow = document.createElement('div');
        shapesRow.className = 'brush-tip-row brush-shapes-row';
        shapesArea.appendChild(shapesRow);
        panel.appendChild(shapesArea);
        var shapeFileInput = document.createElement('input');
        shapeFileInput.type = 'file';
        shapeFileInput.accept = 'image/png,image/jpeg,image/jpg,image/webp';
        shapeFileInput.style.display = 'none';
        shapesArea.appendChild(shapeFileInput);
        shapeFileInput.addEventListener('change', function () {
            var f = shapeFileInput.files && shapeFileInput.files[0];
            if (f && window.BrushShapes) window.BrushShapes.beginImportFile(f);
            shapeFileInput.value = '';
        });
        // Hand the strip's tip swatch this drawer's commit path — it must not
        // grow its own copy of the tip setter, the preset-dirty flag or the
        // import flow (the file input lives here).
        BrushTipCtl = {
            setTip: setBrushTip,
            markDirty: markDirty,
            openImport: function () { shapeFileInput.click(); }
        };
        function renderBrushShapes() {
            renderShapeTiles(shapesRow, { onImport: function () { shapeFileInput.click(); } });
        }
        SETTERS.shape = function (v) {
            if (!window.BrushShapes) return;
            window.BrushShapes.setActive((typeof v === 'string' && v) ? v : null);
        };
        window.__onBrushShapeChanged = function () {
            renderBrushShapes();
            syncTipActive();   // an active stamp overrides the built-in tips
            syncTexState();
            syncTipSwatch();
        };
        renderBrushShapes();
        var texGroup = pSlider('brushTipTexture', 'Texture', 0, 1, 0.01, 'BRUSH_TIP_TEXTURE', pct, 'tipTexture');
        function syncTexState() {
            // Texture (stamp grain/blend) shapes blob/chisel/streak — and
            // custom shape stamps, which run the same grain in the shader
            var t = ((window.config && window.config.BRUSH_TIP) | 0);
            var on = (t >= 1 && t <= 3) || !!(window.BrushShapes && window.BrushShapes.activeId());
            texGroup.style.opacity = on ? '1' : '0.4';
            var sl = texGroup.querySelector('input');
            if (sl) sl.disabled = !on;
        }
        (function restoreTip() {
            var saved = null;
            try { saved = window.settingsManager && window.settingsManager.get('brush.tip'); } catch (_) {}
            setBrushTip(typeof saved === 'number' ? saved : ((window.config && window.config.BRUSH_TIP) | 0));
        })();

        // Angle: rotates the asymmetric stamp shapes (chisel/streak). The
        // brush-ring cursor's bisecting line always shows this angle, so it
        // stays enabled for every tip even though round tips don't visibly turn.
        var angleGroup = pSlider('brushAngle', 'Angle', 0, 360, 1, 'BRUSH_ANGLE',
            function (v) { return Math.round(v) + '°'; }, 'angle');
        angleGroup.title = 'Rotate the brush tip (chisel/streak). The cursor line shows the angle.';

        // ── Flow + stroke feel ──
        pSlider('brushFlow', 'Flow', 0.05, 1, 0.01, 'BRUSH_FLOW', pct, 'flow');
        sLabel('Stroke');
        // Stabilizer slider removed 2026-07-30 (Gabriel): panel-length trim.
        // config.BRUSH_STABILIZER stays at its default; brush presets that
        // captured a stabilizer value simply no longer apply that key.
        // ── Splat mode: spaced-along-travel vs constant per-frame flow ──
        var flowModeRow = document.createElement('div');
        flowModeRow.className = 'brush-mode-row';
        var onMoveBtn = document.createElement('button');
        onMoveBtn.type = 'button'; onMoveBtn.className = 'brush-mode-btn active'; onMoveBtn.textContent = 'On Move';
        onMoveBtn.title = 'Dabs are laid down along pointer travel — paint flows only while moving (Spacing applies)';
        var constantBtn = document.createElement('button');
        constantBtn.type = 'button'; constantBtn.className = 'brush-mode-btn'; constantBtn.textContent = 'Constant';
        constantBtn.title = 'Paint flows at a steady rate while the pointer is held, even standing still — same on any monitor; Spacing does not apply';
        flowModeRow.appendChild(onMoveBtn); flowModeRow.appendChild(constantBtn);
        panel.appendChild(flowModeRow);
        // Each mode owns exactly one texture control, and they are twins: Spacing
        // is the gap along TRAVEL, Interval is the gap in TIME. Minimum on either
        // is the fine continuous stroke; every step up is deposits you can see.
        // Whichever belongs to the inactive mode is greyed rather than hidden, so
        // the panel never reflows when you switch modes.
        var spacingGroup, intervalGroup; // assigned below — setSplatMode can run first
        function setGroupEnabled(g, on) {
            if (!g) return;
            g.style.opacity = on ? '1' : '0.4';
            var sl = g.querySelector('input');
            if (sl) sl.disabled = !on;
        }
        function syncSpacingState() {
            var cont = !!(window.config && window.config.BRUSH_CONTINUOUS);
            setGroupEnabled(spacingGroup, !cont);
            setGroupEnabled(intervalGroup, cont);
        }
        function setSplatMode(m) {
            if (m !== 'constant') m = 'move';
            if (window.config) window.config.BRUSH_CONTINUOUS = (m === 'constant');
            onMoveBtn.classList.toggle('active', m === 'move');
            constantBtn.classList.toggle('active', m === 'constant');
            syncSpacingState();
            try { if (window.settingsManager) window.settingsManager.set('brush.splatMode', m); } catch (_) {}
        }
        SETTERS.splatMode = setSplatMode;
        onMoveBtn.addEventListener('click', function () { setSplatMode('move'); markDirty(); });
        constantBtn.addEventListener('click', function () { setSplatMode('constant'); markDirty(); });
        // Spacing low end extended to 0.1% (2026-08-09): 1% ≈ 2.3px between
        // dabs at the default brush, which reads grainy at slow speeds — the
        // sub-1% band plus the walker's lowered floor (05d0) is the true
        // dense "ink line" range.
        //
        // One-time migration to the 2026-08-17 default. The old 0.35 was
        // calibrated for a far smaller tip than this app's ~150px brush — it
        // laid THREE deposits per second at 200px/s, which is the "stuttery at
        // low speeds" report — but it is persisted per user, so a default change
        // alone reaches nobody who has already opened the app (every user test
        // participant included). Rewrite ONLY a saved value still sitting exactly
        // on the old default: anyone who moved the slider chose their number and
        // keeps it. Flagged so it can never run twice — if you deliberately set
        // 0.35 after this, it stays 0.35. Must run before the pSlider below,
        // which is what reads the saved value.
        //
        // V3 (2026-08-18) chains the same rule to the 0.05 -> 0.001 move: Spacing
        // is now the ONLY control over whether a slow stroke reads as a line or
        // as separate dabs, so the default belongs at the bottom. Each step
        // rewrites only a value still sitting exactly on the default it replaced,
        // and each has its own flag, so a user who lands mid-chain still ends up
        // current and a deliberate choice at any step is never touched twice.
        try {
            var _sm = window.settingsManager;
            var _defSp = (window.config && typeof window.config.BRUSH_SPACING === 'number')
                ? window.config.BRUSH_SPACING : 0.001;
            if (_sm && !_sm.get('brush.spacingNormalizedV2')) {
                var _savedSp = _sm.get('brush.brushSpacing');
                if (typeof _savedSp === 'number' && Math.abs(_savedSp - 0.35) < 1e-6) {
                    _sm.set('brush.brushSpacing', 0.05);
                }
                _sm.set('brush.spacingNormalizedV2', true);
            }
            if (_sm && !_sm.get('brush.spacingNormalizedV3')) {
                var _savedSp3 = _sm.get('brush.brushSpacing');
                if (typeof _savedSp3 === 'number' && Math.abs(_savedSp3 - 0.05) < 1e-6) {
                    _sm.set('brush.brushSpacing', _defSp);
                }
                _sm.set('brush.spacingNormalizedV3', true);
            }
        } catch (_) {}
        spacingGroup = pSlider('brushSpacing', 'Spacing', 0.001, 1, 0.001, 'BRUSH_SPACING', pctFine, 'spacing');
        // Constant flow's twin of Spacing (2026-08-18). Was a fixed 125 dabs/sec;
        // the hose could only ever be smooth. Expressed as an interval so the
        // slider reads the same way Spacing does — minimum = finest — and so the
        // slider value, config value and stored value are one number with no
        // reciprocal for a preset to get backwards. 8ms = 125/sim-sec = the old
        // fixed behaviour, ~2 dabs a frame at 60fps.
        intervalGroup = pSlider('brushDabInterval', 'Interval', 4, 250, 1, 'BRUSH_DAB_INTERVAL_MS',
            function (v) { return Math.round(v) + ' ms · ' + Math.round(1000 / Math.max(1, v)) + '/s'; },
            'dabInterval');
        intervalGroup.title = 'Constant flow: simulated time between dabs. Minimum is a smooth ' +
            'continuous hose; higher lays visibly separate pulses. Spacing is the same idea along travel.';
        pSlider('brushJitter', 'Jitter', 0, 1, 0.01, 'BRUSH_JITTER', pct, 'jitter');
        (function restoreSplatMode() {
            var saved = null;
            try { saved = window.settingsManager && window.settingsManager.get('brush.splatMode'); } catch (_) {}
            setSplatMode(saved);
        })();

        // ── Sketch Layer + Mask sections REMOVED 2026-08-16 (user-test:
        // "complex and a little overwhelming") — replaced by the Paint
        // Collider button above. What each control became:
        //  · Paints-into/+Layer → the Layers panel per-layer 🖌️ button
        //  · Eraser/Hardness/Show Paint Layers/Show Mask Film → config
        //    defaults now stand (no settings restore; stale saved values
        //    would be invisible traps with no UI to clear them)
        //  · Clear/→Collider/⟳ Live (both sections) → collision layers
        //    are managed in the Layers panel; Paint Collider binds live
        //  · Ignite Sketch / Capture → removed (Gabriel's call)
        //  · Sketch Undo/Redo buttons → Ctrl+Z / Ctrl+Shift+Z still work
        // window.__onActiveRasterChanged/__onActiveMaskChanged are no
        // longer assigned here; every caller is typeof-guarded (05l/05o).

        // Size fader tweaks also diverge from an applied preset
        var sizeFader = document.getElementById('brushSize');
        if (sizeFader) sizeFader.addEventListener('input', markDirty);

        // ── Open / close ──
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = panel.classList.contains('visible');
            if (open) {
                panel.classList.remove('visible');
                trigger.classList.remove('active');
            } else {
                positionPanel(); // position BEFORE the slide-in transition
                panel.classList.add('visible');
                trigger.classList.add('active');
                renderPresetChips();
            }
        });
        document.addEventListener('click', function (e) {
            if (panel.classList.contains('visible') && !panel.contains(e.target)
                && e.target !== trigger && !trigger.contains(e.target)) {
                panel.classList.remove('visible');
                trigger.classList.remove('active');
            }
        });
        panel.addEventListener('click', function (e) { e.stopPropagation(); });
        window.addEventListener('resize', function () {
            if (panel.classList.contains('visible')) positionPanel();
        });
    }


    // \u2500\u2500 Branding panel (redesigned): create overlays + arrange (select/drag/
    //    resize/rotate) via window.brandingOverlays. Replaces the old preset-only
    //    panel (buildBrandingSection_OLD_UNUSED deleted 2026-07-09; git history has it). \u2500\u2500
    function buildBrandingSection() {
        const { sec, body } = makeSection('Branding', 'expressive', true);

        function api() { return window.brandingOverlays; }

        // \u2500\u2500 Arrange toggle (the headline feature) \u2500\u2500
        var arrangeBtn = document.createElement('button');
        arrangeBtn.type = 'button';
        arrangeBtn.className = 'branding-arrange-btn';
        arrangeBtn.style.cssText = 'width:100%;margin-bottom:4px;padding:7px;font-size:11px;font-weight:600;border-radius:4px;background:rgba(255,130,170,0.18);border:1px solid rgba(255,130,170,0.3);color:white;cursor:pointer;';
        body.appendChild(arrangeBtn);

        var arrangeHint = document.createElement('div');
        arrangeHint.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin:0 0 10px;text-align:center;line-height:1.35;';
        arrangeHint.textContent = 'Drag overlays on the canvas to move; corners resize, top handle rotates. Painting pauses while arranging.';
        body.appendChild(arrangeHint);

        function syncArrangeBtn() {
            var on = !!(api() && api().isArranging());
            arrangeBtn.textContent = on ? '\u2713 Done Arranging' : '\u270b Arrange Overlays';
            arrangeBtn.classList.toggle('active', on);
        }
        arrangeBtn.addEventListener('click', function () {
            var a = api(); if (!a) return;
            if (a.isArranging()) a.closeArrange(); else a.openArrange();
            syncArrangeBtn();
        });

        // \u2500\u2500 Add: Text \u2500\u2500
        var textLabel = document.createElement('label');
        textLabel.className = 'brush-section-label';
        textLabel.textContent = 'Text Overlay';
        body.appendChild(textLabel);

        var textRow = document.createElement('div');
        textRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
        var textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.id = 'brandingTextInput';
        textInput.placeholder = '@yourhandle';
        textInput.style.cssText = 'flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;padding:4px 6px;border-radius:3px;font-size:11px;';
        var colorPick = document.createElement('input');
        colorPick.type = 'color';
        colorPick.value = '#ffffff';
        colorPick.id = 'brandingTextColor';
        colorPick.title = 'Text colour';
        colorPick.style.cssText = 'width:26px;height:24px;border:none;padding:0;cursor:pointer;background:transparent;flex:none;';
        var sizeInput = document.createElement('input');
        sizeInput.type = 'number';
        sizeInput.id = 'brandingTextSize';
        sizeInput.value = '24'; sizeInput.min = '8'; sizeInput.max = '200';
        sizeInput.title = 'Font size';
        sizeInput.style.cssText = 'width:38px;height:24px;font-size:10px;text-align:center;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:3px;flex:none;';
        var textAddBtn = document.createElement('button');
        textAddBtn.type = 'button';
        textAddBtn.textContent = '+ Add';
        textAddBtn.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:3px;background:rgba(255,130,170,0.2);border:1px solid rgba(255,130,170,0.3);color:white;cursor:pointer;flex:none;';
        textRow.appendChild(textInput);
        textRow.appendChild(colorPick);
        textRow.appendChild(sizeInput);
        textRow.appendChild(textAddBtn);
        body.appendChild(textRow);

        var quickRow = document.createElement('div');
        quickRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-bottom:10px;';
        ['\ud83d\udd34 LIVE', 'Follow me!', 'Link in bio', '\u2764\ufe0f + \ud83d\udc4d'].forEach(function (text) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.style.cssText = 'padding:2px 6px;font-size:9px;border-radius:3px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);cursor:pointer;';
            b.addEventListener('click', function () { textInput.value = text; textInput.focus(); });
            quickRow.appendChild(b);
        });
        body.appendChild(quickRow);

        // \u2500\u2500 Add: Logo / Image \u2500\u2500
        var imgLabel = document.createElement('label');
        imgLabel.className = 'brush-section-label';
        imgLabel.textContent = 'Logo / Image';
        body.appendChild(imgLabel);
        var imgUploadBtn = document.createElement('button');
        imgUploadBtn.type = 'button';
        imgUploadBtn.textContent = '\ud83d\udcce Upload Logo';
        imgUploadBtn.style.cssText = 'width:100%;margin-bottom:10px;padding:5px 8px;font-size:10px;border-radius:3px;background:rgba(255,200,100,0.15);border:1px solid rgba(255,200,100,0.2);color:white;cursor:pointer;';
        var imgFileInput = document.createElement('input');
        imgFileInput.type = 'file';
        imgFileInput.accept = 'image/png,image/svg+xml,image/jpeg,image/webp';
        imgFileInput.style.display = 'none';
        body.appendChild(imgUploadBtn);
        body.appendChild(imgFileInput);

        // \u2500\u2500 Add: QR \u2500\u2500
        var qrLabel = document.createElement('label');
        qrLabel.className = 'brush-section-label';
        qrLabel.textContent = 'QR Code';
        body.appendChild(qrLabel);
        var qrRow = document.createElement('div');
        qrRow.style.cssText = 'display:flex;gap:4px;margin-bottom:10px;';
        var qrInput = document.createElement('input');
        qrInput.type = 'text';
        qrInput.placeholder = 'https://your-link.example';
        qrInput.style.cssText = 'flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;padding:4px 6px;border-radius:3px;font-size:10px;';
        var qrAddBtn = document.createElement('button');
        qrAddBtn.type = 'button';
        qrAddBtn.textContent = '+ QR';
        qrAddBtn.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:3px;background:rgba(180,130,255,0.2);border:1px solid rgba(180,130,255,0.3);color:white;cursor:pointer;flex:none;';
        qrRow.appendChild(qrInput);
        qrRow.appendChild(qrAddBtn);
        body.appendChild(qrRow);

        // \u2500\u2500 Active Overlays list \u2500\u2500
        var listLabel = document.createElement('label');
        listLabel.className = 'brush-section-label';
        listLabel.textContent = 'Active Overlays';
        body.appendChild(listLabel);
        var overlayList = document.createElement('div');
        overlayList.id = 'brandingOverlayList';
        overlayList.style.cssText = 'max-height:170px;overflow-y:auto;margin-bottom:6px;';
        body.appendChild(overlayList);

        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = '\ud83d\uddd1 Clear All';
        clearBtn.style.cssText = 'width:100%;padding:4px;font-size:10px;border-radius:3px;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.2);color:rgba(255,255,255,0.6);cursor:pointer;';
        body.appendChild(clearBtn);

        function mkRowBtn(txt, title, fn) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = txt;
            b.title = title;
            b.style.cssText = 'padding:1px 5px;font-size:12px;background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.7);line-height:1;flex:none;';
            b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
            return b;
        }

        function refreshList() {
            var a = api();
            overlayList.innerHTML = '';
            if (!a) return;
            var all = a.getAll();
            if (!all.length) {
                overlayList.innerHTML = '<div style="font-size:9px;color:rgba(255,255,255,0.3);text-align:center;padding:8px;">No overlays yet \u2014 add one above</div>';
                return;
            }
            var selId = a.getSelectedId();
            all.forEach(function (ov) {
                var isSel = ov.id === selId;
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px;border-radius:3px;cursor:pointer;border:1px solid ' + (isSel ? 'rgba(255,130,170,0.5)' : 'transparent') + ';background:' + (isSel ? 'rgba(255,130,170,0.12)' : 'transparent') + ';';

                var icon = ov.type === 'text' ? '\u2709' : ov.type === 'image' ? '\ud83d\uddbc' : '\ud83d\udcf1';
                var desc = ov.type === 'text' ? ov.content : ov.type === 'image' ? 'Logo' : ov.url;
                var label = document.createElement('span');
                label.style.cssText = 'flex:1;min-width:0;font-size:10px;color:rgba(255,255,255,' + (ov.visible ? '0.75' : '0.35') + ');overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                label.textContent = icon + ' ' + desc;

                row.addEventListener('click', function () {
                    a.openArrange(ov.id);
                    syncArrangeBtn();
                    refreshList();
                });

                var moveBtn = mkRowBtn('\u2725', 'Arrange / move', function () { a.openArrange(ov.id); syncArrangeBtn(); refreshList(); });
                var toggleBtn = mkRowBtn(ov.visible ? '\ud83d\udc41' : '\ud83d\ude48', 'Toggle visibility', function () { a.toggle(ov.id); refreshList(); });
                var rmBtn = mkRowBtn('\u00d7', 'Remove', function () { a.remove(ov.id); refreshList(); });
                rmBtn.style.color = 'rgba(255,90,90,0.85)';
                rmBtn.style.fontWeight = 'bold';
                rmBtn.style.fontSize = '14px';

                row.appendChild(label);
                row.appendChild(moveBtn);
                row.appendChild(toggleBtn);
                row.appendChild(rmBtn);
                overlayList.appendChild(row);
            });
        }

        // \u2500\u2500 Wire creation \u2500\u2500
        function addText() {
            var t = textInput.value.trim();
            if (!t) { textInput.focus(); return; }
            var a = api(); if (!a) return;
            a.addText({ content: t, color: colorPick.value, fontSize: parseInt(sizeInput.value, 10) || 24 });
            textInput.value = '';
            refreshList();
        }
        textAddBtn.addEventListener('click', addText);
        textInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addText(); e.stopPropagation(); });

        imgUploadBtn.addEventListener('click', function () { imgFileInput.click(); });
        imgFileInput.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) { var a = api(); if (a) { a.addImage({ src: ev.target.result }); refreshList(); } };
            reader.readAsDataURL(file);
            imgFileInput.value = '';
        });

        qrAddBtn.addEventListener('click', function () {
            var url = qrInput.value.trim();
            if (!url) { qrInput.focus(); return; }
            var a = api(); if (a) { a.addQR({ url: url }); qrInput.value = ''; refreshList(); }
        });
        qrInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') qrAddBtn.click(); e.stopPropagation(); });

        clearBtn.addEventListener('click', function () { var a = api(); if (a) { a.clearAll(); refreshList(); } });

        // \u2500\u2500 Init + subscribe to overlay changes (drag updates the list highlight) \u2500\u2500
        function ready() {
            if (!api()) { setTimeout(ready, 100); return; }
            api().onChange(function () { syncArrangeBtn(); refreshList(); });
            syncArrangeBtn();
            refreshList();
        }
        setTimeout(ready, 200);

        return sec;
    }

    // \u2500\u2500\u2500 AUDIO \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Sidebar holds a compact "Audio" mini + an Off/Min/Full mode select. The
    // full React controls + the Composer segment timeline live in the shared
    // bottom drawer (Audio tab). Mirrors the Record feature's mini/drawer split.

    var audioDrawerBuilt = false;
    var audioMiniRaf = null;

    function buildAudioSection() {
        const { sec, body } = makeSection('Audio', 'expressive', true);

        // Mode select (Off / Minimized / Full) \u2014 mirrors recMode
        var modeGroup = document.createElement('div');
        modeGroup.className = 'control-group';
        var modeLbl = document.createElement('label');
        modeLbl.setAttribute('for', 'audioMode');
        modeLbl.textContent = 'Audio Mode';
        var modeSel = document.createElement('select');
        modeSel.id = 'audioMode';
        // off → three fire-and-forget scenes (30-audio-scenes.js) → min → full
        modeSel.innerHTML =
            '<option value="off" selected>Off</option>' +
            '<option value="tunnel">🌀 Tunnel</option>' +
            '<option value="min">Minimized</option>' +
            '<option value="full">Full</option>';
        modeGroup.appendChild(modeLbl);
        modeGroup.appendChild(modeSel);
        body.appendChild(modeGroup);

        // Scene widget: hosts the shared enable row + the active scene's
        // quick controls. Shown only while a scene mode is selected.
        var sceneBox = document.createElement('div');
        sceneBox.id = 'audioSceneBox';
        sceneBox.className = 'audio-mini';
        sceneBox.style.display = 'none';
        var sceneCtlHost = document.createElement('div');
        sceneCtlHost.id = 'audioSceneControls';
        sceneBox.appendChild(sceneCtlHost);
        body.appendChild(sceneBox);

        // Minimized widget: enable + source + small segments timeline + Full button
        var mini = document.createElement('div');
        mini.id = 'audioMini';
        mini.className = 'audio-mini';
        mini.style.display = 'none';
        mini.innerHTML =
            '<div class="audio-mini-row">' +
                '<label class="audio-mini-enable"><input type="checkbox" id="audioReactToggle"><span>Enable</span></label>' +
                '<select id="audioReactSource" class="audio-mini-src">' +
                    '<option value="mic">Mic</option><option value="system">System</option><option value="file">File</option>' +
                '</select>' +
            '</div>' +
            // Transport (2026-08-16): a loaded file plays out loud, so it gets
            // real controls \u2014 play/pause, restart, loop, a draggable playhead
            // and a clock. Hidden unless a FILE is the source (mic/system are
            // never monitored \u2014 feedback/echo) and RELOCATED alongside the
            // enable row so it is present in mini, scene and drawer modes.
            '<div id="audioPlayRow" class="audio-transport" style="display:none;">' +
                '<div class="audio-mini-row">' +
                    '<button id="audioPlayBtn" class="audio-play-btn" title="Play / Pause (the visuals follow the audio)">\u23f8</button>' +
                    '<button id="audioRestartBtn" class="audio-play-btn" title="Back to the start">\u23ee</button>' +
                    '<button id="audioLoopBtn" class="audio-play-btn active" title="Loop the track">\ud83d\udd01</button>' +
                    '<span id="audioClock" class="audio-clock">0:00 / 0:00</span>' +
                '</div>' +
                '<input type="range" id="audioSeek" class="audio-seek" min="0" max="1000" step="1" value="0" title="Playhead \u2014 drag to scrub" data-no-scale="1">' +
                '<div class="audio-mini-row">' +
                    '<button id="audioMuteBtn" class="audio-play-btn" title="Mute playback (visuals keep reacting)">\ud83d\udd0a</button>' +
                    '<input type="range" id="audioVolume" class="audio-vol" min="0" max="1" step="0.01" value="0.85" title="Playback volume" data-no-scale="1">' +
                    '<span id="audioFileName" class="audio-filename"></span>' +
                '</div>' +
            '</div>' +
            '<canvas id="audioMiniTimeline" class="audio-mini-timeline" title="Composer segments"></canvas>' +
            '<button id="audioOpenFullBtn" class="audio-mini-full" title="Open full audio panel">\u2b06\ufe0f Full Audio</button>';
        body.appendChild(mini);

        // Hidden file input used by the enable/source paths
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.style.display = 'none';
        fileInput.id = 'audioReactFile';
        body.appendChild(fileInput);

        var enableCb = mini.querySelector('#audioReactToggle');
        var srcSel = mini.querySelector('#audioReactSource');
        // The enable row (checkbox + source) is SHARED between the mini widget
        // and the full drawer: the same DOM nodes are relocated on mode change
        // so there's exactly one control and zero state-sync problems. Without
        // this, Full mode had no enable control at all (the mini is hidden).
        var enableRow = mini.querySelector('.audio-mini-row');
        // The Enable checkbox is a REFLECTION of engine state, never a claim
        // about it (2026-08-16). It used to latch checked the moment it was
        // clicked: with source=File that happens BEFORE the file picker even
        // opens, so cancelling the picker — or a decode/permission failure —
        // left the box checked with nothing running. The box then had to be
        // un- and re-checked to actually start anything, which is exactly the
        // 'load a file and it won't play' report.
        function syncEnableCheckbox() {
            if (!enableCb || !window.audioReactive) return;
            var on = !!window.audioReactive.isEnabled();
            if (enableCb.checked !== on) enableCb.checked = on;
        }
        window.__syncAudioEnable = syncEnableCheckbox;

        function enableFromSource() {
            if (!window.audioReactive) return;
            var src = srcSel.value;
            if (src === 'file') {
                // Nothing is enabled until a file actually arrives; the box
                // goes on in the change handler below (via the state sync).
                syncEnableCheckbox();
                fileInput.click();
            } else {
                window.audioReactive.enable(src);
            }
        }
        enableCb.addEventListener('change', function () {
            if (!window.audioReactive) return;
            if (enableCb.checked) enableFromSource();
            else window.audioReactive.disable();
            syncEnableCheckbox();
        });
        srcSel.addEventListener('change', function () {
            // Switching source while running: tear the old one down, then ask
            // for the new one. If that ask is the file picker and the user
            // cancels, the sync leaves the box unchecked — honest, because
            // nothing is running any more.
            if (window.audioReactive && window.audioReactive.isEnabled()) {
                window.audioReactive.disable();
                enableFromSource();
            }
            syncEnableCheckbox();
        });
        fileInput.addEventListener('change', function (e) {
            var f = e.target.files && e.target.files[0];
            if (f && window.audioReactive) window.audioReactive.enable('file', f);
            fileInput.value = '';
            // enable() resolves async (decode) and notifies on both success
            // and failure; this covers the no-file case immediately.
            syncEnableCheckbox();
        });
        // Picker dismissed with no selection (Chrome/Firefox fire 'cancel').
        // Older engines fire nothing — the sync above already left the box
        // unchecked, so those degrade to the same honest state.
        fileInput.addEventListener('cancel', function () {
            fileInput.value = '';
            syncEnableCheckbox();
        });

        // ── Transport (file source only) ──
        var playRow = mini.querySelector('#audioPlayRow');
        var playBtn = mini.querySelector('#audioPlayBtn');
        var muteBtn = mini.querySelector('#audioMuteBtn');
        var volSlider = mini.querySelector('#audioVolume');
        var restartBtn = mini.querySelector('#audioRestartBtn');
        var loopBtn = mini.querySelector('#audioLoopBtn');
        var seekBar = mini.querySelector('#audioSeek');
        var clockEl = mini.querySelector('#audioClock');
        var nameEl = mini.querySelector('#audioFileName');
        var seekDragging = false;

        function fmtClock(s) {
            s = Math.max(0, Math.floor(s || 0));
            var m = Math.floor(s / 60);
            var r = s % 60;
            return m + ':' + (r < 10 ? '0' : '') + r;
        }
        // Playhead + clock, driven by the mini loop (and one immediate call on
        // every state change). Skipped while the user is dragging the scrub
        // bar, or the thumb would fight the cursor.
        function syncPlayhead() {
            var ar = window.audioReactive;
            if (!ar || !ar.position) return;
            var p = ar.position();
            if (!p) return;
            if (!seekDragging && seekBar) {
                seekBar.value = String(Math.round((p.time / p.duration) * 1000));
                seekBar.style.setProperty('--val', seekBar.value);
            }
            if (clockEl) clockEl.textContent = fmtClock(p.time) + ' / ' + fmtClock(p.duration);
            if (playBtn) {
                playBtn.textContent = p.paused ? '▶' : '⏸';
                playBtn.title = p.paused ? 'Play' : 'Pause (the visuals follow the audio)';
            }
        }
        window.__syncAudioPlayhead = syncPlayhead;

        // The playhead needs its own tick: the mini-timeline loop only runs in
        // 'min' mode and bails when that canvas is hidden, but the transport
        // is visible in scene and Full modes too. 200 ms — the clock ticks in
        // seconds and the bar reads as moving; cheaper than an rAF.
        var playTick = null;
        function ensurePlayTick(on) {
            if (on && !playTick) playTick = setInterval(syncPlayhead, 200);
            else if (!on && playTick) { clearInterval(playTick); playTick = null; }
        }

        function syncPlayRow() {
            var ar = window.audioReactive;
            var on = !!(ar && ar.isMonitorable && ar.isMonitorable());
            if (playRow) playRow.style.display = on ? '' : 'none';
            ensurePlayTick(on);
            if (!on || !ar) return;
            if (volSlider) volSlider.value = ar.getMonitorVolume();
            if (muteBtn) {
                var m = ar.isMuted();
                muteBtn.textContent = m ? '🔇' : '🔊';
                muteBtn.classList.toggle('muted', m);
                muteBtn.title = m ? 'Unmute playback' : 'Mute playback (visuals keep reacting)';
            }
            if (loopBtn) loopBtn.classList.toggle('active', ar.isLooping());
            if (nameEl) nameEl.textContent = ar.fileName ? ar.fileName() : '';
            syncPlayhead();
        }
        // 22-audio-reactive fires this whenever the source or transport state
        // changes — including the async file-decode completion and any
        // start FAILURE — so it is the one place both the Enable checkbox and
        // the transport re-read the truth.
        window.__onAudioSourceChanged = function () {
            if (typeof window.__syncAudioEnable === 'function') window.__syncAudioEnable();
            syncPlayRow();
        };

        if (playBtn) playBtn.addEventListener('click', function () {
            if (window.audioReactive) { window.audioReactive.togglePlay(); syncPlayRow(); }
        });
        if (muteBtn) muteBtn.addEventListener('click', function () {
            if (!window.audioReactive) return;
            window.audioReactive.setMuted(!window.audioReactive.isMuted());
            syncPlayRow();
        });
        if (volSlider) volSlider.addEventListener('input', function () {
            if (!window.audioReactive) return;
            window.audioReactive.setMonitorVolume(parseFloat(volSlider.value));
            if (window.audioReactive.isMuted()) { window.audioReactive.setMuted(false); syncPlayRow(); }
        });
        if (restartBtn) restartBtn.addEventListener('click', function () {
            if (window.audioReactive && window.audioReactive.restart) {
                window.audioReactive.restart();
                syncPlayRow();
            }
        });
        if (loopBtn) loopBtn.addEventListener('click', function () {
            if (!window.audioReactive) return;
            window.audioReactive.setLoop(!window.audioReactive.isLooping());
            syncPlayRow();
        });
        if (seekBar) {
            // Scrub live on drag: seeking a playing track restarts the source
            // at the new offset, so the sound (and the visuals it drives)
            // follow the thumb.
            var doSeek = function () {
                var ar = window.audioReactive;
                if (!ar || !ar.position) return;
                var p = ar.position();
                if (!p) return;
                ar.seek((parseFloat(seekBar.value) / 1000) * p.duration);
                syncPlayhead();
            };
            seekBar.addEventListener('pointerdown', function () { seekDragging = true; });
            seekBar.addEventListener('input', function () { seekDragging = true; doSeek(); });
            var endSeek = function () { if (seekDragging) { seekDragging = false; doSeek(); } };
            seekBar.addEventListener('change', endSeek);
            seekBar.addEventListener('pointerup', endSeek);
            seekBar.addEventListener('pointercancel', endSeek);
        }
        syncPlayRow();

        mini.querySelector('#audioOpenFullBtn').addEventListener('click', function () {
            modeSel.value = 'full';
            modeSel.dispatchEvent(new Event('change'));
        });

        function applyAudioMode(mode, userInitiated) {
            var isScene = !!(window.AudioScenes && window.AudioScenes.isScene(mode));
            // Park the shared enable row where the active mode can reach it —
            // and keep the file transport docked directly beneath it, or the
            // playback controls would stay behind in the hidden mini widget
            // (no play/pause at all in Full or scene modes).
            var enableHost = document.getElementById('audioDrawerEnableHost');
            if (mode === 'full' && enableHost && enableRow) {
                enableHost.appendChild(enableRow);
            } else if (isScene && enableRow) {
                sceneBox.insertBefore(enableRow, sceneBox.firstChild);
            } else if (enableRow && enableRow.parentElement !== mini) {
                mini.insertBefore(enableRow, mini.firstChild);
            }
            if (playRow && enableRow && enableRow.parentElement) {
                enableRow.parentElement.insertBefore(playRow, enableRow.nextSibling);
            }
            // Scene lifecycle: activate on scene modes, tear down otherwise
            if (window.AudioScenes) {
                if (isScene) window.AudioScenes.activate(mode);
                else window.AudioScenes.deactivate();
            }
            if (!isScene) sceneBox.style.display = 'none';
            if (mode === 'off') {
                mini.style.display = 'none';
                if (window.audioReactive) window.audioReactive.disable();
                if (enableCb) enableCb.checked = false;
                if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'audio') window.studioDrawer.close();
                stopAudioMiniLoop();
            } else if (isScene) {
                mini.style.display = 'none';
                sceneBox.style.display = '';
                if (window.AudioScenes) window.AudioScenes.buildControls(mode, sceneCtlHost);
                if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'audio') window.studioDrawer.close();
                stopAudioMiniLoop();
                // Fire-and-forget: a user picking a scene wants sound NOW — start
                // the engine from the selected source. Restored sessions (synthetic
                // change events) skip this so page load never pops a mic prompt.
                if (userInitiated && window.audioReactive && !window.audioReactive.isEnabled()) {
                    // Ask the engine to start; the checkbox follows from the
                    // resulting state (pre-checking it here would re-create
                    // the lie when the source is File and the picker is
                    // cancelled, or when mic permission is denied).
                    enableFromSource();
                }
            } else if (mode === 'min') {
                mini.style.display = '';
                if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'audio') window.studioDrawer.close();
                startAudioMiniLoop();
            } else if (mode === 'full') {
                mini.style.display = 'none';
                ensureAudioDrawer();
                if (window.studioDrawer) window.studioDrawer.open('audio');
                stopAudioMiniLoop();
            }
        }
        modeSel.addEventListener('change', function (e) { applyAudioMode(e.target.value, e.isTrusted); });

        // Build the drawer controls + composer up front (into the hidden panel) so
        // their element IDs always exist for save/load, mutation locks, and the
        // engine's viz registration — matching how the controls were always built
        // before. The Audio tab just reveals the already-built panel.
        ensureAudioDrawer();
        applyAudioMode(modeSel.value);

        return sec;
    }

    function ensureAudioDrawer() {
        if (audioDrawerBuilt) return;
        var panel = document.getElementById('audioDrawerPanel');
        if (!panel) return;
        buildAudioDrawerControls(panel);
        audioDrawerBuilt = true;
    }

    // \u2500\u2500 Mini segments timeline (overlapping active areas) \u2500\u2500
    function startAudioMiniLoop() {
        if (audioMiniRaf) return;
        // rAF is uncapped in Electron — throttle to ~30 Hz and skip while the
        // mini is hidden (a timeline preview needs no more)
        var lastDraw = 0;
        var draw = function () {
            audioMiniRaf = requestAnimationFrame(draw);
            var now = performance.now();
            if (now - lastDraw < 33) return;
            var cv = document.getElementById('audioMiniTimeline');
            if (!cv || cv.offsetParent === null) return;
            lastDraw = now;
            drawAudioMiniTimeline();
        };
        audioMiniRaf = requestAnimationFrame(draw);
    }
    function stopAudioMiniLoop() {
        if (audioMiniRaf) { cancelAnimationFrame(audioMiniRaf); audioMiniRaf = null; }
    }
    function miniRoundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, h / 2, w / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
    }
    function drawAudioMiniTimeline() {
        var cv = document.getElementById('audioMiniTimeline');
        if (!cv) return;
        var rect = cv.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        var dpr = window.devicePixelRatio || 1;
        var w = Math.max(1, Math.round(rect.width * dpr));
        var h = Math.max(1, Math.round(rect.height * dpr));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
        var comp = window.audioComposer;
        if (!comp || !comp.getState) return;
        var st = comp.getState();
        var dur = (comp.getDurationMs ? comp.getDurationMs() : st.durationMs) || 1;
        var tracks = st.tracks || [];
        var palette = comp.palette || ['#b48cff', '#4dd2ff', '#4dff7a', '#ffb24d', '#ff6fae'];
        var n = Math.max(1, tracks.length);
        var pad = 2 * dpr;
        var laneH = (h - pad * (n + 1)) / n;
        for (var i = 0; i < tracks.length; i++) {
            var y = pad + i * (laneH + pad);
            var color = palette[i % palette.length];
            var segs = tracks[i].segments || [];
            ctx.globalAlpha = 0.85;
            for (var j = 0; j < segs.length; j++) {
                var s = segs[j];
                var x = (s.startMs / dur) * w;
                var bw = Math.max(2 * dpr, (s.durMs / dur) * w);
                ctx.fillStyle = color;
                miniRoundRect(ctx, x, y, bw, laneH, 2 * dpr);
            }
        }
        ctx.globalAlpha = 1;
        var ph = comp.getPlayheadMs ? comp.getPlayheadMs() : 0;
        var px = (ph / dur) * w;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, h); ctx.stroke();
    }

    function buildAudioDrawerControls(container) {
        container.innerHTML = '';
        var body = container;

        // Host for the shared enable row (checkbox + source select). The row's
        // DOM nodes live in the sidebar mini widget and are moved here whenever
        // Audio Mode is 'full' — see applyAudioMode.
        var enableHost = document.createElement('div');
        enableHost.id = 'audioDrawerEnableHost';
        enableHost.className = 'audio-drawer-enable';
        body.appendChild(enableHost);

        // Visualizer canvas
        var vizWrap = document.createElement('div');
        vizWrap.style.cssText = 'margin:8px 0;border-radius:6px;overflow:hidden;background:#000;';
        var vizCanvas = document.createElement('canvas');
        vizCanvas.id = 'audioReactViz';
        vizCanvas.style.cssText = 'width:100%;height:160px;display:block;background:#000;';
        vizWrap.appendChild(vizCanvas);
        body.appendChild(vizWrap);

        // Sensitivity slider
        var sensGroup = document.createElement('div');
        sensGroup.className = 'control-group';
        var sensLbl = document.createElement('label');
        sensLbl.setAttribute('for', 'audioSensitivity');
        sensLbl.innerHTML = 'Sensitivity <span class="value-display" id="audioSensValue">1.5</span>';
        var sensSlider = document.createElement('input');
        sensSlider.type = 'range';
        sensSlider.id = 'audioSensitivity';
        sensSlider.min = '0.1';
        sensSlider.max = '3.0';
        sensSlider.step = '0.1';
        sensSlider.value = '1.5';
        sensGroup.appendChild(sensLbl);
        sensGroup.appendChild(sensSlider);
        body.appendChild(sensGroup);

        // Beat threshold slider
        var beatGroup = document.createElement('div');
        beatGroup.className = 'control-group';
        var beatLbl = document.createElement('label');
        beatLbl.setAttribute('for', 'audioBeatThreshold');
        beatLbl.innerHTML = 'Beat Threshold <span class="value-display" id="audioBeatValue">0.65</span>';
        var beatSlider = document.createElement('input');
        beatSlider.type = 'range';
        beatSlider.id = 'audioBeatThreshold';
        beatSlider.min = '0.1';
        beatSlider.max = '1.0';
        beatSlider.step = '0.05';
        beatSlider.value = '0.65';
        beatGroup.appendChild(beatLbl);
        beatGroup.appendChild(beatSlider);
        body.appendChild(beatGroup);

        // Mapping toggles label
        var mapLabel = document.createElement('label');
        mapLabel.className = 'brush-section-label';
        mapLabel.textContent = 'Mappings';
        mapLabel.style.marginTop = '8px';
        body.appendChild(mapLabel);

        // Mapping checkboxes
        var mappings = [
            { id: 'arMapAutoSplat', label: 'Bass \u2192 Auto Splat', key: 'bassAutoSplat', def: true },
            // Defaults must track the engine's (22-audio-reactive.js): these two
            // reach into the brush itself, so they are opt-in. A checked box the
            // engine disagrees with would lie until the user toggled it.
            { id: 'arMapSize', label: 'Energy \u2192 Brush Size', key: 'overallToSize', def: false },
            { id: 'arMapKaleido', label: 'Mid \u2192 Kaleido Rotation', key: 'midToKaleido', def: true },
            { id: 'arMapColor', label: 'Treble \u2192 Color Cycle', key: 'trebleToColor', def: false }
        ];

        mappings.forEach(function (m) {
            var g = document.createElement('div');
            g.className = 'control-group checkbox-group';
            g.style.marginTop = '3px';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = m.id;
            cb.checked = m.def;
            var lbl = document.createElement('label');
            lbl.setAttribute('for', m.id);
            lbl.style.cssText = 'margin:0;font-size:10px';
            lbl.textContent = m.label;
            g.appendChild(cb);
            g.appendChild(lbl);
            body.appendChild(g);

            cb.addEventListener('change', function () {
                if (window.audioReactive) window.audioReactive.setMapping(m.key, cb.checked);
            });
        });

        // Auto-splat pattern — visual emission-pattern picker (drives the bass
        // auto-splat generator). Tiles map to window.audioReactive generators.
        var splatModeGroup = document.createElement('div');
        splatModeGroup.className = 'control-group';
        splatModeGroup.style.marginTop = '8px';
        var splatModeLbl = document.createElement('label');
        splatModeLbl.textContent = 'Auto-Splat Pattern';
        splatModeLbl.style.cssText = 'font-size:10px;text-transform:uppercase;letter-spacing:0.4px;opacity:0.7;margin-bottom:4px;display:block';
        splatModeGroup.appendChild(splatModeLbl);

        var patGrid = document.createElement('div');
        patGrid.className = 'ar-pattern-grid';
        var patterns = [
            ['center', '◉', 'Center'], ['random', '✦', 'Scatter'], ['circular', '◯', 'Orbit'],
            ['grid', '▦', 'Grid'], ['spiral', '🌀', 'Spiral'], ['radialBurst', '✺', 'Burst'],
            ['freqMap', '∿', 'Freq']
        ];
        var patBtns = {};
        patterns.forEach(function (p) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ar-pattern-btn' + (p[0] === 'center' ? ' active' : '');
            b.dataset.gen = p[0];
            b.title = p[2] + ' — bass auto-splat pattern';
            b.innerHTML = '<span class="ar-pat-glyph">' + p[1] + '</span><span class="ar-pat-label">' + p[2] + '</span>';
            b.addEventListener('click', function () {
                Object.keys(patBtns).forEach(function (k) { patBtns[k].classList.remove('active'); });
                b.classList.add('active');
                if (window.audioReactive) window.audioReactive.setAutoSplatMode(p[0]);
            });
            patBtns[p[0]] = b;
            patGrid.appendChild(b);
        });
        splatModeGroup.appendChild(patGrid);
        body.appendChild(splatModeGroup);

        // ─── Wire events ───
        sensSlider.addEventListener('input', function () {
            var v = parseFloat(sensSlider.value);
            document.getElementById('audioSensValue').textContent = v.toFixed(1);
            if (window.audioReactive) window.audioReactive.setSensitivity(v);
        });

        beatSlider.addEventListener('input', function () {
            var v = parseFloat(beatSlider.value);
            document.getElementById('audioBeatValue').textContent = v.toFixed(2);
            if (window.audioReactive) window.audioReactive.setBeatThreshold(v);
        });

        // Register visualizer canvas after a frame (needs dimensions)
        requestAnimationFrame(function () {
            if (window.audioReactive) window.audioReactive.registerViz(vizCanvas);
        });

        // Mirror the engine config onto these controls whenever the composer
        // applies a segment, so the panel visibly changes as the playhead crosses
        // segments. (--val is set directly because programmatic .value doesn't
        // fire the input event the slider fill listens for.)
        function syncAudioUIFromEngine() {
            if (!window.audioReactive || !window.audioReactive.getConfig) return;
            var c = window.audioReactive.getConfig();
            if (typeof c.sensitivity === 'number') {
                sensSlider.value = c.sensitivity;
                sensSlider.style.setProperty('--val', String(c.sensitivity));
                var sv = document.getElementById('audioSensValue'); if (sv) sv.textContent = c.sensitivity.toFixed(1);
            }
            if (typeof c.beatThreshold === 'number') {
                beatSlider.value = c.beatThreshold;
                beatSlider.style.setProperty('--val', String(c.beatThreshold));
                var bv = document.getElementById('audioBeatValue'); if (bv) bv.textContent = c.beatThreshold.toFixed(2);
            }
            if (c.mappings) {
                var setCb = function (id, val) { var cb = document.getElementById(id); if (cb && typeof val === 'boolean') cb.checked = val; };
                setCb('arMapAutoSplat', c.mappings.bassAutoSplat);
                setCb('arMapSize', c.mappings.overallToSize);
                setCb('arMapKaleido', c.mappings.midToKaleido);
                setCb('arMapColor', c.mappings.trebleToColor);
            }
            if (typeof c.autoSplatMode === 'string') {
                Object.keys(patBtns).forEach(function (k) { patBtns[k].classList.toggle('active', k === c.autoSplatMode); });
            }
        }
        if (window.audioReactive && window.audioReactive.onConfigChange) {
            window.audioReactive.onConfigChange(syncAudioUIFromEngine);
        }

        // Composer segment timeline lives below the React controls in the drawer
        var compWrap = document.createElement('div');
        compWrap.className = 'audio-drawer-composer';
        body.appendChild(compWrap);
        (function mountComposer() {
            if (window.audioComposer && window.audioComposer.mount) window.audioComposer.mount(compWrap);
            else setTimeout(mountComposer, 150);
        })();
    }

    function buildFocusSection() {
        const { sec, body } = makeSection('Focus', 'system', true);

        // Focus Mode toggle
        var focusGroup = document.createElement('div');
        focusGroup.className = 'control-group checkbox-group';
        var focusCb = document.createElement('input');
        focusCb.type = 'checkbox';
        focusCb.id = 'focusModeToggle';
        var focusLbl = document.createElement('label');
        focusLbl.setAttribute('for', 'focusModeToggle');
        focusLbl.style.margin = '0';
        focusLbl.textContent = 'Focus Mode (F)';
        focusGroup.appendChild(focusCb);
        focusGroup.appendChild(focusLbl);
        body.appendChild(focusGroup);

        focusCb.addEventListener('change', function () {
            if (window.focusMode && window.focusMode.isActive() !== focusCb.checked) {
                window.focusMode.toggle();
            }
        });

        // Format Presets
        var fmtLabel = document.createElement('label');
        fmtLabel.className = 'brush-section-label';
        fmtLabel.textContent = 'Format';
        fmtLabel.style.marginTop = '8px';
        body.appendChild(fmtLabel);

        var fmtGrid = document.createElement('div');
        fmtGrid.className = 'stream-format-grid';

        var formats = (window.focusMode && window.focusMode.FORMATS) || [];
        var btns = [];

        for (var i = 0; i < formats.length; i++) {
            (function (fmt) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = fmt.label;
                btn.dataset.formatId = fmt.id;
                btn.addEventListener('click', function () {
                    if (btn.classList.contains('active')) {
                        if (window.focusMode) window.focusMode.clearFormat();
                    } else {
                        if (window.focusMode) window.focusMode.applyFormat(fmt);
                    }
                });
                fmtGrid.appendChild(btn);
                btns.push(btn);
            })(formats[i]);
        }

        body.appendChild(fmtGrid);

        // Format info display
        var fmtInfo = document.createElement('div');
        fmtInfo.className = 'stream-format-info';
        fmtInfo.textContent = 'Freeform';
        body.appendChild(fmtInfo);

        // Lock format checkbox
        var lockGroup = document.createElement('div');
        lockGroup.className = 'control-group checkbox-group';
        lockGroup.style.marginTop = '6px';
        var lockCb = document.createElement('input');
        lockCb.type = 'checkbox';
        lockCb.id = 'streamFormatLock';
        var lockLbl = document.createElement('label');
        lockLbl.setAttribute('for', 'streamFormatLock');
        lockLbl.style.margin = '0';
        lockLbl.textContent = 'Lock Format';
        lockGroup.appendChild(lockCb);
        lockGroup.appendChild(lockLbl);
        body.appendChild(lockGroup);

        // Register with focus mode API
        if (window.focusMode) {
            window.focusMode.registerFormatButtons(btns);
            window.focusMode.registerFormatInfo(fmtInfo);
            window.focusMode.registerLockCheckbox(lockCb);
        }

        return sec;
    }

    function buildRecordingSection() {
        const { sec, body } = makeSection('Recording', 'expressive', true);

        moveControlGroup('recMode', body);
        moveEl('recMini', body);

        return sec;
    }

    function buildExportSection() {
        const { sec, body } = makeSection('Export', 'system', true);

        // Export status display
        var statusDiv = document.createElement('div');
        statusDiv.id = 'exportStatus';
        statusDiv.style.cssText = 'display:none;font-size:11px;padding:6px;background:rgba(0,0,0,0.3);border-radius:4px;margin-bottom:8px;text-align:center;color:#58a6ff;';
        body.appendChild(statusDiv);

        // ── D7-1: Project file (.fluid) — save/load the whole stack ──
        var projLabel = document.createElement('label');
        projLabel.className = 'brush-section-label';
        projLabel.textContent = 'Project (.fluid)';
        body.appendChild(projLabel);
        var projGrid = document.createElement('div');
        projGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;';
        var saveProjBtn = document.createElement('button');
        saveProjBtn.textContent = '💾 Save Project';
        saveProjBtn.title = 'Download the whole project (layers, masks, bindings, brush presets, colors…) as a .fluid file';
        saveProjBtn.style.cssText = 'padding:8px;background:rgba(180,130,255,0.15);border:1px solid rgba(180,130,255,0.35);color:#c8a2ff;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        saveProjBtn.addEventListener('click', function () {
            var nm = window.prompt ? window.prompt('Project name', 'fluid-project') : 'fluid-project';
            if (nm === null) return; // cancelled
            if (window.projectFile) window.projectFile.export(nm);
        });
        projGrid.appendChild(saveProjBtn);
        var loadProjBtn = document.createElement('button');
        loadProjBtn.textContent = '📂 Load Project';
        loadProjBtn.title = 'Load a .fluid project file (replaces the current stack)';
        loadProjBtn.style.cssText = 'padding:8px;background:rgba(180,130,255,0.08);border:1px solid rgba(180,130,255,0.25);color:#c8a2ff;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        var projInput = document.createElement('input');
        projInput.type = 'file';
        projInput.accept = '.fluid,application/json';
        projInput.style.display = 'none';
        loadProjBtn.addEventListener('click', function () { projInput.click(); });
        projInput.addEventListener('change', function (e) {
            var f = e.target.files && e.target.files[0];
            if (f && window.projectFile) window.projectFile.import(f, function (err) {
                if (err) alert('Project load failed: ' + err.message);
            });
            projInput.value = '';
        });
        projGrid.appendChild(loadProjBtn);
        body.appendChild(projGrid);
        body.appendChild(projInput);

        // Progress bar
        var progressWrap = document.createElement('div');
        progressWrap.id = 'exportProgress';
        progressWrap.style.cssText = 'display:none;height:4px;background:rgba(0,0,0,0.3);border-radius:2px;overflow:hidden;margin-bottom:12px;';
        var progressBar = document.createElement('div');
        progressBar.id = 'exportProgressBar';
        progressBar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#3fb950,#58a6ff);transition:width 0.2s;';
        progressWrap.appendChild(progressBar);
        body.appendChild(progressWrap);

        // Quick export buttons
        var quickLabel = document.createElement('label');
        quickLabel.className = 'brush-section-label';
        quickLabel.textContent = 'Quick Export';
        body.appendChild(quickLabel);

        var quickGrid = document.createElement('div');
        quickGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;';

        var videoBtn = document.createElement('button');
        videoBtn.textContent = '🎬 Video';
        videoBtn.style.cssText = 'padding:8px;background:rgba(88,166,255,0.15);border:1px solid rgba(88,166,255,0.3);color:#58a6ff;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        videoBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.video();
        });
        quickGrid.appendChild(videoBtn);

        var gifBtn = document.createElement('button');
        gifBtn.textContent = '🎨 GIF';
        gifBtn.style.cssText = 'padding:8px;background:rgba(63,185,80,0.15);border:1px solid rgba(63,185,80,0.3);color:#3fb950;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        gifBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.gif();
        });
        quickGrid.appendChild(gifBtn);

        var stillBtn = document.createElement('button');
        stillBtn.textContent = '📸 Still';
        stillBtn.style.cssText = 'padding:8px;background:rgba(210,153,34,0.15);border:1px solid rgba(210,153,34,0.3);color:#d29922;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        stillBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.still();
        });
        quickGrid.appendChild(stillBtn);

        var seqBtn = document.createElement('button');
        seqBtn.textContent = '🎞️ Sequence';
        seqBtn.style.cssText = 'padding:8px;background:rgba(248,81,73,0.15);border:1px solid rgba(248,81,73,0.3);color:#f85149;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        seqBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.sequence();
        });
        quickGrid.appendChild(seqBtn);

        body.appendChild(quickGrid);

        // Stop button (hidden until export starts)
        var stopBtn = document.createElement('button');
        stopBtn.id = 'exportStopBtn';
        stopBtn.textContent = '⏹ Cancel Export';
        stopBtn.style.cssText = 'display:none;width:100%;padding:8px;background:rgba(248,81,73,0.2);border:1px solid rgba(248,81,73,0.4);color:#f85149;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;margin-bottom:12px;';
        stopBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.stop();
        });
        body.appendChild(stopBtn);

        // Video settings
        var videoLabel = document.createElement('label');
        videoLabel.className = 'brush-section-label';
        videoLabel.textContent = 'Video Settings';
        body.appendChild(videoLabel);

        var durationGroup = document.createElement('div');
        durationGroup.className = 'control-group';
        var durationLbl = document.createElement('label');
        durationLbl.textContent = 'Duration (seconds)';
        durationLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var durationInput = document.createElement('input');
        durationInput.type = 'number';
        durationInput.id = 'exportVideoDuration';
        durationInput.min = '1';
        durationInput.max = '300';
        durationInput.value = '15';
        durationInput.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        durationGroup.appendChild(durationLbl);
        durationGroup.appendChild(durationInput);
        body.appendChild(durationGroup);

        var fpsGroup = document.createElement('div');
        fpsGroup.className = 'control-group';
        var fpsLbl = document.createElement('label');
        fpsLbl.textContent = 'Frame Rate';
        fpsLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var fpsSelect = document.createElement('select');
        fpsSelect.id = 'exportVideoFPS';
        fpsSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        [['30','30 fps'],['60','60 fps'],['120','120 fps']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0];
            o.textContent = opt[1];
            if (opt[0] === '60') o.selected = true;
            fpsSelect.appendChild(o);
        });
        fpsGroup.appendChild(fpsLbl);
        fpsGroup.appendChild(fpsSelect);
        body.appendChild(fpsGroup);

        // GIF settings
        var gifLabel = document.createElement('label');
        gifLabel.className = 'brush-section-label';
        gifLabel.textContent = 'GIF Settings';
        gifLabel.style.marginTop = '12px';
        body.appendChild(gifLabel);

        var gifDurationGroup = document.createElement('div');
        gifDurationGroup.className = 'control-group';
        var gifDurationLbl = document.createElement('label');
        gifDurationLbl.textContent = 'Duration (seconds)';
        gifDurationLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var gifDurationInput = document.createElement('input');
        gifDurationInput.type = 'number';
        gifDurationInput.id = 'exportGifDuration';
        gifDurationInput.min = '1';
        gifDurationInput.max = '10';
        gifDurationInput.value = '3';
        gifDurationInput.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        gifDurationGroup.appendChild(gifDurationLbl);
        gifDurationGroup.appendChild(gifDurationInput);
        body.appendChild(gifDurationGroup);

        var gifFpsGroup = document.createElement('div');
        gifFpsGroup.className = 'control-group';
        var gifFpsLbl = document.createElement('label');
        gifFpsLbl.textContent = 'Frame Rate';
        gifFpsLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var gifFpsSelect = document.createElement('select');
        gifFpsSelect.id = 'exportGifFPS';
        gifFpsSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        [['10','10 fps'],['15','15 fps'],['24','24 fps'],['30','30 fps']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0];
            o.textContent = opt[1];
            if (opt[0] === '15') o.selected = true;
            gifFpsSelect.appendChild(o);
        });
        gifFpsGroup.appendChild(gifFpsLbl);
        gifFpsGroup.appendChild(gifFpsSelect);
        body.appendChild(gifFpsGroup);

        // Output folder (Electron only)
        if (typeof require !== 'undefined') {
            var folderLabel = document.createElement('label');
            folderLabel.className = 'brush-section-label';
            folderLabel.textContent = 'Output Folder';
            folderLabel.style.marginTop = '12px';
            body.appendChild(folderLabel);

            var folderRow = document.createElement('div');
            folderRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

            var folderInput = document.createElement('input');
            folderInput.type = 'text';
            folderInput.id = 'exportFolderPath';
            folderInput.readOnly = true;
            folderInput.placeholder = 'No folder set…';
            folderInput.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 8px;color:#c9d1d9;font-size:11px;cursor:pointer;';
            folderInput.addEventListener('click', function() {
                if (window.fluidExport) window.fluidExport.pickFolder();
            });
            folderRow.appendChild(folderInput);

            var folderOpenBtn = document.createElement('button');
            folderOpenBtn.textContent = '📂';
            folderOpenBtn.title = 'Open folder';
            folderOpenBtn.style.cssText = 'background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 8px;color:#c9d1d9;cursor:pointer;font-size:14px;';
            folderOpenBtn.addEventListener('click', function() {
                if (window.fluidExport) window.fluidExport.openFolder();
            });
            folderRow.appendChild(folderOpenBtn);

            body.appendChild(folderRow);

            // Load saved folder path
            setTimeout(function() {
                if (window.fluidExport) {
                    var c = window.fluidExport.getConfig();
                    if (c.outputFolder) folderInput.value = c.outputFolder;
                }
            }, 500);
        }

        // Load saved settings into UI inputs
        setTimeout(function() {
            if (window.fluidExport) {
                var c = window.fluidExport.getConfig();
                durationInput.value = Math.round(c.videoDuration / 1000);
                fpsSelect.value = String(c.videoFPS);
                gifDurationInput.value = Math.round(c.gifDuration / 1000);
                gifFpsSelect.value = String(c.gifFPS);
            }
        }, 500);

        // Wire settings changes
        durationInput.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('videoDuration', parseInt(durationInput.value) * 1000);
            }
        });

        fpsSelect.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('videoFPS', parseInt(fpsSelect.value));
            }
        });

        gifDurationInput.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('gifDuration', parseInt(gifDurationInput.value) * 1000);
            }
        });

        gifFpsSelect.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('gifFPS', parseInt(gifFpsSelect.value));
            }
        });

        return sec;
    }

    function buildMultiArtistSection() {
        // Collapsed by default like the rest of the sidebar (UI starts fully collapsed).
        const { sec, body } = makeSection('Multiplayer', 'core', true);

        // Move the multiplayer panel
        var panel = document.getElementById('multiArtistPanel');
        if (panel) body.appendChild(panel);

        // Move hidden toggle for legacy compat
        var toggle = document.getElementById('multiplayerToggle');
        if (toggle) body.appendChild(toggle);

        // When the section is expanded by the user, focus the join field so a
        // joiner can paste a room # immediately (only while disconnected).
        var header = sec.querySelector('.section-header');
        if (header) header.addEventListener('click', function () {
            if (sec.classList.contains('collapsed')) return; // just collapsed
            var dc = document.getElementById('mpDisconnected');
            var ji = document.getElementById('joinRoomInput');
            if (ji && dc && dc.style.display !== 'none') {
                setTimeout(function () { ji.focus(); ji.select(); }, 50);
            }
        });

        return sec;
    }

    function buildSettingsSection(controls) {
        const { sec, body } = makeSection('Settings', 'system', true);

        // Settings save/load/clear
        const saveBtn = document.getElementById('saveSettingsBtn');
        if (saveBtn) {
            const group = saveBtn.closest('.control-group');
            if (group) { group.style.cssText = ''; body.appendChild(group); }
        }

        // Stats toggle
        moveCheckboxGroup('statsToggle', body);

        // ── User Presets Management ──
        var presetSection = document.createElement('div');
        presetSection.style.cssText = 'margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);';

        var presetLabel = document.createElement('label');
        presetLabel.style.cssText = 'display:block; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:rgba(255,255,255,0.5); margin-bottom:6px;';
        presetLabel.textContent = 'Saved Presets';
        presetSection.appendChild(presetLabel);

        var presetList = document.createElement('div');
        presetList.id = 'sidebarPresetList';
        presetList.className = 'user-presets-list';
        presetSection.appendChild(presetList);

        body.appendChild(presetSection);

        // ── ComfyUI Bridge ──
        var comfySection = document.createElement('div');
        comfySection.style.cssText = 'margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);';

        var comfyLabel = document.createElement('label');
        comfyLabel.style.cssText = 'display:block; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:rgba(255,255,255,0.5); margin-bottom:6px;';
        comfyLabel.textContent = 'Set Save To Folder (Ctrl+Enter)';
        comfySection.appendChild(comfyLabel);

        var comfyRow = document.createElement('div');
        comfyRow.style.cssText = 'display:flex; gap:6px; align-items:center;';

        var comfyInput = document.createElement('input');
        comfyInput.type = 'text';
        comfyInput.id = 'comfyuiFolderPath';
        comfyInput.placeholder = 'Paste path or click 📂';
        comfyInput.style.cssText = 'flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:6px 8px; color:#c9d1d9; font-size:11px;';
        comfyInput.value = (window.comfyuiBridge && window.comfyuiBridge.getConfig().outputFolder) || '';
        comfyInput.addEventListener('change', function() {
            if (window.comfyuiBridge && comfyInput.value.trim()) {
                window.comfyuiBridge.setConfig('outputFolder', comfyInput.value.trim());
            }
        });
        comfyInput.addEventListener('paste', function() {
            setTimeout(function() {
                if (window.comfyuiBridge && comfyInput.value.trim()) {
                    window.comfyuiBridge.setConfig('outputFolder', comfyInput.value.trim());
                }
            }, 0);
        });
        comfyRow.appendChild(comfyInput);

        var comfyFolderBtn = document.createElement('button');
        comfyFolderBtn.textContent = '📂';
        comfyFolderBtn.title = 'Pick or open folder';
        comfyFolderBtn.style.cssText = 'background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:4px 8px; color:#c9d1d9; cursor:pointer; font-size:14px;';
        comfyFolderBtn.addEventListener('click', function() {
            if (!window.comfyuiBridge) return;
            var cfg = window.comfyuiBridge.getConfig();
            if (cfg.outputFolder) {
                // If folder is set, open it
                window.comfyuiBridge.openFolder();
            } else {
                // If no folder, pick one
                window.comfyuiBridge.pickFolder();
            }
        });
        comfyRow.appendChild(comfyFolderBtn);

        comfySection.appendChild(comfyRow);

        // Capture resolution row (fixed output size for consistency)
        var capRow = document.createElement('div');
        capRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';
        var capLbl = document.createElement('span');
        capLbl.textContent = 'Capture';
        capLbl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.5);min-width:48px;';
        var capW = document.createElement('input');
        capW.type = 'number';
        capW.placeholder = 'W';
        capW.min = '0';
        capW.style.cssText = 'width:60px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 6px;color:#c9d1d9;font-size:11px;';
        var capH = document.createElement('input');
        capH.type = 'number';
        capH.placeholder = 'H';
        capH.min = '0';
        capH.style.cssText = 'width:60px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 6px;color:#c9d1d9;font-size:11px;';
        var capHint = document.createElement('span');
        capHint.textContent = '0=auto';
        capHint.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);';
        // Load saved values
        if (window.comfyuiBridge) {
            var capCfg = window.comfyuiBridge.getConfig();
            if (capCfg.captureWidth) capW.value = capCfg.captureWidth;
            if (capCfg.captureHeight) capH.value = capCfg.captureHeight;
        }
        function saveCapRes() {
            if (!window.comfyuiBridge) return;
            window.comfyuiBridge.setConfig('captureWidth', parseInt(capW.value, 10) || 0);
            window.comfyuiBridge.setConfig('captureHeight', parseInt(capH.value, 10) || 0);
        }
        capW.addEventListener('change', saveCapRes);
        capH.addEventListener('change', saveCapRes);
        capRow.appendChild(capLbl);
        capRow.appendChild(capW);
        capRow.appendChild(capH);
        capRow.appendChild(capHint);
        comfySection.appendChild(capRow);

        // ComfyUI writes canvas frames to a local watched folder (Electron/filesystem
        // only) — it cannot work in a browser, so only show the control in the desktop
        // app. window.comfyuiBridge exists ONLY in Electron (comfyui-bridge.js guards on
        // `require`), so this hides it on web AND mobile.
        if (window.comfyuiBridge) body.appendChild(comfySection);

        // Render function
        function renderSidebarPresets() {
            if (!presetList || !window.Settings) return;
            var presets = window.Settings.getAllPresets();
            var names = Object.keys(presets).sort(function(a, b) {
                return ((presets[b] && presets[b].timestamp) || 0) - ((presets[a] && presets[a].timestamp) || 0);
            });
            presetList.innerHTML = '';
            if (names.length === 0) {
                presetList.innerHTML = '<div style="text-align:center; opacity:0.4; font-size:10px; padding:6px 0;">Use + in the top bar to save presets</div>';
                return;
            }
            names.forEach(function(name) {
                var row = document.createElement('div');
                row.className = 'user-preset-row';

                var btn = document.createElement('button');
                btn.className = 'user-preset-btn';
                btn.textContent = name;
                btn.title = 'Load "' + name + '"';
                btn.addEventListener('click', function() {
                    // Full-state apply — see 12-save-load: a preset click must
                    // land on a complete deterministic state.
                    if (typeof window.applyPresetSnapshotFull === 'function') {
                        window.applyPresetSnapshotFull(presets[name]);
                    } else if (typeof window.applyPresetSnapshot === 'function') {
                        window.applyPresetSnapshot(presets[name]);
                    }
                    presetList.querySelectorAll('.user-preset-btn').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                });

                var overwriteBtn = document.createElement('button');
                overwriteBtn.className = 'user-preset-overwrite';
                overwriteBtn.textContent = '\u21BB';
                overwriteBtn.title = 'Overwrite with current settings';
                overwriteBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var snapshot = typeof window.capturePresetSnapshot === 'function' ? window.capturePresetSnapshot() : null;
                    if (snapshot) {
                        if (typeof window.saveUserPreset === 'function') {
                            window.saveUserPreset(name, snapshot);
                        } else {
                            window.Settings.savePreset(name, snapshot);
                        }
                        if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                        overwriteBtn.textContent = '\u2713';
                        setTimeout(function() { overwriteBtn.textContent = '\u21BB'; }, 1000);
                    }
                });

                var delBtn = document.createElement('button');
                delBtn.className = 'user-preset-delete';
                delBtn.textContent = '\u00D7';
                delBtn.title = 'Delete "' + name + '"';
                delBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    window.Settings.deletePreset(name);
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                });

                row.appendChild(btn);
                row.appendChild(overwriteBtn);
                row.appendChild(delBtn);
                presetList.appendChild(row);
            });
        }

        setTimeout(renderSidebarPresets, 600);
        window.renderSidebarPresets = renderSidebarPresets;

        return sec;
    }

    // ─── ARM COLORS DROPDOWN ────────────────────────────────────

    function buildArmColorsDropdown(triggerEl) {
        // Use an existing element (e.g. the multiplier value) as the toggle, or
        // fall back to a standalone gold icon button.
        var toggle;
        if (triggerEl) {
            toggle = triggerEl;
            toggle.classList.add('arm-colors-trigger');
            toggle.title = 'Per-arm brush colors \u2014 click to configure';
        } else {
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'arm-colors-toggle';
            toggle.textContent = '\u2726';
            toggle.title = 'Per-arm color settings';
        }

        var panel = document.createElement('div');
        // arm-colors-rows marks THE arm-colors popup: the brush drawer and the
        // presets popup share the .arm-colors-panel skin, so 05g needs a class
        // that only this one carries to decide whether a rebuild is visible.
        panel.className = 'arm-colors-panel arm-colors-rows';
        panel.style.display = 'none';
        panel.style.position = 'fixed';
        document.body.appendChild(panel);

        // Once the user has dragged the panel somewhere, it stays there for the
        // rest of that opening — re-anchoring under the trigger would undo the
        // move on the next resize. Reset on close, so each fresh open starts
        // predictably under the trigger.
        var userMoved = false;

        function positionPanel() {
            if (userMoved) return;
            // Panel is zoomed via --ui-scale; fixed left/top are interpreted in the
            // zoomed coordinate space, so compute in screen px then divide by zoom.
            var z = window.UIScale ? window.UIScale.get() : 1;
            var rect = toggle.getBoundingClientRect();
            var panelW = 220;
            var left = rect.left + rect.width / 2 - (panelW * z) / 2;
            // Clamp to viewport (screen px)
            left = Math.max(4, Math.min(left, window.innerWidth - panelW * z - 4));
            panel.style.left = (left / z) + 'px';
            panel.style.top = ((rect.bottom + 4) / z) + 'px';
            panel.style.width = panelW + 'px';
            // 8 arms + the arm-count fader outgrows a short viewport: cap to the
            // space under the trigger and scroll the overflow (same guard the
            // brush drawer needs).
            panel.style.maxHeight = Math.max(180, (window.innerHeight - rect.bottom - 16) / z) + 'px';
            panel.style.overflowY = 'auto';
        }

        // A silent drag strip where the "Brush Colors" title bar used to be
        // (2026-08-16): the title only restated the control you just clicked,
        // and the ✕ was a fourth way to close a panel the trigger, the gear and
        // any click outside the canvas already close. The strip itself stays —
        // something has to be grabbable (see the drag note below).
        var header = document.createElement('div');
        header.className = 'arm-colors-header arm-colors-grip';
        header.title = 'Drag to move';
        panel.appendChild(header);

        // Drag by the header so the panel can be moved off whatever you are
        // trying to look at — the whole point being to pick a colour against
        // the art underneath it. Draggable handles pointer capture, viewport
        // clamping and the --ui-scale zoom conversion this panel needs.
        try {
            if (typeof Draggable !== 'undefined') {
                new Draggable(panel, {
                    handle: header,
                    constrainToViewport: true,
                    onDragStart: function () { userMoved = true; }
                });
            }
        } catch (_) {}

        // Arm count leads the panel: this IS the Multi-Brush panel, so the
        // number of arms belongs next to the symmetry and per-arm colors it
        // governs — reaching back out to the strip fader to change it, then
        // back in here, was the whole complaint. A duplicate slider, NOT a
        // moved one: #multiplier stays in the strip and stays the single source
        // of truth. This proxy writes it and dispatches 'input', so every
        // existing listener (05e's animationMultiplier, the strip's value cell,
        // the arm rows below) runs exactly as it does for a direct drag.
        // Query through the channel, not the document: faderChannel has already
        // re-parented #multiplier into the Multi-Brush channel and that channel
        // is still DETACHED at this point, so document.getElementById returns
        // null here — the same trap the trigger lookup above documents. (The
        // "rebuild when multiplier changes" listener at the foot of this
        // function had been silently dead on that null since the strip was
        // built; it shares this handle now.)
        var multHost = toggle.closest ? toggle.closest('.mixer-channel') : null;
        var mainMult = (multHost && multHost.querySelector('#multiplier'))
            || document.getElementById('multiplier');
        var multGroup = document.createElement('div');
        multGroup.className = 'control-group';
        var multLbl = document.createElement('label');
        multLbl.setAttribute('for', 'multiplierPanel');
        multLbl.innerHTML = 'Multi-Brush <span class="value-display" id="multiplierPanelValue">1x</span>';
        var multVal = multLbl.querySelector('.value-display');
        var multSlider = document.createElement('input');
        multSlider.type = 'range';
        multSlider.id = 'multiplierPanel';
        multSlider.min = '1';
        multSlider.max = '8';
        multSlider.step = '1';
        multSlider.value = mainMult ? mainMult.value : '1';
        multGroup.appendChild(multLbl);
        multGroup.appendChild(multSlider);
        panel.appendChild(multGroup);

        // panel → strip. Setting .value never fires an event on its own, so the
        // dispatch is what keeps the two honest; the strip's 'input' handler
        // (registered further down) calls pullMultiplier right back, which is a
        // no-op when the values already match — no ping-pong.
        multSlider.addEventListener('input', function () {
            if (!mainMult) return;
            mainMult.value = multSlider.value;
            try { mainMult.style.setProperty('--val', multSlider.value); } catch (_) {}
            mainMult.dispatchEvent(new Event('input', { bubbles: true }));
        });
        // strip → panel (also the open-time refresh, for the writers that set
        // the slider by property without an event: hotkeys 1-8, kaleido, presets)
        function pullMultiplier() {
            if (!mainMult) return;
            if (multSlider.value !== mainMult.value) {
                multSlider.value = mainMult.value;
                try { multSlider.style.setProperty('--val', mainMult.value); } catch (_) {}
            }
            multVal.textContent = (parseInt(mainMult.value, 10) || 1) + 'x';
        }
        pullMultiplier();

        // Symmetry follows: the mode decides what the arms listed below
        // actually are. The element is authored in index.html and MOVED here,
        // not cloned — a clone would leave the persisted #symmetryMode id
        // pointing at a stale hidden copy.
        var symGroup = document.getElementById('symmetryModeGroup');
        if (symGroup) {
            symGroup.style.padding = '';
            panel.appendChild(symGroup);
        }
        var symNote = document.createElement('div');
        symNote.className = 'arm-sym-note';
        symNote.style.cssText = 'padding:2px 0 6px;font-size:9px;color:rgba(255,255,255,0.45);';
        panel.appendChild(symNote);

        function updateSymNote() {
            var slider = document.getElementById('multiplier');
            var n = slider ? parseInt(slider.value, 10) || 1 : 1;
            var mode = (window.config && window.config.SYMMETRY_MODE) || 'radial';
            var dabs = n;
            if (typeof window.symmetryTransforms === 'function') {
                try { dabs = window.symmetryTransforms(mode, n, 1, 0).length; } catch (_) {}
            }
            // The dab count, not the arm count, is what costs: Quad at 8 arms
            // is 32 splats per stroke sample, and nothing else on screen says so.
            symNote.textContent = n + (n === 1 ? ' arm → ' : ' arms → ') +
                dabs + (dabs === 1 ? ' dab' : ' dabs') + ' per stroke sample';
        }
        if (symGroup) {
            var symSel = symGroup.querySelector('#symmetryMode');
            if (symSel) symSel.addEventListener('change', updateSymNote);
        }

        var rowsWrap = document.createElement('div');
        rowsWrap.className = 'arm-colors-rows';
        panel.appendChild(rowsWrap);

        function ensureArmConfig(count) {
            var arr = window.multiArmColors;
            if (!arr) { arr = []; window.multiArmColors = arr; }
            while (arr.length < count) {
                arr.push({ mode: 'main', color: '#ffffff', stepIndex: 0 });
            }
        }

        function persistArmColors() {
            if (!window.settingsManager) return;
            var arr = window.multiArmColors || [];
            window.settingsManager.set('brush.armColors', arr.map(function(c) {
                return { mode: c.mode, color: c.color, stepIndex: c.stepIndex || 0 };
            }));
        }
        // Exposed for the picker→arm-0 sync in 05g (two-way brush color sync)
        window.persistArmColors = persistArmColors;

        // Restore persisted arm colors once the sim script (which declares
        // `var multiArmColors`) has loaded — mutate the array in place so the
        // sim's reference stays valid.
        (function restoreArmColors() {
            if (!window.__scriptsReady) { setTimeout(restoreArmColors, 250); return; }
            var saved = window.settingsManager && window.settingsManager.get('brush.armColors', null);
            var arr = window.multiArmColors;
            if (!arr) { arr = []; window.multiArmColors = arr; }
            if (saved && Array.isArray(saved) && saved.length) {
                arr.length = 0;
                saved.forEach(function(c) {
                    // 'rainbow' (removed 2026-08-15) must be coerced HERE
                    // too: this ingest runs LAST at boot — 12's sanitized
                    // autoload is discarded when deferred 05g re-creates
                    // multiArmColors, then this re-reads raw localStorage.
                    // Without the coercion a pre-removal save resurrected
                    // the dead mode every launch (row showed no active
                    // mode, arm painted fallback).
                    var mode = (c.mode === 'rainbow') ? 'fixed' : (c.mode || 'main');
                    arr.push({ mode: mode, color: c.color || '#ffffff', stepIndex: c.stepIndex || 0 });
                });
            } else {
                // No saved per-arm config: import the active brush's mode from the
                // legacy checkboxes set by preseedPaletteOnLoad / autoload, so the
                // palette-preseed "auto-step" surfaces in BOTH colour UIs and in
                // recording. Otherwise arm 0 would stay 'main' and the reconcile
                // below would wipe the visibly-checked Step/Rnd state.
                if (!arr[0]) arr[0] = { mode: 'main', color: '#ffffff', stepIndex: 0 };
                if (arr[0].mode === 'main') {
                    var rndEl = document.getElementById('randomColor');
                    var stepC = document.getElementById('stepPalette');
                    if (stepC && stepC.checked) arr[0].mode = 'step';
                    else if (rndEl && rndEl.checked) arr[0].mode = 'random';
                }
            }
            if (panel.style.display !== 'none') rebuildRows();
            // Reconcile every colour widget to arm0.mode at startup.
            if (typeof window.syncBrushColorUI === 'function') window.syncBrushColorUI({ skipPanel: true });
        })();

        // Two-way sync, panel → main picker: arm 0 IS the brush, so giving it
        // a fixed color should be the same act as picking a color in the
        // sidebar picker (dispatching 'input' also unchecks random/step and
        // applies pointer.color via 05g's listener). The reverse direction
        // (picker → arm 0) lives in 05g's colorPicker input handler.
        function syncMainPickerFromArm0() {
            // Superseded by the 05g controller: reflect arm0.mode into the
            // top-nav colour channel (picker + Rnd/Step/Rainbow chips + hidden
            // checkboxes) by PROPERTY only. The old version dispatched a picker
            // 'input', which fed back into the colour handlers — removed. Kept as
            // a thin alias for any remaining callers.
            if (typeof window.syncBrushColorUI === 'function') window.syncBrushColorUI({ skipPanel: true });
        }

        function rebuildRows() {
            rowsWrap.innerHTML = '';
            var slider = document.getElementById('multiplier');
            var count = slider ? parseInt(slider.value, 10) || 1 : 1;
            // Brush controls exist at EVERY arm count (2026-07-13) — at 1x the
            // single row IS the brush's color mode (follow/fixed/random/
            // step). The old "set multiplier to 2+" hint gated the
            // whole panel behind multi-arm mode.
            count = Math.max(1, count);
            updateSymNote();   // arm count feeds the dab-count hint
            ensureArmConfig(count);
            var arr = window.multiArmColors;

            for (var i = 0; i < count; i++) {
                (function(idx) {
                    var cfg = arr[idx];
                    var row = document.createElement('div');
                    row.className = 'arm-row';

                    var label = document.createElement('span');
                    label.className = 'arm-label';
                    label.textContent = String(idx + 1);
                    row.appendChild(label);

                    var picker = document.createElement('input');
                    picker.type = 'color';
                    picker.className = 'arm-picker';
                    // 'main' arms paint the live default color (resolveArmColor
                    // defers to pointer.color), so show THAT — not the arm's
                    // stored custom hex. Display-only: cfg.color is untouched,
                    // and .value is set by property so the picker's input
                    // handler (which flips the arm to 'fixed' and persists)
                    // never fires. Rebuilds re-run this on every default-color
                    // change while the popup is open, so it tracks live.
                    if (cfg.mode === 'main') {
                        var mainPk = document.getElementById('colorPicker');
                        picker.value = (mainPk && mainPk.value) || cfg.color || '#ffffff';
                    } else {
                        picker.value = cfg.color || '#ffffff';
                    }
                    picker.disabled = cfg.mode !== 'fixed';
                    // Generative modes (random/step) dim the swatch —
                    // no single color is "the" color. A 'main' arm's swatch is
                    // accurate (it IS the default color), so keep it readable.
                    if (cfg.mode !== 'fixed') {
                        picker.style.opacity = (cfg.mode === 'main') ? '0.8' : '0.35';
                    }

                    var modes = [
                        { key: 'main',    text: '\u25CF', title: 'Follow pointer color' },
                        { key: 'fixed',   text: '\u25C6', title: 'Fixed color' },
                        // 'rainbow' removed 2026-08-15 (photosensitivity)
                        { key: 'random',  text: 'R',      title: 'Random — new color each stroke' },
                        { key: 'step',    text: 'S',      title: 'Palette mode — new palette colour each stroke' }
                    ];

                    var modeWrap = document.createElement('div');
                    modeWrap.className = 'arm-mode-wrap';
                    var btns = [];

                    modes.forEach(function(m) {
                        var btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'arm-mode-btn' + (cfg.mode === m.key ? ' active' : '');
                        btn.textContent = m.text;
                        btn.title = m.title;
                        btn.dataset.mode = m.key;
                        var isActive = cfg.mode === m.key;
                        btn.style.cssText = 'all:unset;box-sizing:border-box;padding:4px 6px;font-size:10px;border-radius:0;background:' + (isActive ? '#ec3013' : 'rgba(255,255,255,0.08)') + ';color:' + (isActive ? '#fff' : 'rgba(255,255,255,0.6)') + ';border:1px solid ' + (isActive ? '#ec3013' : 'rgba(255,255,255,0.1)') + ';cursor:pointer;';
                        btn.addEventListener('click', function() {
                            cfg.mode = m.key;
                            cfg.cachedColor = null;
                            if (m.key === 'fixed' && cfg.color === '#ffffff') {
                                // Auto-pick a hue based on arm index
                                var hue = Math.round((idx / (count || 1)) * 360) % 360;
                                cfg.color = hslToHex(hue, 80, 55);
                                picker.value = cfg.color;
                            }
                            btns.forEach(function(b) {
                                var active = b.dataset.mode === m.key;
                                b.classList.toggle('active', active);
                                b.style.background = active ? '#ec3013' : 'rgba(255,255,255,0.08)';
                                b.style.color = active ? '#fff' : 'rgba(255,255,255,0.6)';
                                b.style.borderColor = active ? '#ec3013' : 'rgba(255,255,255,0.1)';
                            });
                            picker.disabled = m.key !== 'fixed';
                            picker.style.opacity = m.key === 'fixed' ? '1' : '0.35';
                            persistArmColors();
                            // Arm 0 is the active brush: reflect its new mode into
                            // the top-nav chips + hidden checkboxes (skipPanel — we
                            // ARE the panel, and the buttons above already updated).
                            if (idx === 0 && typeof window.syncBrushColorUI === 'function') {
                                window.syncBrushColorUI({ skipPanel: true });
                            }
                        });
                        btns.push(btn);
                        modeWrap.appendChild(btn);
                    });

                    picker.addEventListener('input', function() {
                        cfg.color = picker.value;
                        if (cfg.mode !== 'fixed') {
                            cfg.mode = 'fixed';
                            btns.forEach(function(b) {
                                var active = b.dataset.mode === 'fixed';
                                b.classList.toggle('active', active);
                                b.style.background = active ? '#ec3013' : 'rgba(255,255,255,0.08)';
                                b.style.color = active ? '#fff' : 'rgba(255,255,255,0.6)';
                                b.style.borderColor = active ? '#ec3013' : 'rgba(255,255,255,0.1)';
                            });
                            picker.disabled = false;
                            picker.style.opacity = '1';
                        }
                        persistArmColors();
                        // Arm 0 picker = the active brush's fixed swatch: route
                        // through the controller so pointer.color updates now and
                        // the top-nav picker/chips reflect it (skipPanel — mid
                        // colour-input, don't rebuild the row under the cursor).
                        if (idx === 0 && typeof window.setActiveBrushColorMode === 'function') {
                            window.setActiveBrushColorMode('fixed', { color: cfg.color, skipPanel: true });
                        }
                    });

                    row.appendChild(picker);
                    row.appendChild(modeWrap);
                    rowsWrap.appendChild(row);
                })(i);
            }
        }

        function closePanel() {
            panel.style.display = 'none';
            toggle.classList.remove('active');
            userMoved = false;   // next open re-anchors under the trigger
        }

        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            var open = panel.style.display !== 'none';
            if (open) {
                closePanel();
            } else {
                panel.style.display = 'block';
                toggle.classList.add('active');
                pullMultiplier();
                positionPanel();
                rebuildRows();
            }
        });

        // Close when clicking elsewhere in the UI — but NOT on the canvas. Any
        // canvas click used to dismiss this, so you could never hold a colour
        // open while working against the art you were picking for, which is
        // most of the reason to move the panel at all.
        document.addEventListener('click', function(e) {
            if (panel.style.display === 'none' || panel.contains(e.target) || e.target === toggle) return;
            var onCanvas = e.target && e.target.closest &&
                (e.target.id === 'canvas' || e.target.closest('#canvas, #canvas-wrapper, #canvas-area'));
            if (onCanvas) return;
            closePanel();
        });
        panel.addEventListener('click', function(e) { e.stopPropagation(); });

        // Reposition or close on resize
        window.addEventListener('resize', function() {
            if (panel.style.display !== 'none') positionPanel();
        });

        // Rebuild when multiplier changes
        if (mainMult) {
            mainMult.addEventListener('input', function() {
                pullMultiplier();
                if (panel.style.display !== 'none') rebuildRows();
            });
        }

        // Expose rebuild for external use
        window.rebuildArmColorRows = rebuildRows;

        return { toggle: toggle };
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = l - c / 2;
        var r, g, b;
        if (h < 60) { r=c; g=x; b=0; }
        else if (h < 120) { r=x; g=c; b=0; }
        else if (h < 180) { r=0; g=c; b=x; }
        else if (h < 240) { r=0; g=x; b=c; }
        else if (h < 300) { r=x; g=0; b=c; }
        else { r=c; g=0; b=x; }
        var toHex = function(v) { var h = Math.round((v + m) * 255).toString(16); return h.length < 2 ? '0' + h : h; };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    // ─── HELPERS ─────────────────────────────────────────────────

    // ZBrush-style accordion (Gabriel, 2026-08-22): opening a section closes
    // every other open one, so what you are working on stays a single tight
    // cluster instead of a 16-section scroll. Shift+click opts out and toggles
    // one section on its own, for the "watch Multiplayer while I read Settings"
    // case. The header tooltip is the only place that override is advertised.
    const SECTION_HINT = 'Click to open — the other sections close. Shift+click to keep them open.';

    function persistSectionState() {
        try {
            var sections = {};
            document.querySelectorAll('#sidebar-right .sidebar-section').forEach(function (sec) {
                var titleEl = sec.querySelector('.section-title');
                if (titleEl) sections[titleEl.textContent.trim()] = sec.classList.contains('collapsed');
            });
            if (window.settingsManager) window.settingsManager.set('sidebar.sections', sections);
        } catch (_) {}
    }

    // Layout-free: is any EXPANDED section positioned above `sec`? Only those
    // shorten the content above the clicked header when the accordion sweeps,
    // so only those can drag it out from under the cursor.
    function hasOpenSectionAbove(sidebar, sec) {
        const all = sidebar.querySelectorAll('.sidebar-section');
        for (var i = 0; i < all.length; i++) {
            if (all[i] === sec) return false;
            if (!all[i].classList.contains('collapsed')) return true;
        }
        return false;
    }

    function toggleSection(sec, additive) {
        if (!sec) return;
        const sidebar = (sec.closest && sec.closest('#sidebar-right')) || sec.parentElement;
        const header = sec.querySelector('.section-header');
        const sweeping = !additive && sec.classList.contains('collapsed') && !!sidebar;

        // Anchor the clicked header: read its viewport position BEFORE the class
        // swap so we can put it back after. Collapsing the sections ABOVE it
        // shortens the scroll content and would otherwise yank the row out from
        // under the cursor — the exact layout shift the accordion is meant to
        // remove. Gated on two layout-FREE checks, because the read costs a
        // forced layout and the correction costs another: it can only help if
        // the sidebar is scrolled (headroom to give back) AND an expanded
        // section actually sits above the click (something to shrink). Measured
        // ~8ms of forced layout on a full sidebar, otherwise spent on a
        // scrollTop that could not move.
        const anchoring = sweeping && !!header && sidebar.scrollTop > 0 && hasOpenSectionAbove(sidebar, sec);
        const before = anchoring ? header.getBoundingClientRect().top : 0;

        // Drop any suppress flags a previous sweep left behind. Doing this on
        // the next click rather than on a rAF is deliberate: rAF parks on a
        // backgrounded tab, which would strand the flag on a collapsed section
        // and silently kill its fade the next time it opened. While collapsed
        // the flag is invisible anyway (0fr row), so clearing it lazily costs
        // nothing and cannot be skipped.
        if (sidebar) {
            sidebar.querySelectorAll('.snap-collapse').forEach(function (o) {
                o.classList.remove('snap-collapse');
            });
        }

        if (sweeping) {
            // One synchronous batch → one style recalc + one layout for the
            // whole sweep, not one per section (and `.sidebar-section` carries
            // `contain: layout style`, so it stops there). `.section-body`
            // opacity is suppressed on the swept sections: their grid row snaps
            // to 0fr immediately, so a dozen concurrent fades would pay for
            // motion nobody can see. The section you opened still fades in.
            sidebar.querySelectorAll('.sidebar-section').forEach(function (other) {
                if (other === sec || other.classList.contains('collapsed')) return;
                other.classList.add('snap-collapse', 'collapsed');
            });
        }

        sec.classList.toggle('collapsed');

        if (anchoring) {
            const drift = header.getBoundingClientRect().top - before;
            if (drift) {
                // #sidebar-right sets scroll-behavior:smooth; an anchor
                // correction must land in the same frame, not animate.
                const prev = sidebar.style.scrollBehavior;
                sidebar.style.scrollBehavior = 'auto';
                sidebar.scrollTop += drift;
                sidebar.style.scrollBehavior = prev;
            }
        }

        persistSectionState();
    }

    function makeSection(title, group, collapsed) {
        const sec = document.createElement('div');
        sec.className = 'sidebar-section' + (collapsed ? ' collapsed' : '');
        if (group) sec.dataset.group = group;

        const header = document.createElement('div');
        header.className = 'section-header';
        header.title = SECTION_HINT;
        header.addEventListener('click', function (e) {
            // Layers puts real command buttons (Capture / 📁 / ✏️ / 🧱) inside
            // its header. A click on one of those is a command, not a toggle —
            // and under the accordion it would collapse the whole sidebar.
            if (e.target && e.target.closest && e.target.closest('.section-header-actions')) return;
            toggleSection(this.parentElement, e.shiftKey);
        });
        header.innerHTML =
            '<span class="section-title">' + title + '</span>' +
            '<span class="section-chevron">▾</span>';
        sec.appendChild(header);

        const body = document.createElement('div');
        body.className = 'section-body';
        sec.appendChild(body);

        return { sec: sec, body: body, header: header };
    }

    function moveEl(id, target) {
        const el = document.getElementById(id);
        if (el) target.appendChild(el);
        return el;
    }

    function moveControlGroup(inputId, target) {
        const el = document.getElementById(inputId);
        if (!el) return;
        const group = el.closest('.control-group');
        if (group) {
            group.style.cssText = '';
            target.appendChild(group);
        } else {
            target.appendChild(el);
        }
    }

    function moveCheckboxGroup(inputId, target) {
        const el = document.getElementById(inputId);
        if (!el) return;
        const group = el.closest('.checkbox-group') || el.closest('.control-group');
        if (group) {
            group.style.cssText = '';
            target.appendChild(group);
        } else {
            target.appendChild(el);
        }
    }

    function divider() {
        const d = document.createElement('div');
        d.className = 'mixer-divider';
        return d;
    }

    function fmtSlider(slider) {
        const val = parseFloat(slider.value);
        const step = parseFloat(slider.step) || 1;
        if (step < 0.01) return val.toFixed(4);
        if (step < 0.1) return val.toFixed(1);
        if (step < 1) return val.toFixed(1);
        return String(val);
    }

})();
