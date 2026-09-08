// ═══════════════════════════════════════════════════════════════════
// js/44-recipes.js — "How do I…": the recipe / solution modal.
// LOAD ORDER: after 43-ui-visibility.js (it reveals hidden sections
//   through UIVisibility and the wrapped window.openSidebarSection).
// PROVIDES: window.Recipes — open(), close(), search(q), show(id), demo(id),
//   next(), prev(), tour(), RECIPES (the registry), plus the '/' hotkey and
//   the strip's ? button.
//
// A FAQ that acts. Every entry is a task in the user's words ("Paste an
// image as a layer"), tagged for fuzzy search, with a two-sentence answer
// and the hotkey. Choosing one does three things: the modal folds down to a
// pill, the control that does the job is REVEALED (Simple mode un-hidden,
// section opened, popup opened, sidebar scrolled) and a guide pointer flies
// to it with a pulsing ring — "moves the mouse to the answer". Entries that
// can be demonstrated safely carry a demo with a way back.
//
// Tasks that take more than one action carry STEPS. The pill becomes a
// stepper: each step reveals and points at its own control, and the step
// completes ITSELF when the app shows the action happened (the layer
// appeared, the toggle is on, the overlay opened, the button was clicked)
// — so a paste, a file pick or a second click walks forward instead of
// dumping the user at the section header. Steps with nothing to watch
// advance on Next. A step can declare what it `needs` (a layer, a room);
// when that is missing the pill says so and offers the recipe that fixes it.
//
// The registry is data; everything else is one modal, one pointer layer and
// a resolver that speaks the app's own reveal vocabulary:
//   section: <title>            sidebar section by .section-title text
//   strip: <data-uiKey>         top-bar cell (Brush Size, Color, Presets…)
//   popup: brush|arms|presets   body-mounted popup, opened via its trigger
//   chrome: underbar            the quality bar bottom-left
//   layer: any|image|collision|last   a Layers row, expanded
//   overlay: mask|transform|recorder|mp   a body-mounted editor / the room panel
//   canvas: true                the canvas itself (pointer at its centre)
//   sel: <css>                  the control inside the revealed container;
//                               the pointer aims at its ROW, like the hotkey caps
//   text: <label>|[labels]      narrow `sel` to the element with that text
//   fallback: <target>          used when the primary cannot be found
//   keepFocus: true             do not leave Focus Mode to reveal this
// and a completion vocabulary for steps (`until`, any-of when an array):
//   { click: true|<css> }       a click lands inside the pointed row / element
//   { pointer: true }           a pointerdown lands there (the canvas)
//   { input|change: true|<css> }  the element fires input / change
//   { event: <name> }           a document event
//   { layerAdded: true }        a new Layers row appears
//   { visible|hidden: <css> }   the element is / is no longer on screen
//   { bodyClass|noBodyClass }   body carries / drops a class
//   { active: true|<css> }      .active, checked or aria-pressed
//   { checked|unchecked: <css> }
//   { value: { sel, is|not } }
//   { check: fn }               anything else
//
// Copy follows the house voice: short, plain, sentence case, 'colour', the
// way back stated, the key in the platform's words.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');

    // ── Small control helpers (same contract as 12-save-load's setVal/setCheck) ──
    function setCtl(id, value, evt) {
        const el = $(id);
        if (!el) return false;
        el.value = String(value);
        if (el.type === 'range') el.style.setProperty('--val', value);
        el.dispatchEvent(new Event(evt || (el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input'), { bubbles: true }));
        return true;
    }
    function setCheck(id, on) {
        const el = $(id);
        if (!el) return false;
        if (el.checked !== !!on) { el.checked = !!on; el.dispatchEvent(new Event('change', { bubbles: true })); }
        return true;
    }
    function busyReason() {
        if (window.__mpSettingsLocked) return 'Settings are locked by the host right now.';
        if (window.__mpTurnBlocked) return 'It is not your turn right now.';
        if (window.fluidExport && window.fluidExport.isExporting && window.fluidExport.isExporting()) return 'An export is running.';
        return null;
    }
    function isShown(el) { return !!el && el.getClientRects().length > 0; }
    function q(sel) { return typeof sel === 'string' ? document.querySelector(sel) : (sel || null); }
    function isActive(el) { return !!el && (el.classList.contains('active') || !!el.checked || el.getAttribute('aria-pressed') === 'true'); }
    // Layer rows: every row but the Sim row carries data-layer-index. A
    // collision row says so in its check label; nothing else marks it.
    function layerRows(kind) {
        const rows = Array.prototype.slice.call(document.querySelectorAll('#layersPanel .layer-item[data-layer-index]'));
        if (!kind || kind === 'any' || kind === 'last') return rows;
        return rows.filter((el) => {
            const lab = el.querySelector('.layer-check-label');
            const isCol = !!lab && lab.textContent.trim() === 'Collision';
            return kind === 'collision' ? isCol : !isCol;
        });
    }

    // ── Pillars (the tag chips) ────────────────────────────────────────
    const PILLARS = [
        ['brush', 'Brush'], ['colour', 'Colour'], ['layers', 'Layers'], ['effects', 'Effects'],
        ['motion', 'Motion'], ['record', 'Record'], ['together', 'Together'], ['export', 'Export'],
        ['interface', 'Interface']
    ];

    // ── The registry ──────────────────────────────────────────────────
    // demo: { label, run(ctx) → undo fn | undefined }. Anything that opens a
    // native dialog, downloads, exports, connects, or reads the clipboard is
    // point-only and has no demo.
    // steps: [{ say, note?, key?, needs?, target?, until? }] — see the header.
    const BRUSH_DRAWER = { strip: 'Brush Size', popup: 'brush' };
    function inDrawer(sel, text) { return { strip: 'Brush Size', popup: 'brush', sel: sel, text: text }; }

    const RECIPES = [
        // ── Brush ──
        { id: 'brush-size', pillar: 'brush', title: 'Change the brush size',
          tags: ['brush', 'size', 'bigger', 'smaller', 'scroll', 'wheel'],
          answer: 'Scroll the wheel over the canvas, or drag the Brush Size fader in the top bar. [ and ] step it from the keyboard; hold Shift for bigger steps.',
          hotkey: '[ ]', target: { strip: 'Brush Size', sel: '#brushSize' },
          demo: { label: 'Try a bigger brush', run() { const el = $('brushSize'); const was = el ? el.value : null; setCtl('brushSize', 30, 'input'); return () => { if (was != null) setCtl('brushSize', was, 'input'); }; } } },
        { id: 'brush-settings', pillar: 'brush', title: 'Open the brush settings',
          tags: ['brush', 'settings', 'drawer', 'tip', 'presets', 'gear'],
          answer: 'Click the Brush Size label in the top bar, or its gear. The drawer holds the tip, custom shapes, spacing, flow and the brush presets.',
          target: BRUSH_DRAWER },
        { id: 'brush-tip', pillar: 'brush', title: 'Change the brush tip, or paint with a shape',
          tags: ['tip', 'shape', 'chisel', 'ring', 'streak', 'blob', 'custom', 'rotate', 'angle'],
          answer: 'In the brush drawer pick Soft, Blob, Chisel, Streak or Ring, or press + to load a shape of your own from an image. Shift+Scroll rotates the tip.',
          hotkey: 'Shift+Scroll', target: inDrawer('.brush-tip-btn'),
          steps: [
            { say: 'In the brush drawer, pick a tip: Soft, Blob, Chisel, Streak or Ring.', target: inDrawer('.brush-tip-row'), until: { click: true } },
            { say: 'Or press + to load a shape of your own from a picture.', note: 'Shift+Scroll over the canvas rotates whichever tip you chose.', key: 'Shift+Scroll', target: inDrawer('.brush-shape-add') }
          ] },
        { id: 'multi-brush', pillar: 'brush', title: 'Paint with several arms at once',
          tags: ['multi', 'arms', 'multiplier', 'mirror', 'symmetry', 'many', 'copies'],
          answer: 'Drag the Multi-Brush fader, or press 1 to 8. Click the 1x value to give each arm its own colour and pick a symmetry.',
          hotkey: '1 – 8', target: { strip: 'Multi-Brush', sel: '#multiplier' },
          demo: { label: 'Try four arms', run() { const el = $('multiplier'); const was = el ? el.value : null; setCtl('multiplier', 4, 'input'); return () => { if (was != null) setCtl('multiplier', was, 'input'); }; } } },
        { id: 'arm-colours', pillar: 'brush', title: 'Give each arm its own colour, or a symmetry',
          tags: ['arms', 'colour', 'symmetry', 'mirror', 'rake', 'radial', 'quad'],
          answer: 'Click the Multi-Brush value cell (or its gear). Each arm gets a colour mode; Symmetry sets how the arms are laid out across the canvas.',
          target: { strip: 'Multi-Brush', popup: 'arms' },
          steps: [
            { say: 'Click the Multi-Brush value cell. Symmetry sets how the arms are laid out: radial, mirrored, a rake.', target: { strip: 'Multi-Brush', popup: 'arms', sel: '#symmetryModeGroup' }, until: { change: true, any: true } },
            { say: 'Each arm below gets its own colour mode: same as the brush, random, or a colour of its own.', target: { popup: 'arms', sel: '.arm-colors-rows' } }
          ] },
        { id: 'material', pillar: 'brush', title: 'Switch between fluid, wet paint and thick paint',
          tags: ['material', 'paint', 'wet', 'thick', 'gloss', 'fluid', 'swirl', 'acrylic', 'clay', 'dry'],
          answer: 'The Fluid label in the top bar is a picker: Swirl, Gloss Paint (Wetness) or Gloss Paint (Thickness). The fader beside it changes meaning with the material.',
          target: { strip: 'Fluid', sel: '#materialMode' } },
        { id: 'constant-flow', pillar: 'brush', title: 'Keep painting while holding still',
          tags: ['flow', 'constant', 'hold', 'still', 'spacing', 'interval', 'move'],
          answer: 'In the brush drawer switch On Move to Constant. The brush keeps depositing while you hold the button; Interval and Flow set the rate.',
          target: inDrawer('.brush-mode-btn', 'Constant'),
          steps: [
            { say: 'In the brush drawer switch On Move to Constant.', target: inDrawer('.brush-mode-btn', 'Constant'), until: { active: true } },
            { say: 'Hold the button still on the canvas: the brush keeps depositing. Flow sets how much lands per dab.', note: 'On Move is the way back.', target: inDrawer('#brushFlow') }
          ] },
        { id: 'pressure-brush', pillar: 'brush', title: 'Move paint around without adding any',
          tags: ['smudge', 'spread', 'gather', 'swirl', 'push', 'pressure', 'stir'],
          answer: 'In the brush drawer choose Pressure and a mode: Smudge drags, Spread pushes out, Gather pulls in, Swirl spins. Nothing new is deposited.',
          target: inDrawer('.brush-mode-btn', 'Pressure'),
          steps: [
            { say: 'In the brush drawer choose Pressure.', target: inDrawer('.brush-mode-btn', 'Pressure'), until: { active: true } },
            { say: 'Pick how it moves the paint: Smudge drags, Spread pushes out, Gather pulls in, Swirl spins.', target: inDrawer('.brush-mode-btn', 'Smudge'),
              until: { check: () => Array.prototype.some.call(document.querySelectorAll('.brush-settings-panel .brush-mode-btn.active'), (b) => /^(Smudge|Spread|Gather|Swirl)$/.test(b.textContent.trim())) } },
            { say: 'Drag on the canvas. Nothing new is deposited. Click Fluid when you want colour again.', target: inDrawer('.brush-mode-btn', 'Fluid') }
          ] },
        { id: 'paint-collider', pillar: 'brush', title: 'Paint walls the fluid flows around',
          tags: ['collider', 'wall', 'collision', 'block', 'obstacle', 'mask'],
          answer: 'In the brush drawer, under Paint Into, click Collider. Strokes become walls; click Fluid to paint dye again. The wall shows in Layers as a collision layer.',
          target: inDrawer('.brush-mode-btn', 'Collider'),
          steps: [
            { say: 'In the brush drawer, under Paint Into, click Collider.', target: inDrawer('.brush-mode-btn', 'Collider'), until: { active: true } },
            { say: 'Paint on the canvas. Strokes become walls, shown as a red film while you paint.', target: { canvas: true }, until: [{ layerAdded: true }, { pointer: true }] },
            { say: 'The wall lives in Layers as a collision layer; uncheck Collision to switch it off. Click Fluid to paint dye again.', target: { layer: 'collision', fallback: inDrawer('.brush-mode-btn', 'Fluid') } }
          ] },
        { id: 'mouse-buttons', pillar: 'brush', title: 'Set what each mouse button does',
          tags: ['mouse', 'button', 'right', 'click', 'replay', 'mirror', 'alternate', 'pen', 'stylus'],
          answer: 'Stroke and replay → Mouse Buttons. Each button can paint, replay the last stroke, mirror your stroke, or paint with an alternate brush.',
          target: { section: 'Stroke and replay', sel: '#buttonMode_left' },
          steps: [
            { say: 'Stroke and replay → Mouse Buttons. Pick a job for the left button.', target: { section: 'Stroke and replay', sel: '#buttonMode_left' }, until: { change: '#buttonMode_left' } },
            { say: 'And for the right: replay the last stroke, mirror your stroke, or paint with an alternate brush.', note: 'Both on replay locks painting out; the panel says so.', target: { sel: '#buttonMode_right' }, until: { change: '#buttonMode_right' } }
          ] },

        // ── Colour ──
        { id: 'brush-colour', pillar: 'colour', title: 'Pick a brush colour',
          tags: ['colour', 'color', 'pick', 'swatch', 'picker', 'hue'],
          answer: 'Click the swatch in the Color cell of the top bar. Shift+S saves the current colour to your swatches; Shift+X clears them.',
          hotkey: 'Shift+S', target: { strip: 'Color', sel: '#colorPicker' },
          steps: [
            { say: 'Click the swatch in the Color cell and pick a colour.', target: { strip: 'Color', sel: '#colorPicker' }, until: { input: '#colorPicker' } },
            { say: 'Shift+S keeps it in your swatches for later; Shift+X clears them.', key: 'Shift+S' }
          ] },
        { id: 'random-colour', pillar: 'colour', title: 'A new colour every stroke',
          tags: ['random', 'rnd', 'cycle', 'palette', 'each', 'stroke', 'colour', 'change'],
          answer: 'In the Color cell switch Rnd for a random colour per stroke, or Cycle to walk through the palette. R and A toggle them from the keyboard.',
          hotkey: 'R / A', target: { strip: 'Color', sel: '.ch-text-toggle', text: 'Rnd' },
          demo: { label: 'Try random colours', run() { if (typeof window.setActiveBrushColorMode !== 'function') return; window.setActiveBrushColorMode('random'); return () => window.setActiveBrushColorMode('fixed'); } },
          steps: [
            { say: 'In the Color cell switch Rnd on.', key: 'R', target: { strip: 'Color', sel: '.ch-text-toggle', text: 'Rnd' }, until: { active: true } },
            { say: 'Paint: every stroke gets a new colour. Cycle walks the palette in order instead.', note: 'Click Rnd again for one fixed colour.', target: { canvas: true }, until: { pointer: true } }
          ] },
        { id: 'palettes', pillar: 'colour', title: 'Use a palette',
          tags: ['palette', 'palettes', 'curated', 'set', 'scheme', 'next', 'previous'],
          answer: 'Colors and palettes holds the curated palettes. Ctrl+← and Ctrl+→ switch palettes; N and Shift+N step to the next or previous colour.',
          hotkey: 'Ctrl+← →', target: { section: 'Colors and palettes', sel: '#paletteCarousel' },
          steps: [
            { say: 'Colors and palettes holds the curated palettes. Click one.', target: { section: 'Colors and palettes', sel: '#paletteCarousel' }, until: { click: true } },
            { say: 'Ctrl+← and Ctrl+→ switch palettes from the keyboard; N and Shift+N step to the next or previous colour.', key: 'Ctrl+← →', target: { sel: '#palettePreview' } }
          ] },
        { id: 'cap-colour', pillar: 'colour', title: 'Stop colours blowing out to white',
          tags: ['cap', 'gate', 'white', 'overexposed', 'blown', 'bright', 'saturate'],
          answer: 'Cap in the Color cell keeps piled-up strokes from saturating to white. Light Shift in Effects can also recolour the brightest paint.',
          target: { strip: 'Color', sel: '.ch-gate-toggle' } },

        // ── Layers ──
        { id: 'paste-image', pillar: 'layers', title: 'Paste an image as a layer',
          tags: ['paste', 'image', 'clipboard', 'ctrl', 'v', 'picture', 'photo', 'layer'],
          answer: 'Copy an image anywhere, then press Ctrl+V with the app focused. It lands as a new layer and Layers opens on it. Ctrl+Shift+V pastes it as a hidden collider instead.',
          hotkey: 'Ctrl+V', target: { section: 'Layers' },
          steps: [
            { say: 'Copy an image somewhere else: right-click a picture and choose Copy image, or take a screenshot.', note: 'Anything on the clipboard as an image will do.' },
            { say: 'Click the canvas so the app has focus, then press Ctrl+V.', key: 'Ctrl+V', target: { canvas: true }, until: { layerAdded: true } },
            { say: 'Here it is. Layers opened on the new layer: Transform moves it, Fluidize pours it into the paint.', note: 'Ctrl+Shift+V pastes as a hidden collider instead.', target: { layer: 'last', sel: '.layer-btn', text: 'Transform', fallback: { section: 'Layers' } } }
          ] },
        { id: 'upload-image', pillar: 'layers', title: 'Bring in a picture from a file',
          tags: ['upload', 'file', 'drop', 'drag', 'open', 'photo', 'png', 'jpg'],
          answer: 'Drag a PNG or JPG onto the canvas, or use the folder button in Layers. Dropping onto a brush-shape area loads it as a brush shape instead.',
          target: { section: 'Layers', sel: '#uploadBtn' },
          steps: [
            { say: 'Click the folder button in the Layers header and pick a PNG or JPG.', note: 'Dragging a file onto the canvas does the same.', target: { section: 'Layers', sel: '#uploadBtn' }, until: { layerAdded: true } },
            { say: 'The picture is a layer above the fluid. Transform moves, scales and rotates it.', target: { layer: 'last', sel: '.layer-btn', text: 'Transform', fallback: { section: 'Layers' } } }
          ] },
        { id: 'capture-layer', pillar: 'layers', title: 'Freeze the current painting into a layer',
          tags: ['capture', 'snapshot', 'keep', 'freeze', 'layer', 'save'],
          answer: 'Capture Layer in Layers takes what is on the canvas and keeps it as an image layer above the fluid. Right Shift+Enter does the same.',
          hotkey: 'R-Shift+Enter', target: { section: 'Layers', sel: '#captureBtn' },
          steps: [
            { say: 'Click Capture Layer.', key: 'R-Shift+Enter', target: { section: 'Layers', sel: '#captureBtn' }, until: { layerAdded: true } },
            { say: 'The snapshot is a layer above the fluid now: hide it, move it, or Fluidize it back in later.', target: { layer: 'last', fallback: { section: 'Layers' } } }
          ] },
        { id: 'move-layer', pillar: 'layers', title: 'Move, scale or rotate a layer',
          tags: ['move', 'scale', 'rotate', 'transform', 'skew', 'position', 'resize', 'layer'],
          answer: 'Every layer row has a transform button. Drag to move, corners to scale, the handle to rotate; Enter or Done keeps it, Esc cancels.',
          target: { section: 'Layers' },
          steps: [
            { say: 'Open the layer’s row in Layers and click Transform.', needs: 'layer', target: { layer: 'any', sel: '.layer-btn', text: 'Transform' }, until: { bodyClass: 'layer-transform-active' } },
            { say: 'Drag to move, corners to scale, edges to skew, ↻ to rotate. Done keeps it; Cancel puts it back.', target: { overlay: 'transform', sel: '#layerTransformDone' }, until: { noBodyClass: 'layer-transform-active' } }
          ] },
        { id: 'collider-from-image', pillar: 'layers', title: 'Make the paint flow around a picture',
          tags: ['collider', 'collision', 'around', 'wall', 'flow', 'image', 'object', 'terrain'],
          answer: 'Layers → Add Collision Layer: pick a picture, cut the object out with the mask tools, and it becomes a wall. A layer row also has Generate Collision Layer.',
          target: { section: 'Layers', sel: 'button[title^="Add Collision Layer"]' },
          steps: [
            { say: 'Click the 🧱 button in the Layers header.', target: { section: 'Layers', sel: 'button[title^="Add Collision Layer"]' }, until: { visible: '.collision-source-menu' } },
            { say: 'Choose From Image… and pick a picture, or From Canvas to use what is painted right now.', target: { sel: '.collision-source-menu' }, until: { visible: '#maskEditorOverlay' } },
            { say: 'Cut the subject out: click it, then Instant Roto It. Brush and Stamps refine the edge.', target: { overlay: 'mask', sel: '#samSegmentBtn', fallback: { overlay: 'mask', sel: '#smartSelectBtn' } }, until: [{ click: '#samSegmentBtn' }, { hidden: '#maskEditorOverlay' }] },
            { say: 'Next softens the edge; Apply Mask finishes. The cut-out becomes a wall.', target: { overlay: 'mask', sel: '.mask-apply-btn', fallback: { overlay: 'mask', sel: '#maskWizardNext' } }, until: { hidden: '#maskEditorOverlay' } },
            { say: 'The wall is a collision layer in Layers. Uncheck Collision to switch it off; Edit Collider redraws it.', target: { layer: 'collision', fallback: { section: 'Layers' } } }
          ] },
        { id: 'mask-layer', pillar: 'layers', title: 'Cut an object out of a picture',
          tags: ['mask', 'cut', 'out', 'roto', 'instant', 'background', 'remove', 'feather'],
          answer: 'Create Mask on a layer row opens the mask editor. Instant Roto clicks an object out for you; brush and shapes refine it. The same screen can make it a collider.',
          target: { section: 'Layers' },
          steps: [
            { say: 'Open the picture’s row in Layers and click Create Mask.', needs: 'imageLayer', target: { layer: 'image', sel: '.mask-control-btn', text: ['Create Mask', 'Edit Mask'] }, until: { visible: '#maskEditorOverlay' } },
            { say: 'Instant Roto: click the object, then Instant Roto It. Brush and Stamps refine what it found.', target: { overlay: 'mask', sel: '#samSegmentBtn', fallback: { overlay: 'mask', sel: '#smartSelectBtn' } }, until: [{ click: '#samSegmentBtn' }, { hidden: '#maskEditorOverlay' }] },
            { say: 'Next softens the edge. Tick “Also make this a collision layer” if the paint should flow around it, then Apply Mask.', target: { overlay: 'mask', sel: '.mask-apply-btn', fallback: { overlay: 'mask', sel: '#maskWizardNext' } }, until: { hidden: '#maskEditorOverlay' } }
          ] },
        { id: 'fluidize', pillar: 'layers', title: 'Pour a picture into the fluid',
          tags: ['pour', 'fluidize', 'dissolve', 'melt', 'dye', 'layer', 'into'],
          answer: 'The pour button on a layer row deposits the picture as dye and hides the layer. It dissolves into the fluid from there; there is no undo for dye.',
          target: { section: 'Layers' },
          steps: [
            { say: 'Open the picture’s row in Layers and click Fluidize.', needs: 'imageLayer', target: { layer: 'image', sel: '.layer-btn', text: 'Fluidize' }, until: { click: true } },
            { say: 'The picture is dye now and the layer hid itself. Unhide it to pour again. There is no undo for dye.', target: { canvas: true } }
          ] },
        { id: 'delete-layer', pillar: 'layers', title: 'Delete a layer',
          tags: ['delete', 'remove', 'layer', 'trash'],
          answer: 'Delete on the layer row. Ctrl+Z brings it back.',
          hotkey: 'Ctrl+Z', target: { section: 'Layers' },
          steps: [
            { say: 'Open the layer’s row in Layers and click Delete.', needs: 'layer', target: { layer: 'any', sel: '.layer-delete-btn' }, until: { click: true } },
            { say: 'Ctrl+Z brings it back.', key: 'Ctrl+Z' }
          ] },

        // ── Effects ──
        { id: 'glow', pillar: 'effects', title: 'Add glow',
          tags: ['glow', 'bloom', 'light', 'shine', 'scatter', 'shafts'],
          answer: 'Effects → Glow. Bright paint bleeds light into its surroundings; Threshold sets how bright paint must be, Intensity how far it spreads. Scatter inside Glow adds light shafts.',
          target: { section: 'Effects', sel: '#glowToggle' },
          demo: { label: 'Switch glow on', run() { const was = !!($('glowToggle') || {}).checked; setCheck('glowToggle', true); return () => setCheck('glowToggle', was); } },
          steps: [
            { say: 'Effects → switch Glow on.', target: { section: 'Effects', sel: '#glowToggle' }, until: { checked: '#glowToggle' } },
            { say: 'Threshold is how bright paint must be to glow; Intensity is how far the light spreads.', target: { sel: '#glowThreshold' } },
            { say: 'Scatter, inside Glow, adds light shafts.', target: { sel: '#scatterToggle' } }
          ] },
        { id: 'breathing', pillar: 'effects', title: 'Breathe with the canvas',
          tags: ['breathe', 'breathing', 'calm', 'relax', 'meditate', 'exercise', 'box', '4-7-8', 'guided', 'rings'],
          answer: 'Effects → Breathing. Two rings grow while you breathe in and shrink while you breathe out; the paint between them, in your brush colour, moves with them and swirls. Pick Relaxed, Box or 4-7-8 and follow the word.',
          target: { section: 'Effects', sel: '#breathingToggle' },
          demo: { label: 'Start breathing', run() { const was = !!($('breathingToggle') || {}).checked; setCheck('breathingToggle', true); return () => setCheck('breathingToggle', was); } } },
        { id: 'surface-shading', pillar: 'effects', title: 'Give the paint relief and gloss',
          tags: ['shading', 'relief', 'gloss', '3d', 'surface', 'emboss', 'depth', 'vibrance', 'ridges'],
          answer: 'Effects → Surface Shading lights the paint as a surface. Relief sets the height, Gloss the shine. Ridges and Vibrance under it refine the same surface.',
          target: { section: 'Effects', sel: '#displayShadingToggle' },
          demo: { label: 'Switch shading on', run() { const was = !!($('displayShadingToggle') || {}).checked; setCheck('displayShadingToggle', true); return () => setCheck('displayShadingToggle', was); } } },
        { id: 'light-source', pillar: 'effects', title: 'Light the painting from one side',
          tags: ['light', 'source', 'lamp', 'direction', 'shadow', 'depth'],
          answer: 'Effects → Light Source. Drag the dot on the pad to move the light; Random lets it wander. Dense paint catches it like a relief map.',
          target: { section: 'Effects', sel: '#enableLighting' },
          steps: [
            { say: 'Effects → switch Light Source on.', target: { section: 'Effects', sel: '#enableLighting' }, until: { checked: '#enableLighting' } },
            { say: 'Drag the dot on the pad to move the light. Random lets it wander on its own.', target: { sel: '#lightGridContainer', fallback: { sel: '#lightMode' } } }
          ] },
        { id: 'light-shift', pillar: 'effects', title: 'Recolour the brightest paint',
          tags: ['light', 'shift', 'overexposed', 'hue', 'white', 'rainbow', 'tint', 'colour'],
          answer: 'Effects → Light Shift. Draw a path through colours on the wheel; the playhead loops along it, tinting or replacing your overexposed areas. Hold Shift while drawing to lift the pen.',
          target: { section: 'Effects', sel: '#enableLightShift' },
          steps: [
            { say: 'Effects → switch Light Shift on.', target: { section: 'Effects', sel: '#enableLightShift' }, until: { checked: '#enableLightShift' } },
            { say: 'Draw a path through colours on the wheel. Hold Shift while drawing to lift the pen.', target: { sel: '#lightShiftWheel' } },
            { say: 'Mode decides whether it tints or replaces the overexposed paint; Speed is how fast the playhead loops.', target: { sel: '#lightShiftMode' } }
          ] },
        { id: 'gravity', pillar: 'effects', title: 'Make the paint fall, rise or drift',
          tags: ['gravity', 'lift', 'wind', 'drift', 'fall', 'sink', 'direction', 'pressure'],
          answer: 'Effects → Gravity Direction. Aim the pad: down is gravity, up is lift, sideways is wind. Every brush feels it until you switch it off.',
          target: { section: 'Effects', sel: '#pressureConstant' },
          steps: [
            { say: 'Effects → switch Gravity Direction on.', target: { section: 'Effects', sel: '#pressureConstant' }, until: { checked: '#pressureConstant' } },
            { say: 'Aim the pad: down is gravity, up is lift, sideways is wind.', note: 'Switch it off and every brush stops feeling it.', target: { sel: '#pressurePad' } }
          ] },
        { id: 'border', pillar: 'effects', title: 'Let paint drain off the edges',
          tags: ['border', 'edge', 'overflow', 'drain', 'rim', 'bounce', 'open'],
          answer: 'Effects → Border opens the canvas edges: paint that reaches the rim drains away instead of bouncing back. Width sets how far in the drain reaches.',
          target: { section: 'Effects', sel: '#overflowToggle' } },
        { id: 'kaleidoscope', pillar: 'effects', title: 'Turn on the kaleidoscope',
          tags: ['kaleidoscope', 'kaleido', 'mirror', 'segments', 'symmetry', 'wedges'],
          answer: 'Kaleidoscope → the toggle at the top. Segments sets how many wedges, Mode how they mirror. Note it raises the arm count on first use.',
          target: { section: 'Kaleidoscope', sel: '#kaleidoToggle' },
          demo: { label: 'Switch it on', run() { const was = !!($('kaleidoToggle') || {}).checked; const mult = ($('multiplier') || {}).value; setCheck('kaleidoToggle', true); return () => { setCheck('kaleidoToggle', was); if (mult != null) setCtl('multiplier', mult, 'input'); }; } },
          steps: [
            { say: 'Kaleidoscope → switch it on at the top.', note: 'It raises the arm count on first use.', target: { section: 'Kaleidoscope', sel: '#kaleidoToggle' }, until: { checked: '#kaleidoToggle' } },
            { say: 'Segments sets how many wedges; Mode sets how they mirror.', target: { sel: '#kaleidoSegments' } }
          ] },
        { id: 'mandala', pillar: 'effects', title: 'Paint one wedge and let the circle fill in',
          tags: ['mandala', 'wedge', 'circle', 'studio', 'radial', 'pattern'],
          answer: 'Kaleidoscope → Mandala Studio. Paint inside one wedge; the others follow. Wedges sets the count.',
          target: { section: 'Kaleidoscope', sel: '#mandalaToggle' },
          steps: [
            { say: 'Kaleidoscope → switch Mandala Studio on.', target: { section: 'Kaleidoscope', sel: '#mandalaToggle' }, until: { checked: '#mandalaToggle' } },
            { say: 'Paint inside one wedge; the others follow. Wedges sets how many.', target: { sel: '#mandalaWedges' } }
          ] },
        { id: 'presets', pillar: 'effects', title: 'Load a look, or save your own',
          tags: ['preset', 'presets', 'look', 'save', 'load', 'silky', 'chaotic', 'marble', 'electric', 'style'],
          answer: 'Presets in the top bar lists the built-in looks and yours. + New Preset saves everything on screen; a preset click loads the whole look.',
          target: { strip: 'Presets', popup: 'presets' },
          steps: [
            { say: 'Presets in the top bar: click a look to load it. Groups fold; the thumbnails show the look.', target: { strip: 'Presets', popup: 'presets', sel: '.mixer-presets-list' }, until: { click: true } },
            { say: '+ New Preset saves everything on screen under a name of your own.', target: { popup: 'presets', sel: '.mixer-preset-save' } }
          ] },
        { id: 'mutate', pillar: 'effects', title: 'Get variations of the current look',
          tags: ['mutate', 'mutation', 'variations', 'random', 'shader', 'surprise', 'explore'],
          answer: 'Mutate shader → Mutate deals variant cards; click one to apply it, Undo to go back. Scope All reaches into rarely-touched settings; Strength is how far it wanders. M does it from the keyboard.',
          hotkey: 'M', target: { section: 'Mutate shader', sel: '#mutationGenerate' },
          demo: { label: 'Deal variants', run() { const b = $('mutationGenerate'); if (b) b.click(); } },
          steps: [
            { say: 'Mutate shader → click Mutate. It deals variant cards.', key: 'M', target: { section: 'Mutate shader', sel: '#mutationGenerate' }, until: { click: true } },
            { say: 'Click a card to apply it; Undo goes back. Scope All reaches rarely-touched settings; Strength is how far it wanders.', target: { sel: '#mutationUndo' } }
          ] },

        // ── Motion ──
        { id: 'freeze-pause', pillar: 'motion', title: 'Freeze the motion, or pause everything',
          tags: ['freeze', 'pause', 'stop', 'still', 'motion', 'space', 'hold'],
          answer: 'Space freezes the fluid’s motion (paint stays put, you can still paint). Shift+Space pauses the whole simulation. Both live in the Transport cell of the top bar.',
          hotkey: 'Space', target: { strip: 'Transport', sel: '#freezeBtn' },
          demo: { label: 'Freeze for a moment', run() { if (typeof window.toggleFreeze !== 'function') return; const was = !!($('freezeBtn') || { classList: { contains: () => false } }).classList.contains('active'); if (!was) window.toggleFreeze(); return () => { const now = !!($('freezeBtn') || { classList: { contains: () => false } }).classList.contains('active'); if (now !== was) window.toggleFreeze(); }; } },
          steps: [
            { say: 'Press Space, or click Freeze: the motion stops, the paint stays, and you can still paint.', key: 'Space', target: { strip: 'Transport', sel: '#freezeBtn' }, until: { active: '#freezeBtn' } },
            { say: 'Space again lets it flow. Shift+Space pauses the whole simulation instead.', key: 'Shift+Space', target: { strip: 'Transport', sel: '#freezeBtn' }, until: { check: () => !isActive($('freezeBtn')) } }
          ] },
        { id: 'clear', pillar: 'motion', title: 'Clear the canvas',
          tags: ['clear', 'erase', 'wipe', 'blank', 'new', 'empty', 'start over'],
          answer: 'Clear in the Transport cell wipes dye and motion. There is no undo for dye, so capture a layer first if you want to keep it.',
          target: { strip: 'Transport', sel: 'button[onclick*="clearCanvas"]' },
          demo: { label: 'Clear now', confirm: 'Clear the canvas? Dye cannot be undone.', run() { if (typeof window.clearCanvas === 'function') window.clearCanvas(); } } },
        { id: 'quality', pillar: 'motion', title: 'Painting feels slow',
          tags: ['slow', 'lag', 'fps', 'quality', 'sharpness', 'detail', 'performance', 'laptop', 'gpu', 'resolution'],
          answer: 'The bar bottom-left: Image Sharpness and Motion Detail. Lower either for speed; Alt+↑ ↓ and Alt+Shift+↑ ↓ step them. On a laptop, make sure the app runs on the fast GPU in Windows graphics settings.',
          hotkey: 'Alt+↑ ↓', target: { chrome: 'underbar', sel: '.qub-dd-btn' },
          steps: [
            { say: 'The bar bottom-left: open Image Sharpness or Motion Detail.', target: { chrome: 'underbar', sel: '.qub-dd-btn' }, until: { click: true } },
            { say: 'Lower either for speed. Alt+↑ ↓ and Alt+Shift+↑ ↓ step them from the keyboard.', note: 'On a laptop, run the app on the fast GPU in Windows graphics settings.', key: 'Alt+↑ ↓', target: { chrome: 'underbar' } }
          ] },
        { id: 'time-density', pillar: 'motion', title: 'Make the paint fade slower or faster',
          tags: ['fade', 'density', 'time', 'linger', 'disappear', 'vanish', 'sustain', 'velocity', 'speed'],
          answer: 'Density in the top bar is how long colour lingers; Velocity how long motion lingers. Time slows or speeds the whole simulation.',
          target: { strip: 'Density' } },
        { id: 'zoom', pillar: 'motion', title: 'Zoom in on the canvas',
          tags: ['zoom', 'magnify', 'pan', 'closer', 'z', 'detail'],
          answer: 'Press Z for Zoom Mode: the wheel zooms at the cursor and dragging pans. 0 resets, Z again returns to painting. Without Zoom Mode the wheel is brush size.',
          hotkey: 'Z / 0', target: { canvas: true },
          demo: { label: 'Try Zoom Mode', run() { if (typeof window.setZoomMode !== 'function') return; window.setZoomMode(true); return () => window.setZoomMode(false); } },
          steps: [
            { say: 'Press Z for Zoom Mode.', key: 'Z', target: { canvas: true }, until: { bodyClass: 'zoom-mode' } },
            { say: 'The wheel zooms at the cursor; dragging pans. 0 resets the view.', key: '0', target: { canvas: true } },
            { say: 'Press Z again to paint. Without Zoom Mode the wheel is brush size.', key: 'Z', until: { noBodyClass: 'zoom-mode' } }
          ] },

        // ── Record ──
        { id: 'replay-stroke', pillar: 'record', title: 'Replay my last stroke',
          tags: ['replay', 'stroke', 'repeat', 'again', 'right', 'button', 'hold', 'loop'],
          answer: 'Hold the right mouse button: the last stroke plays again under the cursor. Stroke and replay → Replay Mode switches to Time, which replays the last few seconds instead.',
          target: { section: 'Stroke and replay' },
          steps: [
            { say: 'Paint a stroke, then hold the right mouse button: it plays again under the cursor.', target: { canvas: true }, until: { pointer: true } },
            { say: 'Replay Mode → Time replays the last few seconds instead of the last stroke.', target: { section: 'Stroke and replay', sel: '.brush-mode-btn', text: 'Time' }, until: { active: true } }
          ] },
        { id: 'record-performance', pillar: 'record', title: 'Record a performance and loop it',
          tags: ['record', 'loop', 'animation', 'performance', 'timeline', 'save', 'recorder', 'f9'],
          answer: 'Animations → Create New Animation opens the recorder. F9 records after a countdown; Space plays; Save as New drops it into an animation slot you can loop any time.',
          hotkey: 'F9', target: { section: 'Animations', sel: '#animCreateNewBtn' },
          steps: [
            { say: 'Animations → Create New Animation opens the recorder.', target: { section: 'Animations', sel: '#animCreateNewBtn' }, until: { visible: '#recRecordBtn' } },
            { say: 'Record (F9) counts down 3-2-1, then paint your performance.', key: 'F9', target: { overlay: 'recorder', sel: '#recRecordBtn' }, until: { click: true } },
            { say: 'Stop when you are done. Play Layer plays it back.', target: { overlay: 'recorder', sel: '#recStopBtn' }, until: { click: true } },
            { say: 'Save as New puts it in the Animations library.', target: { overlay: 'recorder', sel: '#recSavePresetBtn' }, until: { click: true } },
            { say: 'Name it and confirm.', target: { overlay: 'recorder', sel: '#recPresetConfirmBtn' }, until: { click: true } },
            { say: 'Back in Animations: drag it from the library into a slot, then click the slot to loop it.', target: { section: 'Animations', sel: '.anim-lib' } }
          ] },
        { id: 'animations', pillar: 'record', title: 'Play a saved animation',
          tags: ['animation', 'slot', 'play', 'loop', 'smash', 'vortex', 'saved'],
          answer: 'Animations holds six slots. Click one to loop it, click again to stop. Drag your saved recordings into the empty slots.',
          target: { section: 'Animations', sel: '.anim-slot' },
          steps: [
            { say: 'Animations holds six slots. Click one to loop it; click again to stop.', target: { section: 'Animations', sel: '.anim-slot' }, until: { click: true } },
            { say: 'Drag a saved recording from the library into an empty slot.', target: { sel: '.anim-lib-head' } }
          ] },
        { id: 'audio', pillar: 'record', title: 'Make the paint react to music',
          tags: ['audio', 'music', 'sound', 'microphone', 'mic', 'react', 'beat', 'track', 'song'],
          answer: 'Audio → Audio Mode. Load a track, or use the microphone or system sound; the mappings decide what the beat drives. Timing lets you place hits on a chart.',
          target: { section: 'Audio', sel: '#audioMode' },
          steps: [
            { say: 'Audio → Audio Mode: pick Full. Tunnel and the other scenes are ready-made shows.', target: { section: 'Audio', sel: '#audioMode' }, until: { value: { sel: '#audioMode', not: 'off' } } },
            { say: 'Load a track, or use the microphone or system sound.', target: { sel: '#audioDrawerEnableHost', fallback: { section: 'Audio', sel: '#audioMini' } } },
            { say: 'The mappings decide what the beat drives. Visualize Audio Timing places hits on a chart.', target: { section: 'Audio', sel: '#audioTimingToggle' } }
          ] },

        // ── Together ──
        { id: 'stranger', pillar: 'together', title: 'Paint with a stranger',
          tags: ['stranger', 'multiplayer', 'together', 'online', 'someone', 'random', 'partner', 'play'],
          answer: 'Swirl Together → Swirl With a Stranger pairs you with whoever is waiting. Their strokes land on your canvas live.',
          target: { section: 'Swirl Together', sel: '#strangerBtn' },
          steps: [
            { say: 'Swirl Together → click Swirl With a Stranger.', target: { section: 'Swirl Together', sel: '#strangerBtn' }, until: { visible: '#mpConnected' } },
            { say: 'You are in. When someone else is waiting you are paired, and their strokes land on your canvas live.', target: { overlay: 'mp', sel: '#multiplayerStatus' } }
          ] },
        { id: 'room', pillar: 'together', title: 'Invite friends to my canvas',
          tags: ['room', 'code', 'invite', 'friends', 'join', 'share', 'qr', 'link', 'host'],
          answer: 'Swirl Together → Start a room, then share the code or QR. Friends paste it into Join. Share settings sends your look to everyone in the room.',
          target: { section: 'Swirl Together', sel: '#createRoomBtn' },
          steps: [
            { say: 'Swirl Together → click Start a room.', target: { section: 'Swirl Together', sel: '#createRoomBtn' }, until: { visible: '#mpConnected' } },
            { say: 'Share the code: read it out, Copy code, or switch to QR for phones. Hide keeps it off a stream.', target: { overlay: 'mp', sel: '#copyRoomBtn' }, until: { click: true } },
            { say: 'Friends paste the code into Join under Swirl Together. Share settings sends them your look.', target: { overlay: 'mp', sel: '#shareOpenBtn', fallback: { overlay: 'mp', sel: '#roomName' } } }
          ] },
        { id: 'turns', pillar: 'together', title: 'Take turns instead of painting at once',
          tags: ['turns', 'turn', 'rotation', 'timer', 'host', 'lock', 'whose'],
          answer: 'Swirl Together → Take turns (host only). A timer passes the brush around; the chip by the bottom bar shows whose turn it is.',
          target: { section: 'Swirl Together', sel: '#turnsBtn' },
          steps: [
            { say: 'Swirl Together → click Take turns.', needs: 'host', target: { overlay: 'mp', sel: '#turnsBtn' }, until: { click: true } },
            { say: 'The timer sets when the brush passes on; the chip by the bottom bar shows whose turn it is.', target: { overlay: 'mp', sel: '#turnTimerSel', fallback: { overlay: 'mp', sel: '#turnsBtn' } } }
          ] },

        // ── Export ──
        { id: 'export-video', pillar: 'export', title: 'Save a video or GIF',
          tags: ['export', 'video', 'gif', 'mp4', 'webm', 'record', 'share', 'clip'],
          answer: 'Export → Quick Export: Video, GIF, Still or Sequence. E starts a video export straight away. Painting keeps working while it records.',
          hotkey: 'E', target: { section: 'Export', sel: 'button', text: 'Video' },
          steps: [
            { say: 'Export → Quick Export → Video, or press E. GIF, Still and Sequence sit beside it.', key: 'E', target: { section: 'Export', sel: 'button', text: ['Video', 'GIF'] }, until: { click: true } },
            { say: 'It records while you keep painting; Cancel Export stops it early. The file downloads when it finishes.', target: { sel: '#exportStopBtn', fallback: { section: 'Export', sel: '#exportStatus' } } }
          ] },
        { id: 'export-still', pillar: 'export', title: 'Save a picture of the canvas',
          tags: ['screenshot', 'still', 'png', 'jpg', 'image', 'picture', 'save'],
          answer: 'Export → Still saves a PNG or JPG of what you see, layers included.',
          target: { section: 'Export', sel: 'button', text: 'Still' } },
        { id: 'project', pillar: 'export', title: 'Save everything to open later',
          tags: ['project', 'save', 'load', 'file', 'fluid', 'later', 'keep', 'reopen'],
          answer: 'Export → Project saves a .fluid file with layers, colliders and settings; Load Project brings it all back.',
          target: { section: 'Export', sel: 'button', text: 'Save Project' },
          steps: [
            { say: 'Export → Save Project writes a .fluid file with layers, colliders and settings. Name it in the prompt.', target: { section: 'Export', sel: 'button', text: 'Save Project' }, until: { click: true } },
            { say: 'Load Project brings it all back. It replaces what is on the canvas now.', target: { section: 'Export', sel: 'button', text: 'Load Project' } }
          ] },

        // ── Interface ──
        { id: 'focus', pillar: 'interface', title: 'Hide the interface',
          tags: ['hide', 'interface', 'focus', 'fullscreen', 'clean', 'ui', 'chrome', 'distraction'],
          answer: 'Press F for Focus Mode: the canvas fills the window and the FOCUS badge is the way back. Focus also holds stream formats like 9:16.',
          hotkey: 'F', target: { section: 'Focus', sel: '#focusModeToggle' },
          steps: [
            { say: 'Press F, or tick Focus Mode: the canvas fills the window.', key: 'F', target: { section: 'Focus', sel: '#focusModeToggle' }, until: { bodyClass: 'focus-mode' } },
            { say: 'The FOCUS badge is the way back. Click it, or press F again.', key: 'F', target: { sel: '#focus-mode-badge', keepFocus: true }, until: { noBodyClass: 'focus-mode' } }
          ] },
        { id: 'simple-ui', pillar: 'interface', title: 'Show fewer controls, or bring them back',
          tags: ['simple', 'everything', 'sections', 'hidden', 'visible', 'missing', 'gone', 'menu', 'where', 'panel'],
          answer: 'Settings → Interface. Simple keeps only Presets and Mutate; Everything shows the whole mixer; Visible sections lets you pick one by one.',
          target: { section: 'Settings', sel: '.ui-vis-presets' },
          steps: [
            { say: 'Settings → Interface. Simple keeps only Presets and Mutate; Everything shows the whole mixer.', target: { section: 'Settings', sel: '.ui-vis-presets' }, until: { click: true } },
            { say: 'Visible sections lets you pick one by one.', target: { sel: '.ui-vis-trigger' } }
          ] },
        { id: 'hotkeys', pillar: 'interface', title: 'See every keyboard shortcut',
          tags: ['hotkeys', 'shortcuts', 'keys', 'keyboard', 'f1', 'bindings'],
          answer: 'F1 (or Shift+?) opens the shortcut list. Hold Ctrl or Alt for a moment and the key caps light up beside the controls they reach.',
          hotkey: 'F1',
          demo: { label: 'Open the list', closes: true, run() { if (typeof window.showHotkeys === 'function') window.showHotkeys(); } } },
        { id: 'canvas-size', pillar: 'interface', title: 'Resize or lock the canvas',
          tags: ['canvas', 'size', 'resize', 'handles', 'lock', 'aspect', 'format', 'ratio', '9:16'],
          answer: 'Display → Show Canvas Border & Handles (H) reveals the corner handles; drag them. L locks the borders. Focus → Format snaps to 9:16, 1:1, 16:9 or 21:9.',
          hotkey: 'H / L', target: { section: 'Display', sel: '#showCanvasHandles' },
          steps: [
            { say: 'Display → Show Canvas Border & Handles.', key: 'H', target: { section: 'Display', sel: '#showCanvasHandles' }, until: { checked: '#showCanvasHandles' } },
            { say: 'Drag the corner handles on the canvas. L locks the borders where they are.', key: 'L', target: { canvas: true } },
            { say: 'Focus → Format snaps the canvas to 9:16, 1:1, 16:9 or 21:9.', target: { section: 'Focus', sel: '.stream-format-grid' } }
          ] },
        { id: 'photosafe', pillar: 'interface', title: 'Photosensitivity protection',
          tags: ['photosensitivity', 'flash', 'epilepsy', 'safe', 'strobe', 'protection', 'seizure'],
          answer: 'Display → Photosensitivity Protection is on by default: rapid flashes become fades and luminance changes are rate-limited. It only persists when you change it yourself.',
          target: { section: 'Display', sel: '#photoSafeToggle' } },
        { id: 'text', pillar: 'interface', title: 'Put text on the canvas',
          tags: ['text', 'type', 'word', 'caption', 'title', 'font', 'letters'],
          answer: 'Text → + Add Text. Drag it on the canvas to move; corners resize, the top handle rotates. Its collider option makes the fluid flow around the letters.',
          target: { section: 'Text', sel: 'button', text: '+ Add Text' },
          steps: [
            { say: 'Text → + Add Text.', target: { section: 'Text', sel: 'button', text: '+ Add Text' }, until: { visible: '#textOverlayContent' } },
            { say: 'Type your words. Font and size are just below.', target: { sel: '#textOverlayContent' }, until: { input: '#textOverlayContent' } },
            { say: 'Arrange on Canvas: drag to move, corners resize, the top handle rotates. Painting pauses while you arrange.', target: { section: 'Text', sel: 'button', text: ['Arrange on Canvas', 'Done Arranging'] }, until: { click: true } },
            { say: '“Fluid collides with this text” makes the paint flow around the letters.', target: { sel: '#textOverlayCollider' } }
          ] },
        { id: 'undo', pillar: 'interface', title: 'Undo',
          tags: ['undo', 'redo', 'back', 'mistake', 'ctrl', 'z', 'revert'],
          answer: 'Ctrl+Z undoes layer changes, mask strokes and interface changes. Fluid strokes and Clear are not undoable; capture a layer to keep a state you like.',
          hotkey: 'Ctrl+Z' },
        { id: 'first-steps', pillar: 'interface', title: 'Where do I start?',
          tags: ['start', 'begin', 'first', 'new', 'help', 'how', 'basics', 'intro'],
          answer: 'Drag on the canvas to paint. Pick a look from Presets, twist it with Mutate, and hide the rest with Settings → Interface → Simple until you want it.',
          target: { strip: 'Presets' },
          steps: [
            { say: 'Drag on the canvas to paint.', target: { canvas: true }, until: { pointer: true } },
            { say: 'Pick a look from Presets in the top bar.', target: { strip: 'Presets', popup: 'presets', sel: '.mixer-presets-list' }, until: { click: true } },
            { say: 'Mutate twists the look into variations; click a card to keep one.', key: 'M', target: { section: 'Mutate shader', sel: '#mutationGenerate' }, until: { click: true } },
            { say: 'When the mixer gets busy, Settings → Interface → Simple hides the rest until you want it.', target: { section: 'Settings', sel: '.ui-vis-presets' } }
          ] }
    ];

    // ── Search ────────────────────────────────────────────────────────
    // No library: normalised substring + token prefix + subsequence, weighted
    // title > tags > answer (+ the step copy). Empty query → everything, in
    // registry order.
    function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+\[\]\-\/: ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function subseq(hay, needle) {
        let i = 0;
        for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++;
        return i === needle.length;
    }
    function bodyText(r) { return r.answer + ' ' + (r.steps || []).map((s) => s.say + ' ' + (s.note || '')).join(' '); }
    function score(r, q) {
        if (!q) return 1;
        const title = norm(r.title), answer = norm(bodyText(r)), tags = (r.tags || []).map(norm);
        const toks = q.split(' ').filter(Boolean);
        let s = 0;
        for (const t of toks) {
            let best = 0;
            if (title.includes(t)) best = Math.max(best, title.startsWith(t) ? 6 : 4);
            for (const tag of tags) { if (tag === t) best = Math.max(best, 5); else if (tag.startsWith(t)) best = Math.max(best, 3); else if (tag.includes(t)) best = Math.max(best, 2); }
            if (answer.includes(t)) best = Math.max(best, 1.5);
            if (!best && t.length >= 3 && subseq(title.replace(/ /g, ''), t)) best = 0.6;
            if (!best && t.length >= 3) for (const tag of tags) if (subseq(tag, t)) { best = 0.4; break; }
            if (!best) return 0;   // every token must land somewhere
            s += best;
        }
        return s;
    }
    function search(query, pillar) {
        const q = norm(query);
        return RECIPES
            .filter((r) => !pillar || r.pillar === pillar)
            .map((r) => ({ r, s: score(r, q) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .map((x) => x.r);
    }

    // ── Reveal + point ────────────────────────────────────────────────
    const raf2 = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    function findSection(title) {
        const secs = document.querySelectorAll('#sidebar-right .sidebar-section');
        for (let i = 0; i < secs.length; i++) {
            const t = secs[i].querySelector('.section-title');
            if (t && t.textContent.trim() === title) return secs[i];
        }
        return null;
    }
    function openSection(title) {
        const sec = findSection(title);
        if (!sec) return null;
        if (typeof window.openSidebarSection === 'function') window.openSidebarSection(sec);
        else sec.classList.remove('collapsed');
        return sec;
    }
    function stripCell(key) {
        const strip = $('mixer-strip');
        return strip ? strip.querySelector('[data-ui-key="' + key + '"]') : null;
    }
    const POPUPS = {
        brush:   { trigger: () => { const c = stripCell('Brush Size'); return c && c.querySelector('.ch-label'); }, panel: () => document.querySelector('.brush-settings-panel'), isOpen: (p) => p && p.classList.contains('visible') },
        arms:    { trigger: () => $('multiplierValue'), panel: () => document.querySelector('.arm-colors-rows'), isOpen: (p) => p && p.style.display !== 'none' && p.style.display !== '' || (p && p.classList.contains('visible')) },
        presets: { trigger: () => $('mixerPresetsTrigger'), panel: () => document.querySelector('.mixer-presets-panel'), isOpen: (p) => p && p.style.display !== 'none' && p.style.display !== '' }
    };
    // Overlays: body-mounted editors and the room panel. `section` is opened
    // first so the sidebar-hosted ones are actually on screen.
    const OVERLAYS = {
        mask:      { el: () => $('maskEditorOverlay') },
        transform: { el: () => $('layerTransformOverlay') },
        recorder:  { el: () => $('recDrawer') },
        mp:        { el: () => $('mpConnected'), section: 'Swirl Together' }
    };
    // Pick the element `sel` names, narrowed to `text` when given (exact
    // trimmed match against one label or a list of them).
    function pick(container, sel, text) {
        const root = container || document;
        if (!text) return root.querySelector(sel) || (container ? document.querySelector(sel) : null);
        const labels = Array.isArray(text) ? text : [text];
        const cands = root.querySelectorAll(sel || 'button');
        for (let i = 0; i < cands.length; i++) {
            const t = cands[i].textContent.trim();
            if (labels.indexOf(t) >= 0 && isShown(cands[i])) return cands[i];
        }
        return null;
    }

    // Resolves to { anchor, container, el, wide } after revealing whatever
    // hides it; null when the primary and its fallback are both missing.
    async function reveal(target) {
        if (!target) return null;
        const UV = window.UIVisibility;
        if (!target.keepFocus && document.body.classList.contains('focus-mode') && window.focusMode) window.focusMode.toggle();
        if (document.body.classList.contains('mobile-mode') && !target.canvas) {
            const sb = $('sidebar-right');
            if (sb && !sb.classList.contains('visible')) { const mt = $('mobileMenuToggle'); if (mt) mt.click(); }
        }
        let container = null;
        if (target.canvas) {
            const c = $('canvas');
            if (!c) return revealFallback(target);
            await raf2();
            return { anchor: c, container: c, el: c, wide: true };
        }
        if (target.section) {
            container = openSection(target.section);
            if (!container) return revealFallback(target);
        } else if (target.strip) {
            if (UV && UV.isHidden('strip:' + target.strip)) UV.show('strip:' + target.strip);
            container = stripCell(target.strip);
        } else if (target.chrome === 'underbar') {
            if (UV && UV.isHidden('chrome:Quality bar')) UV.show('chrome:Quality bar');
            container = $('quality-underbar');
        } else if (target.layer) {
            openSection('Layers');
            await raf2();
            const rows = layerRows(target.layer);
            const row = rows.length ? rows[0] : null;   // top of the stack = newest
            if (!row) return revealFallback(target);
            if (row.classList.contains('collapsed')) row.classList.remove('collapsed');
            container = row;
        } else if (target.overlay && OVERLAYS[target.overlay]) {
            const O = OVERLAYS[target.overlay];
            if (O.section) openSection(O.section);
            const el = O.el();
            if (!isShown(el)) return revealFallback(target);
            container = el;
        }
        await raf2();
        if (target.popup && POPUPS[target.popup]) {
            const P = POPUPS[target.popup];
            const trig = P.trigger();
            if (trig) {
                const panel = P.panel();
                if (!P.isOpen(panel) && !trig.classList.contains('active')) trig.click();
                await wait(320);   // the brush drawer slides in
                const panelNow = P.panel();
                if (panelNow) container = panelNow;
            }
        }
        let el = null;
        if (target.sel) el = pick(container, target.sel, target.text);
        if (!el && target.sel && (target.text || target.layer || target.overlay)) return revealFallback(target);
        let anchor = el;
        if (anchor) {
            // The pointer aims at the ROW the control lives in — the same row the
            // hotkey caps attach to — so a 14px checkbox is not the whole story.
            const row = anchor.closest('.control-group, .checkbox-group, .fx-row, .ch-header, .layers-toolbar, .qub-dd, .brush-tip-row, .brush-mode-row, .ui-vis-block, .layer-action-row');
            if (row && row !== container) anchor = row;
        }
        if (!anchor) anchor = target.section ? container.querySelector('.section-header') : (target.layer ? container.querySelector('.layer-item-header') : container);
        // A control that exists but has no box (a panel that only shows once
        // its toggle is on, an editor with nothing selected) is not on screen.
        if (!anchor || !isShown(anchor)) return revealFallback(target);
        // Scroll it into view without the sidebar's smooth animation, so the
        // rect read next is where the row will stay.
        const sb = $('sidebar-right');
        const inSidebar = sb && sb.contains(anchor);
        if (inSidebar) {
            const prev = sb.style.scrollBehavior;
            sb.style.scrollBehavior = 'auto';
            try { anchor.scrollIntoView({ block: 'center' }); } catch (_) { anchor.scrollIntoView(); }
            sb.style.scrollBehavior = prev;
        } else {
            try { anchor.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
        }
        await raf2();
        return { anchor, container, el: el || anchor, wide: false };
    }
    function revealFallback(target) { return target.fallback ? reveal(target.fallback) : Promise.resolve(null); }

    // ── The guide layer: a pointer glyph and a ring, body-mounted, un-zoomed ──
    let guideEl = null, guideRaf = 0, guideAnchor = null, guideUntil = 0, guideWide = false;
    function guideBuild() {
        if (guideEl) return guideEl;
        const g = document.createElement('div');
        g.id = 'recipeGuide';
        g.innerHTML =
            '<div class="recipe-ring"></div>' +
            '<svg class="recipe-pointer" viewBox="0 0 24 28" width="30" height="35" aria-hidden="true">' +
                '<path d="M3 2 L3 22 L8.5 17 L12 26 L15.5 24.5 L12 16 L19 16 Z" fill="#ffffff" stroke="#0b0e14" stroke-width="1.6" stroke-linejoin="round"/>' +
            '</svg>';
        document.body.appendChild(g);
        guideEl = g;
        return g;
    }
    function guideTrack() {
        if (!guideEl || !guideAnchor) return;
        const r = guideAnchor.getBoundingClientRect();
        const ring = guideEl.querySelector('.recipe-ring');
        const ptr = guideEl.querySelector('.recipe-pointer');
        if (r.width === 0 && r.height === 0) { guideHide(); return; }
        ring.style.transform = 'translate(' + (r.left - 4) + 'px,' + (r.top - 4) + 'px)';
        ring.style.width = (r.width + 8) + 'px';
        ring.style.height = (r.height + 8) + 'px';
        // Pointer tip on the row's left edge, a third of the way down — or in
        // the middle when the target is the canvas itself.
        if (guideWide) ptr.style.transform = 'translate(' + (r.left + r.width * 0.5) + 'px,' + (r.top + r.height * 0.5) + 'px)';
        else ptr.style.transform = 'translate(' + (r.left - 6) + 'px,' + (r.top + r.height * 0.35) + 'px)';
        if (performance.now() < guideUntil) guideRaf = requestAnimationFrame(guideTrack);
        else guideHide();
    }
    function guideShow(anchor, opts) {
        opts = opts || {};
        const g = guideBuild();
        guideAnchor = anchor;
        guideWide = !!opts.wide;
        guideUntil = performance.now() + (opts.ms || 7000);
        g.classList.toggle('wide', guideWide);
        const ring = g.querySelector('.recipe-ring');
        // Restart the (finite) pulse: remove + reflow + add.
        ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse');
        g.classList.add('show');
        // First placement without transition, then the pointer glides on later moves.
        g.classList.remove('glide');
        guideTrack();
        requestAnimationFrame(() => g.classList.add('glide'));
        cancelAnimationFrame(guideRaf);
        guideRaf = requestAnimationFrame(guideTrack);
    }
    function guideHide() {
        cancelAnimationFrame(guideRaf);
        guideRaf = 0; guideAnchor = null;
        if (guideEl) { guideEl.classList.remove('show'); guideEl.classList.remove('glide'); }
    }
    document.addEventListener('pointerdown', function (e) {
        if (guideAnchor && !(e.target.closest && e.target.closest('#recipePill'))) guideHide();
    }, true);
    window.addEventListener('resize', function () { if (guideAnchor) guideTrack(); });

    // ── Completion: how a step knows the action happened ──────────────
    // waitFor(until, ctxOf) → { promise → true (met) | false (cancelled), cancel }
    // ctxOf() returns the step's reveal result once it exists, so `true` can
    // mean "the element I pointed at". The watch starts BEFORE the reveal
    // (listeners are cheap; a click that lands while the sidebar is still
    // scrolling must not be lost), which is why the context is read lazily.
    // Polls every 150 ms for state; listens for events.
    function waitFor(until, ctxOf) {
        const conds = Array.isArray(until) ? until : [until];
        const get = typeof ctxOf === 'function' ? ctxOf : () => ctxOf;
        const elOf = () => { const c = get(); return c ? c.el : null; };
        const anchorOf = () => { const c = get(); return c ? (c.anchor || c.el) : null; };
        const polls = [], offs = [];
        let done = false, timer = 0, resolveP = null;
        const promise = new Promise((r) => { resolveP = r; });
        function teardown() { clearInterval(timer); offs.forEach((f) => f()); offs.length = 0; }
        function finish() { if (done) return; done = true; teardown(); resolveP(true); }
        function on(type, node, fn, capture) { node.addEventListener(type, fn, capture); offs.push(() => node.removeEventListener(type, fn, capture)); }
        // A handler that fires when the event lands inside the scope: the
        // pointed element (`true`) or a selector, re-resolved per event because
        // rows re-render.
        function within(spec, scopeOf) {
            return (e) => { const t = (spec === true) ? scopeOf() : q(spec); if (t && (t === e.target || t.contains(e.target))) finish(); };
        }
        conds.forEach((c) => {
            if (!c) return;
            if (c.click) on('click', document, within(c.click, anchorOf), true);
            else if (c.pointer) on('pointerdown', document, within(c.pointer, anchorOf), true);
            else if (c.input) on('input', document, within(c.input, elOf), true);
            else if (c.change) {
                const scopeOf = c.any ? anchorOf : elOf;
                on('change', document, within(c.change, scopeOf), true);
                on('input', document, within(c.change, scopeOf), true);
            }
            else if (c.event) on(c.event, document, () => finish(), true);
            else if (c.layerAdded) { const count = () => layerRows('any').length; const n0 = count(); polls.push(() => count() > n0); }
            else if (c.visible) polls.push(() => isShown(q(c.visible)));
            else if (c.hidden) polls.push(() => !isShown(q(c.hidden)));
            else if (c.bodyClass) polls.push(() => document.body.classList.contains(c.bodyClass));
            else if (c.noBodyClass) polls.push(() => !document.body.classList.contains(c.noBodyClass));
            else if (c.active) polls.push(() => isActive(c.active === true ? elOf() : q(c.active)));
            else if (c.checked) polls.push(() => { const x = q(c.checked); return !!x && !!x.checked; });
            else if (c.unchecked) polls.push(() => { const x = q(c.unchecked); return !!x && !x.checked; });
            else if (c.value) polls.push(() => { const x = q(c.value.sel); if (!x) return false; return c.value.not !== undefined ? x.value !== c.value.not : x.value === c.value.is; });
            else if (typeof c.check === 'function') polls.push(c.check);
        });
        if (polls.length) timer = setInterval(() => { try { if (polls.some((p) => p())) finish(); } catch (_) {} }, 150);
        return { promise, cancel() { if (done) return; done = true; teardown(); resolveP(false); } };
    }

    // What a step may need before it can be pointed at, and the recipe that
    // gets the user there.
    const NEEDS = {
        layer:      { ok: () => layerRows('any').length > 0, text: 'You need a layer first.', recipe: 'paste-image', label: 'Paste one' },
        imageLayer: { ok: () => layerRows('image').length > 0, text: 'You need a picture layer first.', recipe: 'paste-image', label: 'Paste one' },
        connected:  { ok: () => isShown($('mpConnected')), text: 'You need to be in a room first.', recipe: 'room', label: 'Start one' },
        host:       { ok: () => isShown($('mpHostBlock')), text: 'Only the host can do this. Start a room and you are the host.', recipe: 'room', label: 'Start one' }
    };
    function needGap(need) {
        const n = NEEDS[need];
        if (!n) return null;
        try { if (n.ok()) return null; } catch (_) { return null; }
        return n;
    }

    // ── The pill (the modal folded down while guiding) ────────────────
    let pillEl = null, pillRecipe = null, pillUndo = null;
    function pillBuild() {
        if (pillEl) return pillEl;
        const p = document.createElement('div');
        p.id = 'recipePill';
        p.dataset.group = 'system';
        p.setAttribute('role', 'status');
        p.innerHTML =
            '<div class="recipe-pill-text">' +
                '<div class="recipe-pill-line"><span class="recipe-pill-step" hidden></span><span class="recipe-pill-title"></span><kbd class="hk-cap recipe-pill-key"></kbd></div>' +
                '<div class="recipe-pill-note" hidden></div>' +
            '</div>' +
            '<div class="recipe-pill-actions btn-sm">' +
                '<button type="button" class="recipe-pill-again">Point again</button>' +
                '<button type="button" class="recipe-pill-demo"></button>' +
                '<button type="button" class="recipe-pill-back">Back</button>' +
                '<button type="button" class="recipe-pill-next btn--emphasis">Next</button>' +
                '<button type="button" class="recipe-pill-close btn--icon" title="Done (Esc)">✕</button>' +
            '</div>';
        document.body.appendChild(p);
        p.querySelector('.recipe-pill-again').addEventListener('click', function () {
            if (tour) tourPoint();
            else if (pillRecipe) show(pillRecipe.id, { keepPill: true });
        });
        p.querySelector('.recipe-pill-back').addEventListener('click', function () {
            if (tour && tour.i > 0 && !tour.finished) { tourStep(tour.i - 1); return; }
            const r = pillRecipe; pillHide(); open(r ? r.id : null);
        });
        p.querySelector('.recipe-pill-next').addEventListener('click', function () { if (tour) tourStep(tour.i + 1); });
        p.querySelector('.recipe-pill-close').addEventListener('click', function () { pillHide(); guideHide(); });
        p.querySelector('.recipe-pill-demo').addEventListener('click', function () { if (pillRecipe) demo(pillRecipe.id, p.querySelector('.recipe-pill-demo')); });
        p.querySelector('.recipe-pill-note').addEventListener('click', function (e) {
            const b = e.target.closest('button[data-recipe]'); if (!b) return;
            show(b.dataset.recipe);
        });
        pillEl = p;
        return p;
    }
    function pillSet(o) {
        const p = pillBuild();
        p.querySelector('.recipe-pill-title').textContent = o.title || '';
        const k = p.querySelector('.recipe-pill-key');
        k.textContent = o.key ? (isMac ? o.key.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥') : o.key) : '';
        k.hidden = !o.key;
        const s = p.querySelector('.recipe-pill-step');
        s.textContent = o.step || '';
        s.hidden = !o.step;
        s.classList.toggle('done', !!o.stepDone);
        const n = p.querySelector('.recipe-pill-note');
        n.innerHTML = o.noteHtml || '';
        n.hidden = !o.noteHtml;
        const d = p.querySelector('.recipe-pill-demo');
        d.hidden = !o.demo;
        d.textContent = o.demo ? o.demo.label : '';
        p.querySelector('.recipe-pill-next').hidden = !o.next;
        p.querySelector('.recipe-pill-again').hidden = !o.again;
        p.querySelector('.recipe-pill-back').textContent = o.backLabel || 'Back';
        p.classList.toggle('tour', !!o.tour);
        p.classList.add('show');
    }
    function pillShow(r) {
        pillRecipe = r;
        pillSet({ title: r.title, key: r.hotkey, demo: r.demo, again: !!r.target });
    }
    function pillHide() {
        tourStop();
        if (pillUndo) { try { pillUndo(); } catch (_) {} pillUndo = null; }
        if (pillEl) pillEl.classList.remove('show');
        pillRecipe = null;
    }
    function pillNote(text) {
        if (!pillEl) return;
        const n = pillEl.querySelector('.recipe-pill-note');
        n.textContent = text; n.hidden = !text;
    }

    // ── Tours: the pill as a stepper ───────────────────────────────────
    // One live tour at a time. `seq` guards every await: a Next, a Back or a
    // close while a step is revealing or waiting must not let the stale
    // continuation advance the tour underneath the new one.
    let tour = null;
    function tourStart(r, i) {
        tourStop();
        tour = { r, i: i || 0, seq: 0, waiter: null, ctx: null, finished: false };
        tourStep(tour.i);
    }
    function tourStop() {
        if (!tour) return;
        if (tour.waiter) tour.waiter.cancel();
        tour.seq++;
        tour = null;
    }
    function tourLabel(t, i) { return (i + 1) + '/' + t.r.steps.length; }
    function stepPill(t, i, st, extra) {
        const o = {
            tour: true, title: st.say, key: st.key, step: tourLabel(t, i), next: true, again: !!st.target,
            backLabel: i > 0 ? 'Back' : 'Back to the list',
            noteHtml: st.note ? escapeHtml(st.note) : ''
        };
        if (extra) for (const k in extra) o[k] = extra[k];
        pillSet(o);
    }
    async function tourStep(i) {
        const t = tour; if (!t) return;
        const steps = t.r.steps;
        if (t.waiter) { t.waiter.cancel(); t.waiter = null; }
        const seq = ++t.seq;
        if (i >= steps.length) {
            t.finished = true; t.i = steps.length - 1;
            const title = t.r.title;
            pillSet({ tour: true, title: 'That’s it: ' + title.charAt(0).toLowerCase() + title.slice(1) + '.', step: '✓', stepDone: true, backLabel: 'Back to the list' });
            guideHide();
            return;
        }
        t.finished = false; t.i = i; t.ctx = null;
        const st = steps[i];
        const gap = st.needs ? needGap(st.needs) : null;
        if (gap) {
            stepPill(t, i, st, { again: false, noteHtml: escapeHtml(gap.text) + ' <button type="button" class="btn--emphasis" data-recipe="' + gap.recipe + '">' + escapeHtml(gap.label) + '</button>' });
            guideHide();
            return;
        }
        stepPill(t, i, st);
        // Watch first, reveal second: a user who already knows where the
        // control is may click it while the sidebar is still scrolling.
        const started = performance.now();
        const w = st.until ? waitFor(st.until, () => t.ctx) : null;
        t.waiter = w;
        let res = null;
        if (st.target) { try { res = await reveal(st.target); } catch (e) { console.warn('[Recipes] reveal failed', e); } }
        if (!tour || tour.seq !== seq) return;
        t.ctx = res;
        if (res && res.anchor) guideShow(res.anchor, { ms: 30000, wide: res.wide });
        else { guideHide(); if (st.target) pillNote('That control is not on screen right now.'); }
        if (!w) return;            // nothing to watch: Next moves on
        const ok = await w.promise;
        if (!ok || !tour || tour.seq !== seq) return;
        t.waiter = null;
        // Tick, and let the eye register it before the pointer moves on.
        stepPill(t, i, st, { step: '✓ ' + tourLabel(t, i), stepDone: true, again: false });
        await wait(Math.max(0, 700 - (performance.now() - started)) + 450);
        if (!tour || tour.seq !== seq) return;
        tourStep(i + 1);
    }
    // Point again inside a tour: re-reveal the current step without
    // disturbing whatever it is waiting for.
    async function tourPoint() {
        const t = tour; if (!t || t.finished) return;
        const st = t.r.steps[t.i]; if (!st || !st.target) return;
        const seq = t.seq;
        let res = null;
        try { res = await reveal(st.target); } catch (_) {}
        if (!tour || tour.seq !== seq) return;
        if (res && res.anchor) guideShow(res.anchor, { ms: 30000, wide: res.wide });
    }

    // ── Demos ─────────────────────────────────────────────────────────
    async function demo(id, btn) {
        const r = RECIPES.find((x) => x.id === id);
        if (!r || !r.demo) return;
        const why = busyReason();
        if (why) { if (window.appAlert) window.appAlert('Not right now', why); return; }
        if (pillUndo) { const u = pillUndo; pillUndo = null; try { u(); } catch (_) {} if (btn) btn.textContent = r.demo.label; return; }
        if (r.demo.confirm && window.appConfirm) {
            const ok = await window.appConfirm({ title: r.title, message: r.demo.confirm, confirmLabel: r.demo.label, cancelLabel: 'Keep it' });
            if (!ok) return;
        }
        if (r.demo.closes) { close(); pillHide(); guideHide(); }
        let undo = null;
        try { undo = r.demo.run({ setCtl, setCheck }); } catch (e) { console.warn('[Recipes] demo failed', e); }
        if (typeof undo === 'function') {
            pillUndo = undo;
            if (btn) btn.textContent = 'Put it back';
        }
    }

    // ── The modal ─────────────────────────────────────────────────────
    let modal = null, listEl = null, detailEl = null, searchEl = null, countEl = null, tagsEl = null;
    let results = [], highlight = 0, pillar = '';

    function build() {
        if (modal) return modal;
        const m = document.createElement('div');
        m.id = 'recipeModal';
        m.className = 'delete-modal recipe-modal';
        m.dataset.group = 'system';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-labelledby', 'recipeTitle');
        m.innerHTML =
            '<div class="delete-modal-content recipe-content">' +
                '<div class="recipe-head">' +
                    '<span class="recipe-slash" aria-hidden="true">/</span>' +
                    '<input type="search" id="recipeSearch" placeholder="How do I…" autocomplete="off" spellcheck="false" maxlength="64" aria-label="Search how-to">' +
                    '<span class="recipe-count" aria-live="polite"></span>' +
                    '<button type="button" class="recipe-close btn--icon" title="Close (Esc)" aria-label="Close">✕</button>' +
                '</div>' +
                '<div class="recipe-tags" role="group" aria-label="Topics"></div>' +
                '<div class="recipe-body">' +
                    '<div class="recipe-results" role="listbox" aria-label="Recipes"></div>' +
                    '<div class="recipe-detail"><div class="recipe-empty">Type what you want to do, or pick a topic.</div></div>' +
                '</div>' +
                '<div class="recipe-foot"><span id="recipeTitle" class="recipe-foot-title">How do I…</span><span class="recipe-foot-keys">↑ ↓ move · Enter shows me · Esc closes</span><button type="button" class="recipe-foot-hotkeys btn--ghost btn--sm">Hotkeys (F1)</button></div>' +
            '</div>';
        document.body.appendChild(m);
        modal = m;
        listEl = m.querySelector('.recipe-results');
        detailEl = m.querySelector('.recipe-detail');
        searchEl = m.querySelector('#recipeSearch');
        countEl = m.querySelector('.recipe-count');
        tagsEl = m.querySelector('.recipe-tags');

        // Topic chips: separated pills, pick one or none (click again clears).
        const all = document.createElement('button');
        all.type = 'button'; all.className = 'ch-text-toggle recipe-tag active'; all.dataset.pillar = ''; all.textContent = 'All';
        tagsEl.appendChild(all);
        PILLARS.forEach(([key, label]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'ch-text-toggle recipe-tag'; b.dataset.pillar = key; b.textContent = label;
            tagsEl.appendChild(b);
        });
        tagsEl.addEventListener('click', function (e) {
            const b = e.target.closest('.recipe-tag'); if (!b) return;
            pillar = (b.dataset.pillar === pillar) ? '' : b.dataset.pillar;
            Array.prototype.forEach.call(tagsEl.querySelectorAll('.recipe-tag'), (x) => x.classList.toggle('active', x.dataset.pillar === pillar));
            render();
            searchEl.focus();
        });

        searchEl.addEventListener('input', function () { highlight = 0; render(); });
        // Keys typed into the field must not reach the app's hotkeys; the
        // document-level capture below owns navigation.
        searchEl.addEventListener('keydown', function (e) { e.stopPropagation(); onKey(e); });
        m.querySelector('.recipe-close').addEventListener('click', function () { close(); });
        m.querySelector('.recipe-foot-hotkeys').addEventListener('click', function () { close(); if (typeof window.showHotkeys === 'function') window.showHotkeys(); });
        m.addEventListener('mousedown', function (e) { if (e.target === m) close(); });
        listEl.addEventListener('click', function (e) {
            const row = e.target.closest('.recipe-row'); if (!row) return;
            highlight = Number(row.dataset.index) || 0;
            renderHighlight();
            renderDetail();
        });
        listEl.addEventListener('dblclick', function (e) {
            const row = e.target.closest('.recipe-row'); if (!row) return;
            show(row.dataset.id);
        });
        detailEl.addEventListener('click', function (e) {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.act === 'show') show(b.dataset.id);
            else if (b.dataset.act === 'demo') demo(b.dataset.id, b);
        });
        return m;
    }

    function keyCap(text) {
        if (!text) return '';
        const t = isMac ? text.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥') : text;
        return '<kbd class="hk-cap">' + escapeHtml(t) + '</kbd>';
    }
    function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function render() {
        results = search(searchEl.value, pillar);
        if (highlight >= results.length) highlight = 0;
        countEl.textContent = results.length ? (results.length + ' of ' + RECIPES.length) : 'nothing matches';
        listEl.innerHTML = '';
        let lastPillar = null;
        results.forEach((r, i) => {
            if (!searchEl.value && !pillar && r.pillar !== lastPillar) {
                lastPillar = r.pillar;
                const h = document.createElement('div');
                h.className = 'recipe-group';
                const p = PILLARS.find((x) => x[0] === r.pillar);
                h.textContent = p ? p[1] : r.pillar;
                listEl.appendChild(h);
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'recipe-row';
            b.dataset.id = r.id; b.dataset.index = String(i);
            b.setAttribute('role', 'option');
            b.innerHTML = '<span class="recipe-row-title">' + escapeHtml(r.title) + '</span>' + keyCap(r.hotkey);
            listEl.appendChild(b);
        });
        renderHighlight();
        renderDetail();
    }
    function renderHighlight() {
        const rows = listEl.querySelectorAll('.recipe-row');
        rows.forEach((row, i) => {
            const on = i === highlight;
            row.setAttribute('aria-selected', on ? 'true' : 'false');
            row.classList.toggle('active', on);
            if (on) { try { row.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
        });
    }
    function renderDetail() {
        const r = results[highlight];
        if (!r) { detailEl.innerHTML = '<div class="recipe-empty">' + (searchEl.value ? 'Nothing matches. Try another word, or clear the search.' : 'Type what you want to do, or pick a topic.') + '</div>'; return; }
        const where = r.target ? (r.target.section ? r.target.section : r.target.strip ? 'Top bar · ' + r.target.strip : r.target.chrome ? 'Bottom-left bar' : r.target.canvas ? 'The canvas' : '') : '';
        const hasSteps = !!(r.steps && r.steps.length);
        const steps = hasSteps
            ? '<ol class="recipe-steps">' + r.steps.map((s) => '<li>' + escapeHtml(s.say) + (s.key ? ' ' + keyCap(s.key) : '') + '</li>').join('') + '</ol>'
            : '';
        detailEl.innerHTML =
            '<div class="recipe-detail-title">' + escapeHtml(r.title) + '</div>' +
            '<div class="recipe-detail-answer">' + escapeHtml(r.answer) + '</div>' +
            steps +
            (r.hotkey ? '<div class="recipe-detail-key">' + keyCap(r.hotkey) + '</div>' : '') +
            (where ? '<div class="recipe-detail-where">' + escapeHtml(where) + '</div>' : '') +
            '<div class="recipe-detail-actions">' +
                ((r.target || hasSteps) ? '<button type="button" class="btn--emphasis" data-act="show" data-id="' + r.id + '">' + (hasSteps ? 'Walk me through' : 'Show me') + '</button>' : '') +
                (r.demo ? '<button type="button" data-act="demo" data-id="' + r.id + '">' + escapeHtml(r.demo.label) + '</button>' : '') +
            '</div>';
    }

    // Document-level capture while open: arrows/Enter/Esc are ours; typing
    // goes to the field; everything else stops here so the canvas hotkeys
    // (F, Space, M…) cannot fire under the dialog.
    function onKey(e) {
        if (!modal || !modal.classList.contains('show')) return;
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation();
            if (searchEl.value) { searchEl.value = ''; highlight = 0; render(); } else close();
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation();
            if (!results.length) return;
            highlight = (highlight + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
            renderHighlight(); renderDetail();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            const r = results[highlight];
            if (r && (r.target || (r.steps && r.steps.length))) show(r.id);
            return;
        }
        if (e.key === 'Tab') {
            // Keep focus inside: field → chips → rows → buttons → field.
            const f = Array.prototype.filter.call(modal.querySelectorAll('input, button'), (el) => !el.hidden && el.offsetParent !== null);
            const i = f.indexOf(document.activeElement);
            const n = (i + (e.shiftKey ? -1 : 1) + f.length) % f.length;
            e.preventDefault(); e.stopPropagation();
            f[n].focus();
            return;
        }
        if (e.target !== searchEl) e.stopPropagation();
    }
    let keyBound = false;
    function bindKeys(on) {
        if (on && !keyBound) { document.addEventListener('keydown', onKey, true); keyBound = true; }
        else if (!on && keyBound) { document.removeEventListener('keydown', onKey, true); keyBound = false; }
    }

    function open(id) {
        const m = build();
        if (window.UIVisibility && window.UIVisibility.forkPending && window.UIVisibility.forkPending()) return; // the startup fork owns the keys
        pillHide();
        guideHide();
        m.classList.add('show');
        bindKeys(true);
        if (id) {
            searchEl.value = ''; pillar = '';
            Array.prototype.forEach.call(tagsEl.querySelectorAll('.recipe-tag'), (x) => x.classList.toggle('active', x.dataset.pillar === ''));
            render();
            const i = results.findIndex((r) => r.id === id);
            highlight = i >= 0 ? i : 0;
            renderHighlight(); renderDetail();
        } else {
            render();
        }
        searchEl.focus();
        searchEl.select();
    }
    function close() {
        if (!modal) return;
        modal.classList.remove('show');
        bindKeys(false);
        // Give focus back to the canvas so the next key is a hotkey again.
        try { const c = $('canvas'); if (c && document.activeElement && modal.contains(document.activeElement)) document.activeElement.blur(); } catch (_) {}
    }
    function isOpen() { return !!(modal && modal.classList.contains('show')); }

    // Show me: fold the modal to the pill, reveal, point. With steps, walk.
    async function show(id, opts) {
        opts = opts || {};
        const r = RECIPES.find((x) => x.id === id);
        if (!r) return;
        close();
        if (r.steps && r.steps.length) { pillHide(); pillRecipe = r; tourStart(r, 0); return; }
        if (!opts.keepPill) { pillHide(); pillShow(r); }
        if (!r.target) return;
        let res = null;
        try { res = await reveal(r.target); } catch (e) { console.warn('[Recipes] reveal failed', e); }
        if (res && res.anchor) guideShow(res.anchor, { wide: res.wide });
        else if (window.appAlert) window.appAlert(r.title, 'That control is not on screen right now.');
    }

    // ── Entry points: '/' hotkey, the strip's ? button, the pill's Esc ────
    document.addEventListener('keydown', function (e) {
        if (e.defaultPrevented) return;
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            if (window.__isTypingTarget && window.__isTypingTarget(e.target)) return;
            if (isOpen()) return;
            e.preventDefault();
            open();
        } else if (e.key === 'Escape' && !isOpen() && pillEl && pillEl.classList.contains('show')) {
            pillHide(); guideHide();
        }
    });
    document.addEventListener('click', function (e) {
        const b = e.target.closest && e.target.closest('#recipeHelpBtn');
        if (!b) return;
        e.preventDefault();
        if (isOpen()) close(); else open();
    });

    window.Recipes = {
        open: open, close: close, isOpen: isOpen, show: show, demo: demo, search: search,
        next: function () { if (tour) tourStep(tour.i + 1); },
        prev: function () { if (tour && tour.i > 0) tourStep(tour.i - 1); },
        tour: function () { return tour ? { id: tour.r.id, step: tour.i, steps: tour.r.steps.length, finished: tour.finished, waiting: !!tour.waiter } : null; },
        RECIPES: RECIPES, PILLARS: PILLARS,
        // Test hooks
        _reveal: reveal, _waitFor: waitFor, _guideHide: guideHide, _pillHide: pillHide, _guideAnchor: function () { return guideAnchor; }
    };
})();
