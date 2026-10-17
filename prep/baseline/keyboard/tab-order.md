# Keyboard focus order — Tab and Shift+Tab through the whole UI

Generated 2026-10-17T12:52:16.275Z by `prep/baseline/scripts/tab-order.js` (F4). Machine copy: `tab-order.json`. Notes, caveats and the `--check` result: `NOTES.md`.

## Environment

| Fact | Value |
|---|---|
| date | 2026-10-17T12:52:16.275Z |
| headCommit | c4796dac21008b26528e57f813425ffb7bd58490 |
| chrome | Chrome/155.0.8059.80 |
| userAgent | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36 |
| protocol | 1.3 |
| node | v25.9.0 |
| build | web build in headless Chrome (driver window 1600x900, scratch profile) |
| maxTabs | 800 |
| input | trusted Input.dispatchKeyEvent (driver tap), Tab = key Tab / code Tab / vk 9, Shift modifier for the reverse walk |
| innerWidth | 1584 |
| innerHeight | 805 |
| dpr | 1 |
| uiScale | 1 |
| url | http://127.0.0.1:63619/index.html |
| titlebarVisible | false |
| leftFolded | false |
| rightFolded | false |
| scriptsReady | true |
| skipMenuBuilt | true |

## Counts

- forward (Tab) stops: **225** (226 records including the document marker), ended because: focus left the page (document.activeElement is body) after stop 224
- reverse (Shift+Tab) stops: **225**, ended because: focus left the page (document.activeElement is body) after stop 224
- forward and reverse agree (reverse read backwards equals forward): **yes**
- role/name from the CDP accessibility tree: 225; page-side fallback: 0
- `:focus-visible` true at: 225/225 stops
- stops whose readable selector is not unique (the strict `path` in the JSON is): 0
- sections open for the walk: 17/17 (all)
- F0 cross-check (`prep/baseline/dom/controls.json`): 225 of 225 stops index into controls.json (0 tag/id mismatches); 0 rendered, enabled, tabIndex>=0 F0 controls were never reached; 0 stops are not in F0
- governor slowdown button `#slowdownCell` (js/08a, would add underbar stops): before the walk absent (governor none), after the picks absent (governor none)

### Stops per surface (forward)

| Surface | Stops |
|---|---|
| overlay:skipMenu | 4 |
| mixer-strip | 19 |
| sidebar-left | 51 |
| main-area | 1 |
| sidebar-right | 147 |
| overlay:quality-underbar | 3 |

### Stops per role (forward)

| Role | Stops |
|---|---|
| button | 118 |
| checkbox | 36 |
| slider | 29 |
| combobox | 16 |
| image | 8 |
| radio | 7 |
| ColorWell | 3 |
| textbox | 3 |
| switch | 2 |
| spinbutton | 2 |
| link | 1 |

### Stops per section (forward, in Tab order)

| Surface › section | Stops |
|---|---|
| (none) | 13 |
| mixer-strip › Material Type | 2 |
| mixer-strip › Viscosity | 1 |
| mixer-strip › Isolation | 1 |
| mixer-strip › Laminar / Blend | 1 |
| mixer-strip › Time | 1 |
| mixer-strip › Density | 1 |
| mixer-strip › Velocity | 1 |
| mixer-strip › Color | 7 |
| sidebar-left › Brush Size | 1 |
| sidebar-left › Brush | 22 |
| sidebar-left › Multi-Brush | 13 |
| sidebar-left › Stroke and replay | 14 |
| sidebar-right › Swirl Together | 7 |
| sidebar-right › Simulation | 14 |
| sidebar-right › Colors and palettes | 7 |
| sidebar-right › Layers | 12 |
| sidebar-right › Mutate shader | 12 |
| sidebar-right › Effects | 17 |
| sidebar-right › Animations | 9 |
| sidebar-right › Audio | 3 |
| sidebar-right › Kaleidoscope | 3 |
| sidebar-right › Text | 4 |
| sidebar-right › Focus | 7 |
| sidebar-right › Display | 15 |
| sidebar-right › Export | 12 |
| sidebar-right › Settings | 25 |

## What the skip menu does on the first Tab (js/66-skip-menu.js)

1. After the sections were opened by Shift-clicks and the canvas was clicked once: `document.activeElement` was **(document)**. The first Tab landed on **#sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-header:nth-of-type(1) > span.section-title:nth-of-type(1)** (skip menu open: false). Reading: js/66 "where you were": the canvas click took focus off the last control the mouse had focused (the last section title Shift-clicked), and Tab went back to it instead of opening the menu
2. After Escape (js/66 forgets the remembered control and blurs): `document.activeElement` was **(document)**. The first Tab landed on **#skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-option.skip-menu-left:nth-of-type(1)** (skip menu open: true, on "left"). Reading: the skip menu opened on "left" (js/66 open(): Tab with nothing focused and nothing remembered goes to the menu; it is the body's first child and the first Tab stop)

### Where each skip-menu pick lands (Escape, Tab, arrow to the region, Enter)

| Region | Arrow | Focused option | Focus landed on | Role | Name | Surface | Menu after | .skip-landed ring |
|---|---|---|---|---|---|---|---|---|
| left | ArrowLeft | left | #brushSizePerceptual | slider | Brush Size | sidebar-left | closed | yes |
| top | ArrowUp | top | #materialMode | combobox | Material - Changes settings to give a few differe… | mixer-strip | closed | yes |
| right | ArrowRight | right | #sidebar-right > div.sidebar-section:nth-of-type(2) > div.section-header:nth-of-type(1) > span.section-title:nth-of-type(1) | button | SWIRL TOGETHER | sidebar-right | closed | yes |
| bottom | ArrowDown | bottom | #quality-underbar > div.qub-dd:nth-of-type(1) > button.qub-dd-btn | button | IMAGE SHARPNESS 2048 | overlay:quality-underbar | closed | yes |

## Past the ends

- Forward: focus left the page (document.activeElement is body) after stop 224. One more Tab from (document) landed on **#resetAppBtn** — js/66 "where you were": with nothing focused, Tab went back to the last control that had focus (#resetAppBtn), not round to the other end
- Reverse: focus left the page (document.activeElement is body) after stop 224. One more Shift+Tab from (document) landed on **#materialMode** — js/66 "where you were": with nothing focused, Shift+Tab went back to the last control that had focus (#materialMode), not round to the other end. One more Shift+Tab from there landed on **#skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-option.skip-menu-bottom:nth-of-type(4)** — the browser's own Shift+Tab into the skip menu, on its "bottom" button.
- Reverse walk started from the last forward stop by: the Tab past the end (js/66) already put focus back on it

## Existing suites that cover keyboard behaviour (run by F6, not here)

| Suite | What it checks |
|---|---|
| scripts/test/skip-menu/run.js | js/66 skip menu: first Tab opens it, Tab/Shift+Tab/arrows round its four places, Space/Enter pick, section titles take Tab/Enter/Space with aria-expanded, folded controls out of the Tab order, Ctrl+Shift+Tab, Esc, where-you-were after painting, focus kept through fold and focus mode |
| scripts/test/focus-keys/run.js | js/05n Space gate + js/20 appConfirm + js/26 LayerTransform: Space presses a keyboard-focused control and freezes after a mouse press; confirm/alert Enter and Space; the folded left rail hands focus to Brush Size |
| scripts/test/bar-keys/run.js | js/20 makeQubDropdown: the bottom bar resolution dropdowns as keyboard listboxes, no invisible Tab stops from the hidden native selects, focus rings |
| scripts/test/dialog-focus/run.js | js/00b DialogFocus: Reset app, confirm, F1 sheet, palette delete, PhotoSafe take focus, trap Tab, close on Esc, return focus after a keyboard close; skip menu stays shut under them |
| scripts/test/slider-keys/run.js | js/67 slider arrow steps (1% / Shift 10%), Home, focus kept, dialogs keep the arrows |
| scripts/test/popup-focus/run.js | js/00b popup(): Presets, More, colour popover, room menus take focus from the keyboard, Esc returns to the trigger, Tab out closes, mouse-opened leaves focus alone |

## Forward order (Tab), every stop

Columns: #; surface; section (`.sidebar-section` title or `.mixer-channel` label); region (js/66: left/top/right/bottom); element (tag[type]); selector (readable; `*` = not unique, see `path` in the JSON); role; name (c = CDP AX tree, f = page fallback); F0 order (`controls.json` index); `:focus-visible`.

| # | Surface | Section | Region | Element | Selector | Role | Name | F0 # | fv |
|---|---|---|---|---|---|---|---|---|---|
| 0 | overlay:skipMenu |  |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Left sidebar (c) | 0 | Y |
| 1 | overlay:skipMenu |  |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Top nav (c) | 1 | Y |
| 2 | overlay:skipMenu |  |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Right sidebar (c) | 2 | Y |
| 3 | overlay:skipMenu |  |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Bottom nav (c) | 3 | Y |
| 4 | mixer-strip | Material Type | top | select | #materialMode | combobox | Material - Changes settings to give a few diffe… (c) | 15 | Y |
| 5 | mixer-strip | Material Type | top | input[range] | #curl | slider | Fluid (c) | 16 | Y |
| 6 | mixer-strip | Viscosity | top | input[range] | #viscosity | slider | Viscosity (c) | 18 | Y |
| 7 | mixer-strip | Isolation | top | input[range] | #velocityInfluence | slider | Isolation (c) | 20 | Y |
| 8 | mixer-strip | Laminar / Blend | top | input[range] | #colorBlendPerceptual | slider | Laminar / Blend (c) | 23 | Y |
| 9 | mixer-strip | Time | top | input[range] | #timeScalePerceptual | slider | Time (c) | 26 | Y |
| 10 | mixer-strip | Density | top | input[range] | #densityDissipationPerceptual | slider | Density (c) | 29 | Y |
| 11 | mixer-strip | Velocity | top | input[range] | #velocityDissipation | slider | Velocity (c) | 31 | Y |
| 12 | mixer-strip | Color | top | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | One (c) | 38 | Y |
| 13 | mixer-strip | Color | top | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Random (c) | 39 | Y |
| 14 | mixer-strip | Color | top | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Palette (c) | 40 | Y |
| 15 | mixer-strip | Color | top | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Limit  On (c) | 41 | Y |
| 16 | mixer-strip | Color | top | input[color] | #colorPicker | ColorWell |  (c) | 42 | Y |
| 17 | mixer-strip | Color | top | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Ignite (c) | 43 | Y |
| 18 | mixer-strip | Color | top | div | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Lock Ignite on (c) | 44 | Y |
| 19 | mixer-strip |  | top | button | #mixerPresetsTrigger | button | Presets ▾ (c) | 45 | Y |
| 20 | mixer-strip |  | top | button | #mixer-strip > div.mixer-stack:nth-of-type(12) > div.mixer-actions:nt… | button | Clear (c) | 46 | Y |
| 21 | mixer-strip |  | top | button | #pauseBtn | button | ⏸ (c) | 47 | Y |
| 22 | mixer-strip |  | top | button | #freezeBtn | button | Stop (c) | 48 | Y |
| 23 | sidebar-left | Brush Size | left | input[range] | #brushSizePerceptual | slider | Brush Size (c) | 51 | Y |
| 24 | sidebar-left |  | left | input[range] | #brushSteady | slider | STABILIZATION 0% (c) | 53 | Y |
| 25 | sidebar-left | Brush | left | span | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | BRUSH (c) | 57 | Y |
| 26 | sidebar-left | Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | + New Brush Preset (c) | 60 | Y |
| 27 | sidebar-left | Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Fluid (c) | 63 | Y |
| 28 | sidebar-left | Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Pressure (c) | 64 | Y |
| 29 | sidebar-left | Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Collider (c) | 65 | Y |
| 30 | sidebar-left | Brush | left | input[checkbox] | #cursorToggle | checkbox | Show Cursor (c) | 72 | Y |
| 31 | sidebar-left | Brush | left | input[checkbox] | #brushGhostToggle | checkbox | BRUSH GHOST 100% (c) | 75 | Y |
| 32 | sidebar-left | Brush | left | input[range] | #brushGhostOpacity | slider | Brush ghost opacity (c) | 76 | Y |
| 33 | sidebar-left | Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | TIP (c) | 77 | Y |
| 34 | sidebar-left | Brush | left | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ◌ (c) | 78 | Y |
| 35 | sidebar-left | Brush | left | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ⬤ (c) | 79 | Y |
| 36 | sidebar-left | Brush | left | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ■ (c) | 80 | Y |
| 37 | sidebar-left | Brush | left | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ▬ (c) | 81 | Y |
| 38 | sidebar-left | Brush | left | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ◯ (c) | 82 | Y |
| 39 | sidebar-left | Brush | left | button | #brushTipFoldBody > div.brush-shapes-area:nth-of-type(2) > div.brush-… | button | ＋ (c) | 83 | Y |
| 40 | sidebar-left | Brush | left | button | #brushTipFoldBody > div.brush-shapes-area:nth-of-type(2) > div.brush-… | button | Clipboard (c) | 84 | Y |
| 41 | sidebar-left | Brush | left | input[range] | #brushAngle | slider | ANGLE 0° (c) | 89 | Y |
| 42 | sidebar-left | Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | On Move (c) | 91 | Y |
| 43 | sidebar-left | Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Constant (c) | 92 | Y |
| 44 | sidebar-left | Brush | left | input[range] | #brushDabInterval | slider | INTERVAL 4 ms · 250/s (c) | 96 | Y |
| 45 | sidebar-left | Brush | left | input[range] | #brushFlow | slider | FLOW 100% (c) | 98 | Y |
| 46 | sidebar-left | Brush | left | input[range] | #brushJitter | slider | JITTER 0% (c) | 100 | Y |
| 47 | sidebar-left | Multi-Brush | left | span | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | MULTI-BRUSH (c) | 102 | Y |
| 48 | sidebar-left | Multi-Brush | left | input[range] | #multiplier | slider | Multi-Brush (c) | 104 | Y |
| 49 | sidebar-left | Multi-Brush | left | select | #symmetryMode | combobox | SYMMETRY (c) | 106 | Y |
| 50 | sidebar-left | Multi-Brush | left | input[checkbox] | #symmetrySameAngle | checkbox | Same angle on every arm (c) | 107 | Y |
| 51 | sidebar-left | Multi-Brush | left | input[checkbox] | #symmetryFaceCenter | checkbox | Stay oriented to the center (c) | 109 | Y |
| 52 | sidebar-left | Multi-Brush | left | input[range] | #symmetryHold | slider | HOLD SYMMETRY 0.00 (c) | 112 | Y |
| 53 | sidebar-left | Multi-Brush | left | input[color] | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | ColorWell | Arm 1 color (c) | 113 | Y |
| 54 | sidebar-left | Multi-Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Main (c) | 115 | Y |
| 55 | sidebar-left | Multi-Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Custom (c) | 116 | Y |
| 56 | sidebar-left | Multi-Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Random (c) | 117 | Y |
| 57 | sidebar-left | Multi-Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Palette (c) | 118 | Y |
| 58 | sidebar-left | Multi-Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | checkbox | Pressure (c) | 119 | Y |
| 59 | sidebar-left | Multi-Brush | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Brush 1 tip: same as the brush (c) | 120 | Y |
| 60 | sidebar-left | Stroke and replay | left | span | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | STROKE AND REPLAY (c) | 122 | Y |
| 61 | sidebar-left | Stroke and replay | left | select | #buttonMode_left | combobox | LEFT CLICK (c) | 125 | Y |
| 62 | sidebar-left | Stroke and replay | left | select | #buttonMode_right | combobox | RIGHT CLICK (c) | 141 | Y |
| 63 | sidebar-left | Stroke and replay | left | select | #buttonMode_middle | combobox | MIDDLE CLICK (MOUSE 3) (c) | 157 | Y |
| 64 | sidebar-left | Stroke and replay | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Edit the menu (c) | 171 | Y |
| 65 | sidebar-left | Stroke and replay | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Set key (c) | 173 | Y |
| 66 | sidebar-left | Stroke and replay | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Set key (c) | 175 | Y |
| 67 | sidebar-left | Stroke and replay | left | input[checkbox] | #strokeLockGuides | checkbox | Show guides (c) | 177 | Y |
| 68 | sidebar-left | Stroke and replay | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Stroke (c) | 180 | Y |
| 69 | sidebar-left | Stroke and replay | left | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Time (c) | 181 | Y |
| 70 | sidebar-left | Stroke and replay | left | input[range] | #replaySpeed | slider | REPLAY SPEED 1× (c) | 185 | Y |
| 71 | sidebar-left | Stroke and replay | left | input[checkbox] | #preserveRandomness | checkbox | Preserve Randomness (c) | 186 | Y |
| 72 | sidebar-left | Stroke and replay | left | select | #splatInMode | combobox |  (c) | 189 | Y |
| 73 | sidebar-left | Stroke and replay | left | select | #splatOutMode | combobox |  (c) | 192 | Y |
| 74 | main-area |  |  | button | #main-area > div.lsb-edge:nth-of-type(2) > button.lsb-toggle.btn--icon | button | Left-facing sideways arrows icon: collapses the… (c) | 198 | Y |
| 75 | sidebar-right | Swirl Together | right | span | #sidebar-right > div.sidebar-section:nth-of-type(2) > div.section-hea… | button | SWIRL TOGETHER (c) | 214 | Y |
| 76 | sidebar-right | Swirl Together | right | button | #createRoomBtn | button | Start a room (c) | 215 | Y |
| 77 | sidebar-right | Swirl Together | right | button | #strangerBtn | button | Stranger (c) | 216 | Y |
| 78 | sidebar-right | Swirl Together | right | input[text] | #joinRoomInput | textbox | Room code to join (c) | 217 | Y |
| 79 | sidebar-right | Swirl Together | right | button | #joinRoomBtn | button | Join (c) | 218 | Y |
| 80 | sidebar-right | Swirl Together | right | button | #phonePadBtn | button | Sync phone (c) | 219 | Y |
| 81 | sidebar-right | Swirl Together | right | button | #shareLookBtn | button | Link to current settings (c) | 220 | Y |
| 82 | sidebar-right | Simulation | right | span | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-hea… | button | SIMULATION (c) | 229 | Y |
| 83 | sidebar-right | Simulation | right | select | #fpsCap | combobox | FPS LIMIT (c) | 231 | Y |
| 84 | sidebar-right | Simulation | right | input[range] | #pressureDissipation | slider | PRESSURE DISSIPATION 0.950 (c) | 233 | Y |
| 85 | sidebar-right | Simulation | right | input[range] | #pressureIteration | slider | PRESSURE ITERATION 25 (c) | 235 | Y |
| 86 | sidebar-right | Simulation | right | input[range] | #wetInfluence | slider | DRYING 0.14 (c) | 237 | Y |
| 87 | sidebar-right | Simulation | right | input[range] | #wetDrying | slider | DRY TIME 4.5s (c) | 239 | Y |
| 88 | sidebar-right | Simulation | right | input[range] | #grainCleanup | slider | GRAIN CLEANUP 0.75 (c) | 241 | Y |
| 89 | sidebar-right | Simulation | right | input[checkbox] | #macCormackToggle | checkbox | Crisp Advection (c) | 242 | Y |
| 90 | sidebar-right | Simulation | right | input[checkbox] | #multigridToggle | checkbox | Multigrid Pressure (c) | 244 | Y |
| 91 | sidebar-right | Simulation | right | input[range] | #mgCycles | slider | V-CYCLES 2 (c) | 247 | Y |
| 92 | sidebar-right | Simulation | right | input[range] | #mgPre | slider | PRE-SMOOTH 2 (c) | 249 | Y |
| 93 | sidebar-right | Simulation | right | input[range] | #mgPost | slider | POST-SMOOTH 2 (c) | 251 | Y |
| 94 | sidebar-right | Simulation | right | input[range] | #mgCoarse | slider | COARSE SOLVE 8 (c) | 253 | Y |
| 95 | sidebar-right | Simulation | right | input[range] | #mgRelax | slider | RELAXATION 1.00 (c) | 255 | Y |
| 96 | sidebar-right | Colors and palettes | right | span | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-hea… | button | COLORS AND PALETTES (c) | 257 | Y |
| 97 | sidebar-right | Colors and palettes | right | div | #paletteSelect | combobox | Palette (c) | 259 | Y |
| 98 | sidebar-right | Colors and palettes | right | div | #palettePreview > div.palette-chip-wrap:nth-of-type(1) > div.palette-… | button | #2C5F2D (c) | 260 | Y |
| 99 | sidebar-right | Colors and palettes | right | button | #paletteAddChip | button | + (c) | 265 | Y |
| 100 | sidebar-right | Colors and palettes | right | button | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-bod… | button | Export this (c) | 267 | Y |
| 101 | sidebar-right | Colors and palettes | right | button | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-bod… | button | Export all (c) | 268 | Y |
| 102 | sidebar-right | Colors and palettes | right | button | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-bod… | button | Import (c) | 269 | Y |
| 103 | sidebar-right | Layers | right | span | #sidebar-right > div.sidebar-section.section-layers:nth-of-type(5) > … | button | LAYERS (c) | 272 | Y |
| 104 | sidebar-right | Layers | right | button | #uploadBtn | button | Import (c) | 274 | Y |
| 105 | sidebar-right | Layers | right | button | #captureBtn | button | Visible to layer (c) | 275 | Y |
| 106 | sidebar-right | Layers | right | button | #flattenLayersBtn | button | Flatten (c) | 276 | Y |
| 107 | sidebar-right | Layers | right | button | #addCollisionLayerBtn | button | Collider (c) | 277 | Y |
| 108 | sidebar-right | Layers | right | input[text] | #layersPanel > div.layer-item.layer-item-collapsible:nth-of-type(2) >… | textbox |  (c) | 280 | Y |
| 109 | sidebar-right | Layers | right | input[checkbox] | #layersPanel > div.layer-item.layer-item-collapsible:nth-of-type(2) >… | checkbox | Show or hide this layer (c) | 282 | Y |
| 110 | sidebar-right | Layers | right | button | #sidebar-right > div.sidebar-section.section-layers:nth-of-type(5) > … | button | + New Path (c) | 283 | Y |
| 111 | sidebar-right | Layers | right | button | #pathLayersList > div.path-empty-state > button.path-empty-create | button | + Create Path Layer (c) | 284 | Y |
| 112 | sidebar-right | Layers | right | input[checkbox] | #hoverCaptureToggle | checkbox | Enable Capture on Hover (c) | 285 | Y |
| 113 | sidebar-right | Layers | right | input[checkbox] | #detachCaptureToggle | checkbox | Detach Capture Area (c) | 287 | Y |
| 114 | sidebar-right | Layers | right | input[checkbox] | #showPreviewLayersCb | checkbox | Show Preview Layers (c) | 289 | Y |
| 115 | sidebar-right | Mutate shader | right | span | #mutation-section > div.section-header:nth-of-type(1) > span.section-… | button | MUTATE SHADER (c) | 293 | Y |
| 116 | sidebar-right | Mutate shader | right | button | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-co… | button | Basic (c) | 295 | Y |
| 117 | sidebar-right | Mutate shader | right | button | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-co… | button | All (c) | 296 | Y |
| 118 | sidebar-right | Mutate shader | right | input[range] | #mutationStrength | slider | Strength of mutate, larger creates wider swings… (c) | 299 | Y |
| 119 | sidebar-right | Mutate shader | right | select | #mutationCount | combobox |  (c) | 301 | Y |
| 120 | sidebar-right | Mutate shader | right | button | #mutationGenerate | button | Mutate M (c) | 302 | Y |
| 121 | sidebar-right | Mutate shader | right | button | #mutationReset | button | Reset (c) | 305 | Y |
| 122 | sidebar-right | Mutate shader | right | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Colors (c) | 308 | Y |
| 123 | sidebar-right | Mutate shader | right | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Kaleido (c) | 310 | Y |
| 124 | sidebar-right | Mutate shader | right | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Sim (c) | 312 | Y |
| 125 | sidebar-right | Mutate shader | right | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Effects (c) | 314 | Y |
| 126 | sidebar-right | Mutate shader | right | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Audio (c) | 316 | Y |
| 127 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-hea… | button | EFFECTS (c) | 318 | Y |
| 128 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Light Source (c) | 319 | Y |
| 129 | sidebar-right | Effects | right | input[checkbox] | #enableLighting | checkbox | Light Source (c) | 320 | Y |
| 130 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Light Shift (c) | 330 | Y |
| 131 | sidebar-right | Effects | right | input[checkbox] | #enableLightShift | checkbox | Light Shift (c) | 331 | Y |
| 132 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Glow (c) | 345 | Y |
| 133 | sidebar-right | Effects | right | input[checkbox] | #glowToggle | checkbox | Glow (c) | 346 | Y |
| 134 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Surface Shading (c) | 363 | Y |
| 135 | sidebar-right | Effects | right | input[checkbox] | #displayShadingToggle | checkbox | Surface Shading (c) | 364 | Y |
| 136 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Dither (c) | 378 | Y |
| 137 | sidebar-right | Effects | right | input[checkbox] | #ditherToggle | checkbox | Dither (c) | 379 | Y |
| 138 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Gravity Direction (c) | 394 | Y |
| 139 | sidebar-right | Effects | right | input[checkbox] | #pressureConstant | checkbox | Gravity Direction (c) | 395 | Y |
| 140 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Border (c) | 397 | Y |
| 141 | sidebar-right | Effects | right | input[checkbox] | #overflowToggle | checkbox | Border (c) | 398 | Y |
| 142 | sidebar-right | Effects | right | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Breathing (c) | 402 | Y |
| 143 | sidebar-right | Effects | right | input[checkbox] | #breathingToggle | checkbox | Breathing (c) | 403 | Y |
| 144 | sidebar-right | Animations | right | span | #sidebar-right > div.sidebar-section:nth-of-type(8) > div.section-hea… | button | ANIMATIONS (c) | 414 | Y |
| 145 | sidebar-right | Animations | right | button | #recMiniRecordBtn | button | ●Record (c) | 415 | Y |
| 146 | sidebar-right | Animations | right | button | #recLen4 | button | 4 s (c) | 419 | Y |
| 147 | sidebar-right | Animations | right | button | #recLen8 | button | 8 s (c) | 420 | Y |
| 148 | sidebar-right | Animations | right | button | #recLen15 | button | 15 s (c) | 421 | Y |
| 149 | sidebar-right | Animations | right | button | #recLen30 | button | 30 s (c) | 422 | Y |
| 150 | sidebar-right | Animations | right | button | #recSrcMe | button | Local Only (c) | 424 | Y |
| 151 | sidebar-right | Animations | right | button | #recSrcAll | button | Everything (c) | 425 | Y |
| 152 | sidebar-right | Animations | right | button | #sidebar-right > div.sidebar-section:nth-of-type(8) > div.section-bod… | button | Saved Animations ▾ (c) | 428 | Y |
| 153 | sidebar-right | Audio | right | span | #sidebar-right > div.sidebar-section:nth-of-type(9) > div.section-hea… | button | AUDIO (c) | 430 | Y |
| 154 | sidebar-right | Audio | right | select | #audioMode | combobox | AUDIO MODE (c) | 432 | Y |
| 155 | sidebar-right | Audio | right | input[checkbox] | #audioTimingToggle | checkbox | Visualize Audio Timing (c) | 445 | Y |
| 156 | sidebar-right | Kaleidoscope | right | span | #sidebar-right > div.sidebar-section:nth-of-type(10) > div.section-he… | button | KALEIDOSCOPE (c) | 448 | Y |
| 157 | sidebar-right | Kaleidoscope | right | input[checkbox] | #mandalaToggle | switch | Mandala Overlay (c) | 449 | Y |
| 158 | sidebar-right | Kaleidoscope | right | input[checkbox] | #kaleidoToggle | switch | Kaleido (c) | 475 | Y |
| 159 | sidebar-right | Text | right | span | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-he… | button | TEXT (c) | 496 | Y |
| 160 | sidebar-right | Text | right | button | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | + Add Text (c) | 497 | Y |
| 161 | sidebar-right | Text | right | button | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Arrange on Canvas (c) | 498 | Y |
| 162 | sidebar-right | Text | right | button | #textOverlayClearAll | button | Clear All (c) | 538 | Y |
| 163 | sidebar-right | Focus | right | span | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-he… | button | FOCUS (c) | 543 | Y |
| 164 | sidebar-right | Focus | right | input[checkbox] | #focusModeToggle | checkbox | Focus Mode (F) (c) | 544 | Y |
| 165 | sidebar-right | Focus | right | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 9:16 TikTok (c) | 547 | Y |
| 166 | sidebar-right | Focus | right | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 1:1 Square (c) | 548 | Y |
| 167 | sidebar-right | Focus | right | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 16:9 YouTube (c) | 549 | Y |
| 168 | sidebar-right | Focus | right | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 21:9 Ultra (c) | 550 | Y |
| 169 | sidebar-right | Focus | right | input[checkbox] | #streamFormatLock | checkbox | Lock Format (c) | 551 | Y |
| 170 | sidebar-right | Display | right | span | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-he… | button | DISPLAY (c) | 554 | Y |
| 171 | sidebar-right | Display | right | input[checkbox] | #photoSafeToggle | checkbox | Reduce flashing and rapid brightness changes (c) | 555 | Y |
| 172 | sidebar-right | Display | right | button | #photoWarnShowBtn | button | Show photosensitivity warning (c) | 557 | Y |
| 173 | sidebar-right | Display | right | a | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | link | Learn more about photosensitivity (Epilepsy Fou… (c) | 558 | Y |
| 174 | sidebar-right | Display | right | select | #windowMode | combobox | WINDOW MODE F11 (c) | 560 | Y |
| 175 | sidebar-right | Display | right | button | #penWindowBtn | button | PEN INPUT WINDOW (c) | 562 | Y |
| 176 | sidebar-right | Display | right | select | #penWindowMirror | combobox | PEN WINDOW MIRROR (c) | 564 | Y |
| 177 | sidebar-right | Display | right | button | #penWindowScreens > button | button | Find Screens (c) | 566 | Y |
| 178 | sidebar-right | Display | right | input[color] | #backgroundColorPicker | ColorWell | BACKGROUND COLOR (c) | 568 | Y |
| 179 | sidebar-right | Display | right | input[checkbox] | #transparentMode | checkbox | Transparent Background (c) | 569 | Y |
| 180 | sidebar-right | Display | right | input[range] | #canvasOpacity | slider | CANVAS OPACITY (SIM VISIBILITY) 100% (c) | 573 | Y |
| 181 | sidebar-right | Display | right | input[checkbox] | #preserveFluidOpacity | checkbox | Empty Alpha Locked (c) | 574 | Y |
| 182 | sidebar-right | Display | right | input[checkbox] | #showCanvasHandles | checkbox | Show Canvas Border & Handles (c) | 578 | Y |
| 183 | sidebar-right | Display | right | input[checkbox] | #lockCanvasBorders | checkbox | Lock Canvas Borders (c) | 580 | Y |
| 184 | sidebar-right | Display | right | input[checkbox] | #statsToggle | checkbox | Debug Info (c) | 582 | Y |
| 185 | sidebar-right | Export | right | span | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-he… | button | EXPORT (c) | 585 | Y |
| 186 | sidebar-right | Export | right | button | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | button | Save Project (c) | 587 | Y |
| 187 | sidebar-right | Export | right | button | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | button | Load Project (c) | 588 | Y |
| 188 | sidebar-right | Export | right | button | #exportVideoBtn | button | Video (c) | 591 | Y |
| 189 | sidebar-right | Export | right | button | #exportGifBtn | button | GIF (c) | 592 | Y |
| 190 | sidebar-right | Export | right | button | #exportStillBtn | button | Save picture (c) | 593 | Y |
| 191 | sidebar-right | Export | right | button | #exportSequenceBtn | button | Sequence (c) | 594 | Y |
| 192 | sidebar-right | Export | right | select | #exportGround | combobox | Background (c) | 596 | Y |
| 193 | sidebar-right | Export | right | input[number] | #exportVideoDuration | spinbutton |  (c) | 600 | Y |
| 194 | sidebar-right | Export | right | select | #exportVideoFPS | combobox |  (c) | 602 | Y |
| 195 | sidebar-right | Export | right | input[number] | #exportGifDuration | spinbutton |  (c) | 605 | Y |
| 196 | sidebar-right | Export | right | select | #exportGifFPS | combobox |  (c) | 607 | Y |
| 197 | sidebar-right | Settings | right | span | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-he… | button | SETTINGS (c) | 609 | Y |
| 198 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Simple (c) | 611 | Y |
| 199 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Everything (c) | 612 | Y |
| 200 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Visible sections 28 / 28 ▾ (c) | 613 | Y |
| 201 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | + Bind a control Ctrl+Shift+H (c) | 671 | Y |
| 202 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Your hotkeys ▾ (c) | 672 | Y |
| 203 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Brush Size” off the menu (c) | 674 | Y |
| 204 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Material Type - Fluid” off the menu (c) | 675 | Y |
| 205 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Viscosity” off the menu (c) | 676 | Y |
| 206 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Isolation” off the menu (c) | 677 | Y |
| 207 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Laminar / Blend” off the menu (c) | 678 | Y |
| 208 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Multi-Brush” off the menu (c) | 679 | Y |
| 209 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Time” off the menu (c) | 680 | Y |
| 210 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Density” off the menu (c) | 681 | Y |
| 211 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Velocity” off the menu (c) | 682 | Y |
| 212 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | + Add from the interface (c) | 683 | Y |
| 213 | sidebar-right | Settings | right | input[text] | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | textbox | Label for a new key item (c) | 684 | Y |
| 214 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Its key (c) | 685 | Y |
| 215 | sidebar-right | Settings | right | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Add (c) | 687 | Y |
| 216 | sidebar-right | Settings | right | button | #saveSettingsBtn | button | Save settings (c) | 690 | Y |
| 217 | sidebar-right | Settings | right | button | #loadSettingsBtn | button | Load (c) | 691 | Y |
| 218 | sidebar-right | Settings | right | button | #clearSettingsBtn | button | Clear (c) | 692 | Y |
| 219 | sidebar-right | Settings | right | input[checkbox] | #autoloadSettings | checkbox | Load saved on start (c) | 693 | Y |
| 220 | sidebar-right | Settings | right | button | #exportAllPresetsBtn | button | ⤓ Export Presets (c) | 696 | Y |
| 221 | sidebar-right | Settings | right | button | #importPresetsBtn | button | ⤒ Import Presets (c) | 697 | Y |
| 222 | overlay:quality-underbar |  | bottom | button | #quality-underbar > div.qub-dd:nth-of-type(1) > button.qub-dd-btn | button | IMAGE SHARPNESS 2048 (c) | 822 | Y |
| 223 | overlay:quality-underbar |  | bottom | button | #quality-underbar > div.qub-dd:nth-of-type(2) > button.qub-dd-btn | button | MOTION DETAIL 1024 (c) | 825 | Y |
| 224 | overlay:quality-underbar |  | bottom | button | #resetAppBtn | button | Reset app (c) | 831 | Y |
| 225 |  |  |  |  | (document: focus left the page) |  |  |  |  |

## Reverse order (Shift+Tab), every stop

| # | Surface | Section | Element | Selector | Role | Name |
|---|---|---|---|---|---|---|
| 0 | overlay:quality-underbar |  | button | #resetAppBtn | button | Reset app |
| 1 | overlay:quality-underbar |  | button | #quality-underbar > div.qub-dd:nth-of-type(2) > button.qub-dd-btn | button | MOTION DETAIL 1024 |
| 2 | overlay:quality-underbar |  | button | #quality-underbar > div.qub-dd:nth-of-type(1) > button.qub-dd-btn | button | IMAGE SHARPNESS 2048 |
| 3 | sidebar-right | Settings | button | #importPresetsBtn | button | ⤒ Import Presets |
| 4 | sidebar-right | Settings | button | #exportAllPresetsBtn | button | ⤓ Export Presets |
| 5 | sidebar-right | Settings | input[checkbox] | #autoloadSettings | checkbox | Load saved on start |
| 6 | sidebar-right | Settings | button | #clearSettingsBtn | button | Clear |
| 7 | sidebar-right | Settings | button | #loadSettingsBtn | button | Load |
| 8 | sidebar-right | Settings | button | #saveSettingsBtn | button | Save settings |
| 9 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Add |
| 10 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Its key |
| 11 | sidebar-right | Settings | input[text] | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | textbox | Label for a new key item |
| 12 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | + Add from the interface |
| 13 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Velocity” off the menu |
| 14 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Density” off the menu |
| 15 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Time” off the menu |
| 16 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Multi-Brush” off the menu |
| 17 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Laminar / Blend” off the menu |
| 18 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Isolation” off the menu |
| 19 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Viscosity” off the menu |
| 20 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Material Type - Fluid” off the menu |
| 21 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Take “Brush Size” off the menu |
| 22 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Your hotkeys ▾ |
| 23 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | + Bind a control Ctrl+Shift+H |
| 24 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Visible sections 28 / 28 ▾ |
| 25 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Everything |
| 26 | sidebar-right | Settings | button | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | button | Simple |
| 27 | sidebar-right | Settings | span | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-he… | button | SETTINGS |
| 28 | sidebar-right | Export | select | #exportGifFPS | combobox |  |
| 29 | sidebar-right | Export | input[number] | #exportGifDuration | spinbutton |  |
| 30 | sidebar-right | Export | select | #exportVideoFPS | combobox |  |
| 31 | sidebar-right | Export | input[number] | #exportVideoDuration | spinbutton |  |
| 32 | sidebar-right | Export | select | #exportGround | combobox | Background |
| 33 | sidebar-right | Export | button | #exportSequenceBtn | button | Sequence |
| 34 | sidebar-right | Export | button | #exportStillBtn | button | Save picture |
| 35 | sidebar-right | Export | button | #exportGifBtn | button | GIF |
| 36 | sidebar-right | Export | button | #exportVideoBtn | button | Video |
| 37 | sidebar-right | Export | button | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | button | Load Project |
| 38 | sidebar-right | Export | button | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | button | Save Project |
| 39 | sidebar-right | Export | span | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-he… | button | EXPORT |
| 40 | sidebar-right | Display | input[checkbox] | #statsToggle | checkbox | Debug Info |
| 41 | sidebar-right | Display | input[checkbox] | #lockCanvasBorders | checkbox | Lock Canvas Borders |
| 42 | sidebar-right | Display | input[checkbox] | #showCanvasHandles | checkbox | Show Canvas Border & Handles |
| 43 | sidebar-right | Display | input[checkbox] | #preserveFluidOpacity | checkbox | Empty Alpha Locked |
| 44 | sidebar-right | Display | input[range] | #canvasOpacity | slider | CANVAS OPACITY (SIM VISIBILITY) 100% |
| 45 | sidebar-right | Display | input[checkbox] | #transparentMode | checkbox | Transparent Background |
| 46 | sidebar-right | Display | input[color] | #backgroundColorPicker | ColorWell | BACKGROUND COLOR |
| 47 | sidebar-right | Display | button | #penWindowScreens > button | button | Find Screens |
| 48 | sidebar-right | Display | select | #penWindowMirror | combobox | PEN WINDOW MIRROR |
| 49 | sidebar-right | Display | button | #penWindowBtn | button | PEN INPUT WINDOW |
| 50 | sidebar-right | Display | select | #windowMode | combobox | WINDOW MODE F11 |
| 51 | sidebar-right | Display | a | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | link | Learn more about photosensitivity (Epilepsy Fou… |
| 52 | sidebar-right | Display | button | #photoWarnShowBtn | button | Show photosensitivity warning |
| 53 | sidebar-right | Display | input[checkbox] | #photoSafeToggle | checkbox | Reduce flashing and rapid brightness changes |
| 54 | sidebar-right | Display | span | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-he… | button | DISPLAY |
| 55 | sidebar-right | Focus | input[checkbox] | #streamFormatLock | checkbox | Lock Format |
| 56 | sidebar-right | Focus | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 21:9 Ultra |
| 57 | sidebar-right | Focus | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 16:9 YouTube |
| 58 | sidebar-right | Focus | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 1:1 Square |
| 59 | sidebar-right | Focus | button | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | button | 9:16 TikTok |
| 60 | sidebar-right | Focus | input[checkbox] | #focusModeToggle | checkbox | Focus Mode (F) |
| 61 | sidebar-right | Focus | span | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-he… | button | FOCUS |
| 62 | sidebar-right | Text | button | #textOverlayClearAll | button | Clear All |
| 63 | sidebar-right | Text | button | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Arrange on Canvas |
| 64 | sidebar-right | Text | button | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | + Add Text |
| 65 | sidebar-right | Text | span | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-he… | button | TEXT |
| 66 | sidebar-right | Kaleidoscope | input[checkbox] | #kaleidoToggle | switch | Kaleido |
| 67 | sidebar-right | Kaleidoscope | input[checkbox] | #mandalaToggle | switch | Mandala Overlay |
| 68 | sidebar-right | Kaleidoscope | span | #sidebar-right > div.sidebar-section:nth-of-type(10) > div.section-he… | button | KALEIDOSCOPE |
| 69 | sidebar-right | Audio | input[checkbox] | #audioTimingToggle | checkbox | Visualize Audio Timing |
| 70 | sidebar-right | Audio | select | #audioMode | combobox | AUDIO MODE |
| 71 | sidebar-right | Audio | span | #sidebar-right > div.sidebar-section:nth-of-type(9) > div.section-hea… | button | AUDIO |
| 72 | sidebar-right | Animations | button | #sidebar-right > div.sidebar-section:nth-of-type(8) > div.section-bod… | button | Saved Animations ▾ |
| 73 | sidebar-right | Animations | button | #recSrcAll | button | Everything |
| 74 | sidebar-right | Animations | button | #recSrcMe | button | Local Only |
| 75 | sidebar-right | Animations | button | #recLen30 | button | 30 s |
| 76 | sidebar-right | Animations | button | #recLen15 | button | 15 s |
| 77 | sidebar-right | Animations | button | #recLen8 | button | 8 s |
| 78 | sidebar-right | Animations | button | #recLen4 | button | 4 s |
| 79 | sidebar-right | Animations | button | #recMiniRecordBtn | button | ●Record |
| 80 | sidebar-right | Animations | span | #sidebar-right > div.sidebar-section:nth-of-type(8) > div.section-hea… | button | ANIMATIONS |
| 81 | sidebar-right | Effects | input[checkbox] | #breathingToggle | checkbox | Breathing |
| 82 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Breathing |
| 83 | sidebar-right | Effects | input[checkbox] | #overflowToggle | checkbox | Border |
| 84 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Border |
| 85 | sidebar-right | Effects | input[checkbox] | #pressureConstant | checkbox | Gravity Direction |
| 86 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Gravity Direction |
| 87 | sidebar-right | Effects | input[checkbox] | #ditherToggle | checkbox | Dither |
| 88 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Dither |
| 89 | sidebar-right | Effects | input[checkbox] | #displayShadingToggle | checkbox | Surface Shading |
| 90 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Surface Shading |
| 91 | sidebar-right | Effects | input[checkbox] | #glowToggle | checkbox | Glow |
| 92 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Glow |
| 93 | sidebar-right | Effects | input[checkbox] | #enableLightShift | checkbox | Light Shift |
| 94 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Light Shift |
| 95 | sidebar-right | Effects | input[checkbox] | #enableLighting | checkbox | Light Source |
| 96 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image | Preview Light Source |
| 97 | sidebar-right | Effects | span | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-hea… | button | EFFECTS |
| 98 | sidebar-right | Mutate shader | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Audio |
| 99 | sidebar-right | Mutate shader | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Effects |
| 100 | sidebar-right | Mutate shader | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Sim |
| 101 | sidebar-right | Mutate shader | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Kaleido |
| 102 | sidebar-right | Mutate shader | input[checkbox] | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-lo… | checkbox | Colors |
| 103 | sidebar-right | Mutate shader | button | #mutationReset | button | Reset |
| 104 | sidebar-right | Mutate shader | button | #mutationGenerate | button | Mutate M |
| 105 | sidebar-right | Mutate shader | select | #mutationCount | combobox |  |
| 106 | sidebar-right | Mutate shader | input[range] | #mutationStrength | slider | Strength of mutate, larger creates wider swings… |
| 107 | sidebar-right | Mutate shader | button | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-co… | button | All |
| 108 | sidebar-right | Mutate shader | button | #mutation-section > div.section-body:nth-of-type(2) > div.mutation-co… | button | Basic |
| 109 | sidebar-right | Mutate shader | span | #mutation-section > div.section-header:nth-of-type(1) > span.section-… | button | MUTATE SHADER |
| 110 | sidebar-right | Layers | input[checkbox] | #showPreviewLayersCb | checkbox | Show Preview Layers |
| 111 | sidebar-right | Layers | input[checkbox] | #detachCaptureToggle | checkbox | Detach Capture Area |
| 112 | sidebar-right | Layers | input[checkbox] | #hoverCaptureToggle | checkbox | Enable Capture on Hover |
| 113 | sidebar-right | Layers | button | #pathLayersList > div.path-empty-state > button.path-empty-create | button | + Create Path Layer |
| 114 | sidebar-right | Layers | button | #sidebar-right > div.sidebar-section.section-layers:nth-of-type(5) > … | button | + New Path |
| 115 | sidebar-right | Layers | input[checkbox] | #layersPanel > div.layer-item.layer-item-collapsible:nth-of-type(2) >… | checkbox | Show or hide this layer |
| 116 | sidebar-right | Layers | input[text] | #layersPanel > div.layer-item.layer-item-collapsible:nth-of-type(2) >… | textbox |  |
| 117 | sidebar-right | Layers | button | #addCollisionLayerBtn | button | Collider |
| 118 | sidebar-right | Layers | button | #flattenLayersBtn | button | Flatten |
| 119 | sidebar-right | Layers | button | #captureBtn | button | Visible to layer |
| 120 | sidebar-right | Layers | button | #uploadBtn | button | Import |
| 121 | sidebar-right | Layers | span | #sidebar-right > div.sidebar-section.section-layers:nth-of-type(5) > … | button | LAYERS |
| 122 | sidebar-right | Colors and palettes | button | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-bod… | button | Import |
| 123 | sidebar-right | Colors and palettes | button | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-bod… | button | Export all |
| 124 | sidebar-right | Colors and palettes | button | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-bod… | button | Export this |
| 125 | sidebar-right | Colors and palettes | button | #paletteAddChip | button | + |
| 126 | sidebar-right | Colors and palettes | div | #palettePreview > div.palette-chip-wrap:nth-of-type(1) > div.palette-… | button | #2C5F2D |
| 127 | sidebar-right | Colors and palettes | div | #paletteSelect | combobox | Palette |
| 128 | sidebar-right | Colors and palettes | span | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-hea… | button | COLORS AND PALETTES |
| 129 | sidebar-right | Simulation | input[range] | #mgRelax | slider | RELAXATION 1.00 |
| 130 | sidebar-right | Simulation | input[range] | #mgCoarse | slider | COARSE SOLVE 8 |
| 131 | sidebar-right | Simulation | input[range] | #mgPost | slider | POST-SMOOTH 2 |
| 132 | sidebar-right | Simulation | input[range] | #mgPre | slider | PRE-SMOOTH 2 |
| 133 | sidebar-right | Simulation | input[range] | #mgCycles | slider | V-CYCLES 2 |
| 134 | sidebar-right | Simulation | input[checkbox] | #multigridToggle | checkbox | Multigrid Pressure |
| 135 | sidebar-right | Simulation | input[checkbox] | #macCormackToggle | checkbox | Crisp Advection |
| 136 | sidebar-right | Simulation | input[range] | #grainCleanup | slider | GRAIN CLEANUP 0.75 |
| 137 | sidebar-right | Simulation | input[range] | #wetDrying | slider | DRY TIME 4.5s |
| 138 | sidebar-right | Simulation | input[range] | #wetInfluence | slider | DRYING 0.14 |
| 139 | sidebar-right | Simulation | input[range] | #pressureIteration | slider | PRESSURE ITERATION 25 |
| 140 | sidebar-right | Simulation | input[range] | #pressureDissipation | slider | PRESSURE DISSIPATION 0.950 |
| 141 | sidebar-right | Simulation | select | #fpsCap | combobox | FPS LIMIT |
| 142 | sidebar-right | Simulation | span | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-hea… | button | SIMULATION |
| 143 | sidebar-right | Swirl Together | button | #shareLookBtn | button | Link to current settings |
| 144 | sidebar-right | Swirl Together | button | #phonePadBtn | button | Sync phone |
| 145 | sidebar-right | Swirl Together | button | #joinRoomBtn | button | Join |
| 146 | sidebar-right | Swirl Together | input[text] | #joinRoomInput | textbox | Room code to join |
| 147 | sidebar-right | Swirl Together | button | #strangerBtn | button | Stranger |
| 148 | sidebar-right | Swirl Together | button | #createRoomBtn | button | Start a room |
| 149 | sidebar-right | Swirl Together | span | #sidebar-right > div.sidebar-section:nth-of-type(2) > div.section-hea… | button | SWIRL TOGETHER |
| 150 | main-area |  | button | #main-area > div.lsb-edge:nth-of-type(2) > button.lsb-toggle.btn--icon | button | Left-facing sideways arrows icon: collapses the… |
| 151 | sidebar-left | Stroke and replay | select | #splatOutMode | combobox |  |
| 152 | sidebar-left | Stroke and replay | select | #splatInMode | combobox |  |
| 153 | sidebar-left | Stroke and replay | input[checkbox] | #preserveRandomness | checkbox | Preserve Randomness |
| 154 | sidebar-left | Stroke and replay | input[range] | #replaySpeed | slider | REPLAY SPEED 1× |
| 155 | sidebar-left | Stroke and replay | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Time |
| 156 | sidebar-left | Stroke and replay | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Stroke |
| 157 | sidebar-left | Stroke and replay | input[checkbox] | #strokeLockGuides | checkbox | Show guides |
| 158 | sidebar-left | Stroke and replay | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Set key |
| 159 | sidebar-left | Stroke and replay | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Set key |
| 160 | sidebar-left | Stroke and replay | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Edit the menu |
| 161 | sidebar-left | Stroke and replay | select | #buttonMode_middle | combobox | MIDDLE CLICK (MOUSE 3) |
| 162 | sidebar-left | Stroke and replay | select | #buttonMode_right | combobox | RIGHT CLICK |
| 163 | sidebar-left | Stroke and replay | select | #buttonMode_left | combobox | LEFT CLICK |
| 164 | sidebar-left | Stroke and replay | span | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | STROKE AND REPLAY |
| 165 | sidebar-left | Multi-Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Brush 1 tip: same as the brush |
| 166 | sidebar-left | Multi-Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | checkbox | Pressure |
| 167 | sidebar-left | Multi-Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Palette |
| 168 | sidebar-left | Multi-Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Random |
| 169 | sidebar-left | Multi-Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Custom |
| 170 | sidebar-left | Multi-Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Main |
| 171 | sidebar-left | Multi-Brush | input[color] | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | ColorWell | Arm 1 color |
| 172 | sidebar-left | Multi-Brush | input[range] | #symmetryHold | slider | HOLD SYMMETRY 0.00 |
| 173 | sidebar-left | Multi-Brush | input[checkbox] | #symmetryFaceCenter | checkbox | Stay oriented to the center |
| 174 | sidebar-left | Multi-Brush | input[checkbox] | #symmetrySameAngle | checkbox | Same angle on every arm |
| 175 | sidebar-left | Multi-Brush | select | #symmetryMode | combobox | SYMMETRY |
| 176 | sidebar-left | Multi-Brush | input[range] | #multiplier | slider | Multi-Brush |
| 177 | sidebar-left | Multi-Brush | span | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | MULTI-BRUSH |
| 178 | sidebar-left | Brush | input[range] | #brushJitter | slider | JITTER 0% |
| 179 | sidebar-left | Brush | input[range] | #brushFlow | slider | FLOW 100% |
| 180 | sidebar-left | Brush | input[range] | #brushDabInterval | slider | INTERVAL 4 ms · 250/s |
| 181 | sidebar-left | Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | Constant |
| 182 | sidebar-left | Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | On Move |
| 183 | sidebar-left | Brush | input[range] | #brushAngle | slider | ANGLE 0° |
| 184 | sidebar-left | Brush | button | #brushTipFoldBody > div.brush-shapes-area:nth-of-type(2) > div.brush-… | button | Clipboard |
| 185 | sidebar-left | Brush | button | #brushTipFoldBody > div.brush-shapes-area:nth-of-type(2) > div.brush-… | button | ＋ |
| 186 | sidebar-left | Brush | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ◯ |
| 187 | sidebar-left | Brush | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ▬ |
| 188 | sidebar-left | Brush | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ■ |
| 189 | sidebar-left | Brush | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ⬤ |
| 190 | sidebar-left | Brush | button | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ◌ |
| 191 | sidebar-left | Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | TIP |
| 192 | sidebar-left | Brush | input[range] | #brushGhostOpacity | slider | Brush ghost opacity |
| 193 | sidebar-left | Brush | input[checkbox] | #brushGhostToggle | checkbox | BRUSH GHOST 100% |
| 194 | sidebar-left | Brush | input[checkbox] | #cursorToggle | checkbox | Show Cursor |
| 195 | sidebar-left | Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Collider |
| 196 | sidebar-left | Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Pressure |
| 197 | sidebar-left | Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | radio | Fluid |
| 198 | sidebar-left | Brush | button | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | + New Brush Preset |
| 199 | sidebar-left | Brush | span | #sidebar-left > div.lsb-body:nth-of-type(2) > div.sidebar-section:nth… | button | BRUSH |
| 200 | sidebar-left |  | input[range] | #brushSteady | slider | STABILIZATION 0% |
| 201 | sidebar-left | Brush Size | input[range] | #brushSizePerceptual | slider | Brush Size |
| 202 | mixer-strip |  | button | #freezeBtn | button | Stop |
| 203 | mixer-strip |  | button | #pauseBtn | button | ⏸ |
| 204 | mixer-strip |  | button | #mixer-strip > div.mixer-stack:nth-of-type(12) > div.mixer-actions:nt… | button | Clear |
| 205 | mixer-strip |  | button | #mixerPresetsTrigger | button | Presets ▾ |
| 206 | mixer-strip | Color | div | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Lock Ignite on |
| 207 | mixer-strip | Color | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Ignite |
| 208 | mixer-strip | Color | input[color] | #colorPicker | ColorWell |  |
| 209 | mixer-strip | Color | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Limit  On |
| 210 | mixer-strip | Color | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Palette |
| 211 | mixer-strip | Color | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | Random |
| 212 | mixer-strip | Color | button | #mixer-strip > div.mixer-channel.ch-wide:nth-of-type(10) > div.ch-tog… | button | One |
| 213 | mixer-strip | Velocity | input[range] | #velocityDissipation | slider | Velocity |
| 214 | mixer-strip | Density | input[range] | #densityDissipationPerceptual | slider | Density |
| 215 | mixer-strip | Time | input[range] | #timeScalePerceptual | slider | Time |
| 216 | mixer-strip | Laminar / Blend | input[range] | #colorBlendPerceptual | slider | Laminar / Blend |
| 217 | mixer-strip | Isolation | input[range] | #velocityInfluence | slider | Isolation |
| 218 | mixer-strip | Viscosity | input[range] | #viscosity | slider | Viscosity |
| 219 | mixer-strip | Material Type | input[range] | #curl | slider | Fluid |
| 220 | mixer-strip | Material Type | select | #materialMode | combobox | Material - Changes settings to give a few diffe… |
| 221 | overlay:skipMenu |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Bottom nav |
| 222 | overlay:skipMenu |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Right sidebar |
| 223 | overlay:skipMenu |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Top nav |
| 224 | overlay:skipMenu |  | button | #skipMenu > div.skip-menu-map:nth-of-type(2) > button.skip-menu-optio… | button | Left sidebar |
| 225 |  |  |  | (document: focus left the page) |  |  |
