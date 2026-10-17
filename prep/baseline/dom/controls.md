# DOM dump — every interactive element of the shipping UI

Generated 2026-10-17T19:13:12.625Z by `prep/scripts/dom-dump.js` (F0). Machine copy: `controls.json`; lazily built UI in `lazy-*.json`. Notes and caveats: `NOTES.md`.

## Environment

| Fact | Value |
|---|---|
| date | 2026-10-17T19:13:12.625Z |
| headCommit | fa8701aef64a6a4084c2b7b1c2fe9639dcefd3c3 |
| chrome | Chrome/155.0.8059.80 |
| userAgent | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36 |
| protocol | 1.3 |
| node | v25.9.0 |
| build | web build in headless Chrome (driver window 1600x900, scratch profile) |
| selector | button, input, select, textarea, a[href], [role], [tabindex], [contenteditable], summary, label, .section-title, .mixer-channel, .sidebar-section |
| innerWidth | 1584 |
| innerHeight | 805 |
| dpr | 1 |
| uiScale | 1 |
| url | http://127.0.0.1:56816/index.html |
| layoutChoice | null |
| uiVisibilityState | null |
| hiddenUiKeys | [] |
| titlebarPresent | true |
| titlebarVisible | false |
| bodyClasses | web-mode photosafe-on |
| leftFolded | false |
| rightFolded | false |

## Counts

- controls: **847** (318 with role/name from the CDP accessibility tree, 529 from the page-side fallback)
- sections: **17** (3 left, 14 right); all open for the dump: yes
- visible at boot: 114; hidden at boot: 725; created after boot (by opening): 8
- overlays present in the DOM at boot: 24

### Per surface

| Surface | Controls |
|---|---|
| sidebar-right | 492 |
| sidebar-left | 150 |
| overlay:recDrawer | 55 |
| overlay:.controls | 41 |
| mixer-strip | 35 |
| overlay:.arm-colors-panel | 18 |
| overlay:quality-underbar | 10 |
| canvas-area | 9 |
| overlay:mpInvitePop | 9 |
| overlay:photoWarn | 7 |
| overlay:hotkeyOverlay | 5 |
| overlay:skipMenu | 4 |
| titlebar | 3 |
| overlay:mpRoomMenu | 3 |
| main-area | 2 |
| overlay:deletePaletteModal | 2 |
| overlay:focus-mode-hint | 1 |
| overlay:mixer-more-panel | 1 |

### Per role

| Role | Controls |
|---|---|
| button | 284 |
| LabelText | 239 |
| checkbox | 95 |
| slider | 94 |
| combobox | 36 |
| generic | 28 |
| radio | 10 |
| textbox | 8 |
| image | 8 |
| link | 6 |
| group | 6 |
| spinbutton | 6 |
| ColorWell | 5 |
| status | 3 |
| listbox | 3 |
| dialog | 2 |
| region | 2 |
| radiogroup | 2 |
| switch | 2 |
| heading | 1 |
| alert | 1 |
| img | 1 |
| application | 1 |
| DisclosureTriangle | 1 |
| menu | 1 |
| menuitemcheckbox | 1 |
| menuitem | 1 |

### Per element

| Element | Controls |
|---|---|
| button | 263 |
| label | 239 |
| input[checkbox] | 96 |
| input[range] | 94 |
| div | 53 |
| select | 35 |
| span | 27 |
| input[file] | 8 |
| input[text] | 7 |
| a | 6 |
| input[number] | 6 |
| input[color] | 5 |
| input[radio] | 3 |
| canvas | 2 |
| h1 | 1 |
| textarea | 1 |
| summary | 1 |

### Per section (controls inside each `.sidebar-section` / `.mixer-channel`, the container itself included)

| Surface › section | Controls |
|---|---|
| (none) | 189 |
| mixer-strip › Material Type | 3 |
| mixer-strip › Viscosity | 2 |
| mixer-strip › Isolation | 2 |
| mixer-strip › Laminar / Blend | 3 |
| mixer-strip › Time | 3 |
| mixer-strip › Density | 3 |
| mixer-strip › Velocity | 2 |
| mixer-strip › Color | 12 |
| sidebar-left › Brush Size | 3 |
| sidebar-left › Brush | 45 |
| sidebar-left › Multi-Brush | 20 |
| sidebar-left › Stroke and replay | 73 |
| sidebar-right › Swirl Together | 15 |
| sidebar-right › Simulation | 28 |
| sidebar-right › Colors and palettes | 15 |
| sidebar-right › Layers | 21 |
| sidebar-right › Mutate shader | 25 |
| sidebar-right › Effects | 96 |
| sidebar-right › Animations | 16 |
| sidebar-right › Audio | 18 |
| sidebar-right › Kaleidoscope | 48 |
| sidebar-right › Text | 47 |
| sidebar-right › Focus | 11 |
| sidebar-right › Display | 31 |
| sidebar-right › Export | 24 |
| sidebar-right › Settings | 92 |

## Sections (DOM order, left sidebar first)

| # | Side | Title | data-group | data-ui-key | At boot | aria-expanded at boot | Visibility at boot | How opened | After |
|---|---|---|---|---|---|---|---|---|---|
| 0 | left | Brush | core |  | open | true | visible | already open at boot | open |
| 1 | left | Multi-Brush | core |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 2 | left | Stroke and replay | expressive |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 3 | right | Swirl Together | core |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 4 | right | Simulation | core |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 5 | right | Colors and palettes | core |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 6 | right | Layers | core |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 7 | right | Mutate shader | core |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 8 | right | Effects | expressive |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 9 | right | Animations | expressive |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 10 | right | Audio | expressive |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 11 | right | Kaleidoscope | expressive |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 12 | right | Text | expressive |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 13 | right | Focus | system |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 14 | right | Display | system |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 15 | right | Export | system |  | collapsed | false | visible | trusted Shift-click on .section-title | open |
| 16 | right | Settings | system |  | collapsed | false | visible | trusted Shift-click on .section-title | open |

## Overlays, dialogs and live regions in the DOM at boot

| id | tag | classes | role | aria-modal | aria-live | hidden attr | display | visible at boot | surface | text |
|---|---|---|---|---|---|---|---|---|---|---|
| #photoWarn | div |  | dialog | true |  | hidden | none | no | overlay:photoWarn | ⚠ Photosensitive seizure warning A very… |
|  | p | pw-unprotected |  |  | polite |  | block | no | overlay:photoWarn |  |
|  | div | hk-picker-note |  |  | polite | hidden | none | no | sidebar-left |  |
| #mpError | div | mp-error | alert |  |  |  | none | no | sidebar-right |  |
| #multiplayerStatus | span |  | status |  |  |  | block | no | sidebar-right | Connecting… |
| #mpActivity | div | mp-activity |  |  | polite |  | none | no | sidebar-right |  |
| #paletteNote | div | palette-note | status |  | polite | hidden | none | no | sidebar-right |  |
| #recStripStatus | span | rec-strip-status |  |  | polite |  | block | no | sidebar-right |  |
|  | div | hk-picker-note |  |  | polite | hidden | none | no | sidebar-right |  |
|  | div | hk-picker-note |  |  | polite | hidden | none | no | sidebar-right |  |
| #recDrawer | div | rec-drawer studio-drawer |  |  |  |  | none | no | overlay:recDrawer | Audio ✕ Under constructionCues−+FitFoll… |
| #hotkeyOverlay | div |  |  |  |  |  | none | no | overlay:hotkeyOverlay | Hotkeys × Simulation Space: Freeze / Un… |
|  | div | hotkey-modal |  |  |  |  | block | no | overlay:hotkeyOverlay | Hotkeys × Simulation Space: Freeze / Un… |
| #deletePaletteModal | div | delete-modal |  |  |  |  | none | no | overlay:deletePaletteModal | Delete Palette? Are you sure you want t… |
|  | div | delete-modal-content |  |  |  |  | block | no | overlay:deletePaletteModal | Delete Palette? Are you sure you want t… |
|  | div | delete-modal-title |  |  |  |  | block | no | overlay:deletePaletteModal | Delete Palette? |
| #deleteModalMessage | div | delete-modal-message |  |  |  |  | block | no | overlay:deletePaletteModal | Are you sure you want to delete this pa… |
|  | div | delete-modal-actions |  |  |  |  | flex | no | overlay:deletePaletteModal | Cancel Delete |
|  | button | delete-modal-cancel |  |  |  |  | block | no | overlay:deletePaletteModal | Cancel |
|  | button | delete-modal-confirm btn--destructive |  |  |  |  | block | no | overlay:deletePaletteModal | Delete |
| #focus-mode-hint | div |  | status |  |  |  | none | no | overlay:focus-mode-hint | Press F or Esc to leave Focus |
| #mixer-more-panel | div | arm-colors-panel mixer-more-panel | group |  |  |  | none | no | overlay:mixer-more-panel | Faders the bar can’t fit at this width.… |
| #mpInvitePop | div | brush-shape-menu mp-pop | dialog |  |  | hidden | none | no | overlay:mpInvitePop | Room code Code QR Hide ------ Send a fr… |
| #mpRoomMenu | div | brush-shape-menu mp-pop mp-room-menu | menu |  |  | hidden | none | no | overlay:mpRoomMenu | Lock room Copy room report |

## Lazily built UI (one file each)

| Name | File | Opened | How | Root | Controls in root | New elements outside root | Closed | Root after close |
|---|---|---|---|---|---|---|---|---|
| radial-menu | lazy-radial-menu.json | yes | pointer over the canvas centre, tap E | #radialMenu | 10 | 0 | yes | stays (hidden) |
| colour-picker | lazy-colour-picker.json | yes | trusted click on the top bar colour well #colorPicker | .cp-pop | 18 | 0 | yes | removed |
| presets-popup | lazy-presets-popup.json | yes | trusted click on #mixerPresetsTrigger | .mixer-presets-panel | 18 | 0 | yes | stays (hidden) |
| arm-tip-menu | lazy-arm-tip-menu.json | yes | trusted click on the first .arm-tip-btn in the Multi-Brush section | .arm-tip-menu | 7 | 0 | yes | removed |

## All controls (document order)

Columns: order; surface; section; element (tag[type]); id; classes (first three); role; name (source: c = CDP AX tree, f = page fallback); aria-* (k=v); value / checked; tabindex; visible at boot (Y/N, – = created later).

| # | Surface | Section | Element | id | Classes | Role | Name | aria-* | Value | tabindex | Boot |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | overlay:skipMenu |  | button |  | skip-menu-option skip-menu-left | button | Left sidebar (c) |  |  |  | Y |
| 1 | overlay:skipMenu |  | button |  | skip-menu-option skip-menu-top | button | Top nav (c) |  |  |  | Y |
| 2 | overlay:skipMenu |  | button |  | skip-menu-option skip-menu-right | button | Right sidebar (c) |  |  |  | Y |
| 3 | overlay:skipMenu |  | button |  | skip-menu-option skip-menu-bottom | button | Bottom nav (c) |  |  |  | Y |
| 4 | overlay:photoWarn |  | div | #photoWarn |  | dialog | ⚠ Photosensitive seizure warning (f) | modal=true labelledby=pwTitle describedby=pwDesc |  |  | N |
| 5 | overlay:photoWarn |  | h1 | #pwTitle |  | heading | ⚠ Photosensitive seizure warning (f) |  |  | -1 | N |
| 6 | overlay:photoWarn |  | label |  | pw-check | LabelText | Reduce flashing and rapid brightness ch… (f) |  |  |  | N |
| 7 | overlay:photoWarn |  | input[checkbox] | #pwProtect |  | checkbox | Reduce flashing and rapid brightness ch… (f) |  | checked |  | N |
| 8 | overlay:photoWarn |  | a | #pwLearn |  | link | Learn more about photosensitivity (Epil… (f) |  |  |  | N |
| 9 | overlay:photoWarn |  | button | #pwExit |  | button | Exit App (f) |  |  |  | N |
| 10 | overlay:photoWarn |  | button | #pwContinue |  | button | Continue with protection on (f) |  |  |  | N |
| 11 | titlebar |  | button | #min-button | titlebar-button | button | Minimize (f) |  |  |  | N |
| 12 | titlebar |  | button | #max-button | titlebar-button | button | Maximize (f) |  |  |  | N |
| 13 | titlebar |  | button | #close-button | titlebar-button close | button | Close (f) |  |  |  | N |
| 14 | mixer-strip | Material Type | div |  | mixer-channel ch-material | generic |  (c) |  |  |  | Y |
| 15 | mixer-strip | Material Type | select | #materialMode | material-mode-select | combobox | Material - Changes settings to give a f… (c) |  | fluid |  | Y |
| 16 | mixer-strip | Material Type | input[range] | #curl |  | slider | Fluid (c) | label=Fluid valuetext=0 | 0 |  | Y |
| 17 | mixer-strip | Viscosity | div |  | mixer-channel | generic |  (c) |  |  |  | Y |
| 18 | mixer-strip | Viscosity | input[range] | #viscosity |  | slider | Viscosity (c) | label=Viscosity valuetext=0.30 | 0.3 |  | Y |
| 19 | mixer-strip | Isolation | div |  | mixer-channel | generic |  (c) |  |  |  | Y |
| 20 | mixer-strip | Isolation | input[range] | #velocityInfluence |  | slider | Isolation (c) | label=Isolation valuetext=2.000 | 2 |  | Y |
| 21 | mixer-strip | Laminar / Blend | div |  | mixer-channel wc-has-tele | generic |  (c) |  |  |  | Y |
| 22 | mixer-strip | Laminar / Blend | input[range] | #colorBlend |  | slider | Laminar / Blend (f) |  | 0 |  | N |
| 23 | mixer-strip | Laminar / Blend | input[range] | #colorBlendPerceptual | ch-perceptual | slider | Laminar / Blend (c) | label=Laminar / Blend valuetext=0.00 | 0.5 |  | Y |
| 24 | mixer-strip | Time | div |  | mixer-channel wc-has-tele | generic |  (c) |  |  |  | Y |
| 25 | mixer-strip | Time | input[range] | #timeScale |  | slider | ⏱️ Time (f) |  | 1 |  | N |
| 26 | mixer-strip | Time | input[range] | #timeScalePerceptual | ch-perceptual | slider | Time (c) | label=Time valuetext=1.00x | 0.7 |  | Y |
| 27 | mixer-strip | Density | div |  | mixer-channel | generic |  (c) |  |  |  | Y |
| 28 | mixer-strip | Density | input[range] | #densityDissipation |  | slider | Density Sustain (f) |  | 0.99 |  | N |
| 29 | mixer-strip | Density | input[range] | #densityDissipationPerceptual | ch-perceptual | slider | Density (c) | label=Density valuetext=0.9900 | 0.313 |  | Y |
| 30 | mixer-strip | Velocity | div |  | mixer-channel | generic |  (c) |  |  |  | Y |
| 31 | mixer-strip | Velocity | input[range] | #velocityDissipation |  | slider | Velocity (c) | label=Velocity valuetext=1.0009 | 1.0009 |  | Y |
| 32 | mixer-strip |  | button | #mixerMoreBtn | mixer-more-btn btn--sm | button | More▾ (f) | haspopup=true expanded=false controls=mixer-more-panel |  |  | N |
| 33 | mixer-strip | Color | div |  | mixer-channel ch-wide | generic |  (c) |  |  |  | Y |
| 34 | mixer-strip | Color | input[checkbox] | #randomColor |  | checkbox | Random Colors (f) | hidden=true | checked | -1 | Y |
| 35 | mixer-strip | Color | input[checkbox] | #stepPalette |  | checkbox | Palette mode (new colour each stroke) (f) | hidden=true | unchecked | -1 | Y |
| 36 | mixer-strip | Color | input[checkbox] | #colorGate |  | checkbox | Limit (f) | hidden=true | checked | -1 | Y |
| 37 | mixer-strip | Color | div |  | ch-seg-switch | group | Color of each stroke (c) | label=Color of each stroke |  |  | Y |
| 38 | mixer-strip | Color | button |  | ch-text-toggle | button | ONE (c) | pressed=false |  |  | Y |
| 39 | mixer-strip | Color | button |  | ch-text-toggle active | button | RANDOM (c) | pressed=true |  |  | Y |
| 40 | mixer-strip | Color | button |  | ch-text-toggle | button | PALETTE (c) | pressed=false |  |  | Y |
| 41 | mixer-strip | Color | button |  | ch-text-toggle ch-gate-toggle | button | LIMIT (c) | pressed=true |  |  | Y |
| 42 | mixer-strip | Color | input[color] | #colorPicker | ch-color-input | ColorWell |  (c) |  | #ff0000 |  | Y |
| 43 | mixer-strip | Color | button |  | ch-text-toggle ch-nudge-btn | button | IGNITE (c) |  |  |  | Y |
| 44 | mixer-strip | Color | div |  | ch-ignite-lock btn btn--icon | button | Lock Ignite on (c) | label=Lock Ignite on pressed=false |  | 0 | Y |
| 45 | mixer-strip |  | button | #mixerPresetsTrigger | mixer-presets-trigger | button | PRESETS (c) | haspopup=true expanded=false |  |  | Y |
| 46 | mixer-strip |  | button |  | btn--destructive | button | CLEAR (c) |  |  |  | Y |
| 47 | mixer-strip |  | button | #pauseBtn |  | button | ⏸ (c) | pressed=false |  |  | Y |
| 48 | mixer-strip |  | button | #freezeBtn |  | button | STOP (c) | pressed=false |  |  | Y |
| 49 | sidebar-left |  | div | #sidebar-left |  | region | Brush (c) | label=Brush |  |  | Y |
| 50 | sidebar-left | Brush Size | div |  | mixer-channel | generic |  (c) |  |  |  | Y |
| 51 | sidebar-left | Brush Size | input[range] | #brushSize |  | slider | Brush Size (f) |  | 1 |  | N |
| 52 | sidebar-left | Brush Size | input[range] | #brushSizePerceptual | ch-perceptual | slider | Brush Size (c) | label=Brush Size valuetext=31 px | 0.653 |  | Y |
| 53 | sidebar-left |  | label |  |  | LabelText |  (c) |  |  |  | Y |
| 54 | sidebar-left |  | input[range] | #brushSteady |  | slider | STABILIZATION 0% (c) |  | 0 |  | Y |
| 55 | sidebar-left |  | input[checkbox] | #brushSteadyHideGuide |  | checkbox | Hide guide (f) |  | unchecked |  | N |
| 56 | sidebar-left |  | label |  |  | LabelText | Hide guide (f) |  |  |  | N |
| 57 | sidebar-left | Brush | div |  | sidebar-section | generic | Brush (f) |  |  |  | Y |
| 58 | sidebar-left | Brush | span |  | section-title | button | BRUSH (c) | expanded=true |  | 0 | Y |
| 59 | sidebar-left | Brush | label |  | brush-section-label | LabelText |  (c) |  |  |  | Y |
| 60 | sidebar-left | Brush | input[text] |  | mixer-preset-name-input | textbox | Brush name... (f) |  |  |  | N |
| 61 | sidebar-left | Brush | button |  | mixer-preset-save | button | + NEW BRUSH PRESET (c) |  |  |  | Y |
| 62 | sidebar-left | Brush | label |  | brush-section-label | LabelText | ~ steps between Fluid, Pressure and Col… (c) |  |  |  | Y |
| 63 | sidebar-left | Brush | div |  | brush-mode-row brush-radio-row | radiogroup | Paint Type (Fluid / Pressure / Collider) (c) | label=Paint Type (Fluid / Pre… |  |  | Y |
| 64 | sidebar-left | Brush | button |  | brush-mode-btn active | radio | FLUID (c) | checked=true |  |  | Y |
| 65 | sidebar-left | Brush | button |  | brush-mode-btn | radio | PRESSURE (c) | checked=false |  |  | Y |
| 66 | sidebar-left | Brush | button |  | brush-mode-btn | radio | COLLIDER (c) | checked=false |  |  | Y |
| 67 | sidebar-left | Brush | button |  | brush-mode-btn active | button | Smudge (f) |  |  |  | N |
| 68 | sidebar-left | Brush | button |  | brush-mode-btn | button | Spread (f) |  |  |  | N |
| 69 | sidebar-left | Brush | button |  | brush-mode-btn | button | Gather (f) |  |  |  | N |
| 70 | sidebar-left | Brush | button |  | brush-mode-btn | button | Swirl (f) |  |  |  | N |
| 71 | sidebar-left | Brush | label |  |  | LabelText | Strength 1.00× (f) |  |  |  | N |
| 72 | sidebar-left | Brush | input[range] | #brushVelStrength |  | slider | Strength 1.00× (f) |  | 1 disabled |  | N |
| 73 | sidebar-left | Brush | input[checkbox] | #cursorToggle |  | checkbox | SHOW CURSOR (c) |  | checked |  | Y |
| 74 | sidebar-left | Brush | label |  |  | LabelText | Show Cursor (f) |  |  |  | Y |
| 75 | sidebar-left | Brush | label |  | brush-ghost-head | LabelText |  (c) |  |  |  | Y |
| 76 | sidebar-left | Brush | input[checkbox] | #brushGhostToggle |  | checkbox | BRUSH GHOST 100% (c) |  | checked |  | Y |
| 77 | sidebar-left | Brush | input[range] | #brushGhostOpacity |  | slider | Brush ghost opacity (c) | label=Brush ghost opacity | 100 |  | Y |
| 78 | sidebar-left | Brush | button |  | brush-fold-head btn--ghost | button | TIP (c) | controls=brushTipFoldBody expanded=true |  |  | Y |
| 79 | sidebar-left | Brush | button |  | brush-tip-btn active | button | ◌ (c) |  |  |  | Y |
| 80 | sidebar-left | Brush | button |  | brush-tip-btn | button | ⬤ (c) |  |  |  | Y |
| 81 | sidebar-left | Brush | button |  | brush-tip-btn | button | ■ (c) |  |  |  | Y |
| 82 | sidebar-left | Brush | button |  | brush-tip-btn | button | ▬ (c) |  |  |  | Y |
| 83 | sidebar-left | Brush | button |  | brush-tip-btn | button | ◯ (c) |  |  |  | Y |
| 84 | sidebar-left | Brush | button |  | brush-tip-btn brush-shape-add | button | ＋ (c) |  |  |  | Y |
| 85 | sidebar-left | Brush | button |  | brush-tip-btn brush-shape-paste | button | Clipboard (c) |  |  |  | Y |
| 86 | sidebar-left | Brush | input[file] |  |  | button |  (f) |  |  |  | N |
| 87 | sidebar-left | Brush | label |  |  | LabelText |  (c) |  |  |  | Y |
| 88 | sidebar-left | Brush | input[range] | #brushTipTexture |  | slider | TEXTURE 100% (c) |  | 1 disabled |  | Y |
| 89 | sidebar-left | Brush | label |  |  | LabelText |  (c) |  |  |  | Y |
| 90 | sidebar-left | Brush | input[range] | #brushAngle |  | slider | ANGLE 0° (c) |  | 0 |  | Y |
| 91 | sidebar-left | Brush | label |  | brush-section-label | LabelText |  (c) |  |  |  | Y |
| 92 | sidebar-left | Brush | button |  | brush-mode-btn | button | ON MOVE (c) |  |  |  | Y |
| 93 | sidebar-left | Brush | button |  | brush-mode-btn active | button | CONSTANT (c) |  |  |  | Y |
| 94 | sidebar-left | Brush | label |  |  | LabelText | Spacing 1.0% (f) |  |  |  | N |
| 95 | sidebar-left | Brush | input[range] | #brushSpacing |  | slider | Spacing 1.0% (f) |  | 0.01 |  | N |
| 96 | sidebar-left | Brush | label |  |  | LabelText |  (c) |  |  |  | Y |
| 97 | sidebar-left | Brush | input[range] | #brushDabInterval |  | slider | INTERVAL 4 ms · 250/s (c) |  | 4 |  | Y |
| 98 | sidebar-left | Brush | label |  |  | LabelText |  (c) |  |  |  | Y |
| 99 | sidebar-left | Brush | input[range] | #brushFlow |  | slider | FLOW 100% (c) |  | 1 |  | Y |
| 100 | sidebar-left | Brush | label |  |  | LabelText |  (c) |  |  |  | Y |
| 101 | sidebar-left | Brush | input[range] | #brushJitter |  | slider | JITTER 0% (c) |  | 0 |  | Y |
| 102 | sidebar-left | Multi-Brush | div |  | sidebar-section | generic | Multi-Brush (f) |  |  |  | Y |
| 103 | sidebar-left | Multi-Brush | span |  | section-title | button | MULTI-BRUSH (c) | expanded=true |  | 0 | Y |
| 104 | sidebar-left | Multi-Brush | div |  | mixer-channel | generic |  (c) |  |  |  | N |
| 105 | sidebar-left | Multi-Brush | input[range] | #multiplier |  | slider | Multi-Brush (c) | label=Multi-Brush valuetext=1x | 1 |  | N |
| 106 | sidebar-left | Multi-Brush | label |  |  | LabelText |  (c) |  |  |  | N |
| 107 | sidebar-left | Multi-Brush | select | #symmetryMode |  | combobox | SYMMETRY (c) |  | radial |  | N |
| 108 | sidebar-left | Multi-Brush | input[checkbox] | #symmetrySameAngle |  | checkbox | SAME ANGLE ON EVERY ARM (c) |  | unchecked |  | N |
| 109 | sidebar-left | Multi-Brush | label |  |  | LabelText | Same angle on every arm (f) |  |  |  | N |
| 110 | sidebar-left | Multi-Brush | input[checkbox] | #symmetryFaceCenter |  | checkbox | STAY ORIENTED TO THE CENTER (c) |  | unchecked |  | N |
| 111 | sidebar-left | Multi-Brush | label |  |  | LabelText | Stay oriented to the center (f) |  |  |  | N |
| 112 | sidebar-left | Multi-Brush | label |  |  | LabelText | Strength of symmetry assist force near … (c) |  |  |  | N |
| 113 | sidebar-left | Multi-Brush | input[range] | #symmetryHold |  | slider | HOLD SYMMETRY 0.00 (c) |  | 0 |  | N |
| 114 | sidebar-left | Multi-Brush | input[color] |  | arm-picker | ColorWell | Arm 1 color (c) | label=Arm 1 color | #ff0000 |  | – |
| 115 | sidebar-left | Multi-Brush | div |  | brush-radio-row arm-mode-wrap | radiogroup | Arm 1 color (c) | label=Arm 1 color |  |  | – |
| 116 | sidebar-left | Multi-Brush | button |  | brush-mode-btn arm-mode-btn | radio | MAIN (c) | checked=false |  |  | – |
| 117 | sidebar-left | Multi-Brush | button |  | brush-mode-btn arm-mode-btn | radio | CUSTOM (c) | checked=false |  |  | – |
| 118 | sidebar-left | Multi-Brush | button |  | brush-mode-btn arm-mode-btn active | radio | RANDOM (c) | checked=true |  |  | – |
| 119 | sidebar-left | Multi-Brush | button |  | brush-mode-btn arm-mode-btn | radio | PALETTE (c) | checked=false |  |  | – |
| 120 | sidebar-left | Multi-Brush | button |  | arm-push-btn | checkbox | PRESSURE (c) | checked=false |  |  | – |
| 121 | sidebar-left | Multi-Brush | button |  | arm-tip-btn | button | Brush 1 tip: same as the brush (c) | haspopup=menu label=Brush 1 tip: same as th… |  |  | – |
| 122 | sidebar-left | Stroke and replay | div |  | sidebar-section | generic | Stroke and replay (f) |  |  |  | Y |
| 123 | sidebar-left | Stroke and replay | span |  | section-title | button | STROKE AND REPLAY (c) | expanded=true |  | 0 | Y |
| 124 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText | Controls for left mouse, right mouse, a… (c) |  |  |  | N |
| 125 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText | normal brush with settings from the bru… (c) |  |  |  | N |
| 126 | sidebar-left | Stroke and replay | select | #buttonMode_left |  | combobox | LEFT CLICK (c) |  | paint |  | N |
| 127 | sidebar-left | Stroke and replay | button |  | brush-mode-btn active | button | ↔ (f) |  |  |  | N |
| 128 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | ↕ (f) |  |  |  | N |
| 129 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | ✛ (f) |  |  |  | N |
| 130 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ◌ (f) |  |  |  | N |
| 131 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ⬤ (f) |  |  |  | N |
| 132 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ■ (f) |  |  |  | N |
| 133 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ▬ (f) |  |  |  | N |
| 134 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ◯ (f) |  |  |  | N |
| 135 | sidebar-left | Stroke and replay | input[checkbox] | #altSizeOn_left |  | checkbox | Own size (f) |  | unchecked |  | N |
| 136 | sidebar-left | Stroke and replay | label |  |  | LabelText | Own size (f) |  |  |  | N |
| 137 | sidebar-left | Stroke and replay | input[range] |  |  | slider |  (f) |  | 11 |  | N |
| 138 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Copy brush (f) |  |  |  | N |
| 139 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Tip only (f) |  |  |  | N |
| 140 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Edit the menu (f) |  |  |  | N |
| 141 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText | Trigger replay with settings from the R… (c) |  |  |  | N |
| 142 | sidebar-left | Stroke and replay | select | #buttonMode_right |  | combobox | RIGHT CLICK (c) |  | replay |  | N |
| 143 | sidebar-left | Stroke and replay | button |  | brush-mode-btn active | button | ↔ (f) |  |  |  | N |
| 144 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | ↕ (f) |  |  |  | N |
| 145 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | ✛ (f) |  |  |  | N |
| 146 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ◌ (f) |  |  |  | N |
| 147 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ⬤ (f) |  |  |  | N |
| 148 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ■ (f) |  |  |  | N |
| 149 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ▬ (f) |  |  |  | N |
| 150 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ◯ (f) |  |  |  | N |
| 151 | sidebar-left | Stroke and replay | input[checkbox] | #altSizeOn_right |  | checkbox | Own size (f) |  | unchecked |  | N |
| 152 | sidebar-left | Stroke and replay | label |  |  | LabelText | Own size (f) |  |  |  | N |
| 153 | sidebar-left | Stroke and replay | input[range] |  |  | slider |  (f) |  | 11 |  | N |
| 154 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Copy brush (f) |  |  |  | N |
| 155 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Tip only (f) |  |  |  | N |
| 156 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Edit the menu (f) |  |  |  | N |
| 157 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText | Opens the radial menu at the pointer (c) |  |  |  | N |
| 158 | sidebar-left | Stroke and replay | select | #buttonMode_middle |  | combobox | MIDDLE CLICK (MOUSE 3) (c) |  | radial |  | N |
| 159 | sidebar-left | Stroke and replay | button |  | brush-mode-btn active | button | ↔ (f) |  |  |  | N |
| 160 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | ↕ (f) |  |  |  | N |
| 161 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | ✛ (f) |  |  |  | N |
| 162 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ◌ (f) |  |  |  | N |
| 163 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ⬤ (f) |  |  |  | N |
| 164 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ■ (f) |  |  |  | N |
| 165 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ▬ (f) |  |  |  | N |
| 166 | sidebar-left | Stroke and replay | button |  | brush-tip-btn | button | ◯ (f) |  |  |  | N |
| 167 | sidebar-left | Stroke and replay | input[checkbox] | #altSizeOn_middle |  | checkbox | Own size (f) |  | unchecked |  | N |
| 168 | sidebar-left | Stroke and replay | label |  |  | LabelText | Own size (f) |  |  |  | N |
| 169 | sidebar-left | Stroke and replay | input[range] |  |  | slider |  (f) |  | 11 |  | N |
| 170 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Copy brush (f) |  |  |  | N |
| 171 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | Tip only (f) |  |  |  | N |
| 172 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | EDIT THE MENU (c) |  |  |  | N |
| 173 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText | Allows locking to the brush's current r… (c) |  |  |  | N |
| 174 | sidebar-left | Stroke and replay | button |  | hk-picker-key | button | SET KEY (c) | pressed=false |  |  | N |
| 175 | sidebar-left | Stroke and replay | button |  | hk-picker-clear btn--ghost | button | Remove this hotkey (f) | label=Remove this hotkey |  |  | N |
| 176 | sidebar-left | Stroke and replay | button |  | hk-picker-key | button | SET KEY (c) | pressed=false |  |  | N |
| 177 | sidebar-left | Stroke and replay | button |  | hk-picker-clear btn--ghost | button | Remove this hotkey (f) | label=Remove this hotkey |  |  | N |
| 178 | sidebar-left | Stroke and replay | input[checkbox] | #strokeLockGuides |  | checkbox | SHOW GUIDES (c) |  | unchecked |  | N |
| 179 | sidebar-left | Stroke and replay | label |  |  | LabelText | Shows the guide-lines for the angle / r… (c) |  |  |  | N |
| 180 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 181 | sidebar-left | Stroke and replay | button |  | brush-mode-btn active | button | STROKE (c) |  |  |  | N |
| 182 | sidebar-left | Stroke and replay | button |  | brush-mode-btn | button | TIME (c) |  |  |  | N |
| 183 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText | Replay Period (f) |  |  |  | N |
| 184 | sidebar-left | Stroke and replay | input[number] | #replayTimePeriod |  | spinbutton |  (f) |  | 2 |  | N |
| 185 | sidebar-left | Stroke and replay | label |  |  | LabelText |  (c) |  |  |  | N |
| 186 | sidebar-left | Stroke and replay | input[range] | #replaySpeed |  | slider | REPLAY SPEED 1× (c) |  | 1.25 |  | N |
| 187 | sidebar-left | Stroke and replay | input[checkbox] | #preserveRandomness |  | checkbox | PRESERVE RANDOMNESS (c) |  | unchecked |  | N |
| 188 | sidebar-left | Stroke and replay | label |  |  | LabelText | Recorded strokes stay random, unchecked… (c) |  |  |  | N |
| 189 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 190 | sidebar-left | Stroke and replay | select | #splatInMode |  | combobox |  (c) |  | instant |  | N |
| 191 | sidebar-left | Stroke and replay | input[range] | #splatInDist |  | slider |  (f) |  | 0.15 disabled |  | N |
| 192 | sidebar-left | Stroke and replay | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 193 | sidebar-left | Stroke and replay | select | #splatOutMode |  | combobox |  (c) |  | instant |  | N |
| 194 | sidebar-left | Stroke and replay | input[range] | #splatOutDist |  | slider |  (f) |  | 0.15 disabled |  | N |
| 195 | sidebar-left |  | button |  | lsb-rail-label btn--ghost | button | Brush (f) |  |  |  | N |
| 196 | sidebar-left |  | button |  | lsb-rail-label lsb-rail-section btn--gh… | button | Brush (f) |  |  |  | N |
| 197 | sidebar-left |  | button |  | lsb-rail-label lsb-rail-section btn--gh… | button | Multi-Brush (f) |  |  |  | N |
| 198 | sidebar-left |  | button |  | lsb-rail-label lsb-rail-section btn--gh… | button | Stroke and replay (f) |  |  |  | N |
| 199 | main-area |  | button |  | lsb-toggle btn--icon | button | Left-facing sideways arrows icon: colla… (c) | label=Left-facing sideways ar… expanded=true |  |  | Y |
| 200 | canvas-area |  | button | #statsCloseBtn | stats-close-btn | button | ✕ (f) |  |  |  | N |
| 201 | canvas-area |  | label |  | stat-label | LabelText | Adaptive Quality: (f) |  |  |  | N |
| 202 | canvas-area |  | input[checkbox] | #governorToggle |  | checkbox | Adaptive Quality: (f) |  | checked |  | N |
| 203 | canvas-area |  | label |  | stat-label | LabelText | Resolution Tiers: (f) |  |  |  | N |
| 204 | canvas-area |  | input[checkbox] | #governorAllowRes |  | checkbox | Resolution Tiers: (f) |  | checked |  | N |
| 205 | canvas-area |  | label |  | stat-label | LabelText | Effect Shedding: (f) |  |  |  | N |
| 206 | canvas-area |  | input[checkbox] | #governorAllowFx |  | checkbox | Effect Shedding: (f) |  | unchecked |  | N |
| 207 | canvas-area |  | label |  | stat-label | LabelText | Release VRAM When Hidden: (f) |  |  |  | N |
| 208 | canvas-area |  | input[checkbox] | #idleVramToggle |  | checkbox | Release VRAM When Hidden: (f) |  | unchecked |  | N |
| 209 | main-area |  | button |  | rsb-toggle btn--icon | button | Right Facing sideways arrows icon: coll… (f) | label=Right Facing sideways a… expanded=true |  |  | N |
| 210 | sidebar-right |  | div | #sidebar-right |  | region | Sections (c) | label=Sections |  |  | Y |
| 211 | sidebar-right |  | button |  | rsb-rail-label btn--ghost | button | Controls (f) |  |  |  | N |
| 212 | sidebar-right |  | button |  | rsb-rail-label btn--ghost rsb-rail-sect… | button | Color (f) |  |  |  | N |
| 213 | sidebar-right |  | button |  | rsb-rail-label btn--ghost rsb-rail-sect… | button | Presets (f) |  |  |  | N |
| 214 | sidebar-right |  | button |  | rsb-rail-label btn--ghost rsb-rail-sect… | button | Together (f) |  |  |  | N |
| 215 | sidebar-right | Swirl Together | div |  | sidebar-section | generic | Swirl Together (f) |  |  |  | Y |
| 216 | sidebar-right | Swirl Together | span |  | section-title | button | SWIRL TOGETHER (c) | expanded=true |  | 0 | Y |
| 217 | sidebar-right | Swirl Together | button | #createRoomBtn | mp-btn-primary btn--emphasis | button | START A ROOM (c) |  |  |  | N |
| 218 | sidebar-right | Swirl Together | button | #strangerBtn | mp-btn-primary btn--emphasis | button | STRANGER (c) |  |  |  | N |
| 219 | sidebar-right | Swirl Together | input[text] | #joinRoomInput |  | textbox | Room code to join (c) | label=Room code to join |  |  | N |
| 220 | sidebar-right | Swirl Together | button | #joinRoomBtn |  | button | JOIN (c) |  |  |  | N |
| 221 | sidebar-right | Swirl Together | button | #phonePadBtn | mp-btn-phone-door | button | SYNC PHONE (c) |  |  |  | N |
| 222 | sidebar-right | Swirl Together | button | #shareLookBtn | mp-btn-share-look | button | LINK TO CURRENT SETTINGS (c) |  |  |  | N |
| 223 | sidebar-right | Swirl Together | div | #mpError | mp-error | alert |  (f) |  |  |  | N |
| 224 | sidebar-right | Swirl Together | button | #reconnectBtn |  | button | Reconnect (f) |  |  |  | N |
| 225 | sidebar-right | Swirl Together | span | #multiplayerStatus |  | status | Connecting… (f) |  |  |  | N |
| 226 | sidebar-right | Swirl Together | button | #mpInviteBtn | mp-room-invite | button | Invite ▾ (f) | haspopup=dialog expanded=false controls=mpInvitePop |  |  | N |
| 227 | sidebar-right | Swirl Together | button | #mpMenuBtn | btn--icon mp-room-more | button | Room options (f) | haspopup=menu expanded=false controls=mpRoomMenu label=Room… |  |  | N |
| 228 | sidebar-right | Swirl Together | button | #disconnectBtn | mp-btn-leave | button | Leave (f) |  |  |  | N |
| 229 | sidebar-right | Swirl Together | input[checkbox] | #multiplayerToggle |  | checkbox |  (f) |  | unchecked |  | N |
| 230 | sidebar-right | Simulation | div |  | sidebar-section | generic | Simulation (f) |  |  |  | Y |
| 231 | sidebar-right | Simulation | span |  | section-title | button | SIMULATION (c) | expanded=true |  | 0 | Y |
| 232 | sidebar-right | Simulation | label |  |  | LabelText |  (c) |  |  |  | N |
| 233 | sidebar-right | Simulation | select | #fpsCap |  | combobox | FPS LIMIT (c) |  | 72 |  | N |
| 234 | sidebar-right | Simulation | label |  |  | LabelText |  (c) |  |  |  | N |
| 235 | sidebar-right | Simulation | input[range] | #pressureDissipation |  | slider | PRESSURE DISSIPATION 0.950 (c) |  | 0.95 |  | N |
| 236 | sidebar-right | Simulation | label |  |  | LabelText |  (c) |  |  |  | N |
| 237 | sidebar-right | Simulation | input[range] | #pressureIteration |  | slider | PRESSURE ITERATION 25 (c) |  | 25 |  | N |
| 238 | sidebar-right | Simulation | label |  |  | LabelText | 0 = off (pure fluidity). Higher = more … (c) |  |  |  | N |
| 239 | sidebar-right | Simulation | input[range] | #wetInfluence |  | slider | DRYING 0.14 (c) |  | 0.14 |  | N |
| 240 | sidebar-right | Simulation | label |  |  | LabelText | Drying time in seconds for wet paint to… (c) |  |  |  | N |
| 241 | sidebar-right | Simulation | input[range] | #wetDrying |  | slider | DRY TIME 4.5s (c) |  | 4.5 |  | N |
| 242 | sidebar-right | Simulation | label |  |  | LabelText | Smooths the finest grain out of paint w… (c) |  |  |  | N |
| 243 | sidebar-right | Simulation | input[range] | #grainCleanup |  | slider | GRAIN CLEANUP 0.75 (c) |  | 0.75 |  | N |
| 244 | sidebar-right | Simulation | input[checkbox] | #macCormackToggle |  | checkbox | CRISP ADVECTION (c) |  | checked |  | N |
| 245 | sidebar-right | Simulation | label |  |  | LabelText | Adds MacCormack passes to Pavel's origi… (c) |  |  |  | N |
| 246 | sidebar-right | Simulation | input[checkbox] | #multigridToggle |  | checkbox | MULTIGRID PRESSURE (c) |  | checked |  | N |
| 247 | sidebar-right | Simulation | label |  |  | LabelText | Adds options to fiddle with Pavel's ori… (c) |  |  |  | N |
| 248 | sidebar-right | Simulation | label |  |  | LabelText | Allows you to set how many down and bac… (c) |  |  |  | N |
| 249 | sidebar-right | Simulation | input[range] | #mgCycles |  | slider | V-CYCLES 2 (c) |  | 2 |  | N |
| 250 | sidebar-right | Simulation | label |  |  | LabelText | Smoother sweeps before pushing the resi… (c) |  |  |  | N |
| 251 | sidebar-right | Simulation | input[range] | #mgPre |  | slider | PRE-SMOOTH 2 (c) |  | 2 |  | N |
| 252 | sidebar-right | Simulation | label |  |  | LabelText | Smoother sweeps after the coarse correc… (c) |  |  |  | N |
| 253 | sidebar-right | Simulation | input[range] | #mgPost |  | slider | POST-SMOOTH 2 (c) |  | 2 |  | N |
| 254 | sidebar-right | Simulation | label |  |  | LabelText | Jacobi sweeps standing in for an exact … (c) |  |  |  | N |
| 255 | sidebar-right | Simulation | input[range] | #mgCoarse |  | slider | COARSE SOLVE 8 (c) |  | 8 |  | N |
| 256 | sidebar-right | Simulation | label |  |  | LabelText | How much of each sweep’s change to keep… (c) |  |  |  | N |
| 257 | sidebar-right | Simulation | input[range] | #mgRelax |  | slider | RELAXATION 1.00 (c) |  | 1 |  | N |
| 258 | sidebar-right | Colors and palettes | div |  | sidebar-section | generic | Colors and palettes (f) |  |  |  | Y |
| 259 | sidebar-right | Colors and palettes | span |  | section-title | button | COLORS AND PALETTES (c) | expanded=true |  | 0 | Y |
| 260 | sidebar-right | Colors and palettes | label |  | palette-label | LabelText |  (c) |  |  |  | N |
| 261 | sidebar-right | Colors and palettes | div | #paletteSelect | palette-select-trigger | combobox | Palette (c) | haspopup=listbox expanded=false label=Palette |  | 0 | N |
| 262 | sidebar-right | Colors and palettes | div |  | palette-chip | button | #2C5F2D (c) | label=#2C5F2D |  | 0 | N |
| 263 | sidebar-right | Colors and palettes | div |  | palette-chip | button | #4A7856 (c) | label=#4A7856 |  | -1 | N |
| 264 | sidebar-right | Colors and palettes | div |  | palette-chip | button | #8B4513 (c) | label=#8B4513 |  | -1 | N |
| 265 | sidebar-right | Colors and palettes | div |  | palette-chip | button | #FFD700 (c) | label=#FFD700 |  | -1 | N |
| 266 | sidebar-right | Colors and palettes | div |  | palette-chip | button | #F0EAD6 (c) | label=#F0EAD6 |  | -1 | N |
| 267 | sidebar-right | Colors and palettes | button | #paletteAddChip | palette-add | button | + (c) | expanded=false |  |  | N |
| 268 | sidebar-right | Colors and palettes | div | #paletteNote | palette-note | status |  (f) | live=polite |  |  | N |
| 269 | sidebar-right | Colors and palettes | button |  | btn--ghost | button | Export this (c) |  |  |  | N |
| 270 | sidebar-right | Colors and palettes | button |  | btn--ghost | button | Export all (c) |  |  |  | N |
| 271 | sidebar-right | Colors and palettes | button |  | btn--ghost | button | Import (c) |  |  |  | N |
| 272 | sidebar-right | Colors and palettes | input[file] | #paletteFluidFile |  | button |  (f) |  |  |  | N |
| 273 | sidebar-right | Layers | div |  | sidebar-section section-layers | generic | Layers (f) |  |  |  | Y |
| 274 | sidebar-right | Layers | span |  | section-title | button | LAYERS (c) | expanded=true |  | 0 | Y |
| 275 | sidebar-right | Layers | input[file] |  |  | button |  (f) |  |  |  | N |
| 276 | sidebar-right | Layers | button | #uploadBtn |  | button | IMPORT (c) |  |  |  | N |
| 277 | sidebar-right | Layers | button | #captureBtn |  | button | VISIBLE TO LAYER (c) |  |  |  | N |
| 278 | sidebar-right | Layers | button | #flattenLayersBtn |  | button | FLATTEN (c) |  |  |  | N |
| 279 | sidebar-right | Layers | button | #addCollisionLayerBtn |  | button | COLLIDER (c) |  |  |  | N |
| 280 | sidebar-right | Layers | button |  |  | button | From Image (f) |  |  |  | N |
| 281 | sidebar-right | Layers | button |  |  | button | From Canvas (f) |  |  |  | N |
| 282 | sidebar-right | Layers | input[text] |  | layer-title | textbox |  (c) |  | Sim Layer |  | N |
| 283 | sidebar-right | Layers | label |  | layer-vis | LabelText | Show or hide this layer (c) |  |  |  | N |
| 284 | sidebar-right | Layers | input[checkbox] |  | layer-vis-check | checkbox | Show or hide this layer (c) |  | checked |  | N |
| 285 | sidebar-right | Layers | button |  | subsection-add-btn | button | + NEW PATH (c) |  |  |  | N |
| 286 | sidebar-right | Layers | button |  | path-empty-create | button | + CREATE PATH LAYER (c) |  |  |  | N |
| 287 | sidebar-right | Layers | input[checkbox] | #hoverCaptureToggle |  | checkbox | ENABLE CAPTURE ON HOVER (c) |  | unchecked |  | N |
| 288 | sidebar-right | Layers | label |  |  | LabelText | Enable Capture on Hover (f) |  |  |  | N |
| 289 | sidebar-right | Layers | input[checkbox] | #detachCaptureToggle |  | checkbox | DETACH CAPTURE AREA (c) |  | unchecked |  | N |
| 290 | sidebar-right | Layers | label |  |  | LabelText | Detach Capture Area (f) |  |  |  | N |
| 291 | sidebar-right | Layers | input[checkbox] | #showPreviewLayersCb |  | checkbox | SHOW PREVIEW LAYERS (c) |  | unchecked |  | N |
| 292 | sidebar-right | Layers | label |  |  | LabelText | Show Preview Layers (f) |  |  |  | N |
| 293 | sidebar-right | Layers | input[file] | #imageUpload |  | button |  (f) |  |  |  | N |
| 294 | sidebar-right | Mutate shader | div | #mutation-section | sidebar-section | generic |  (c) |  |  |  | Y |
| 295 | sidebar-right | Mutate shader | span |  | section-title | button | MUTATE SHADER (c) | expanded=true |  | 0 | Y |
| 296 | sidebar-right | Mutate shader | label |  |  | LabelText |  (c) |  |  |  | N |
| 297 | sidebar-right | Mutate shader | button |  | ch-text-toggle active | button | BASIC (c) |  |  |  | N |
| 298 | sidebar-right | Mutate shader | button |  | ch-text-toggle | button | ALL (c) |  |  |  | N |
| 299 | sidebar-right | Mutate shader | select | #mutationScope |  | combobox |  (f) | hidden=true | basic | -1 | N |
| 300 | sidebar-right | Mutate shader | label |  |  | LabelText |  (c) |  |  |  | N |
| 301 | sidebar-right | Mutate shader | input[range] | #mutationStrength |  | slider | Strength of mutate, larger creates wide… (c) |  | 0.3 |  | N |
| 302 | sidebar-right | Mutate shader | label |  |  | LabelText |  (c) |  |  |  | N |
| 303 | sidebar-right | Mutate shader | select | #mutationCount |  | combobox |  (c) |  | 6 |  | N |
| 304 | sidebar-right | Mutate shader | button | #mutationGenerate | mutation-btn mutation-btn-primary | button | MUTATE M (c) |  |  |  | N |
| 305 | sidebar-right | Mutate shader | button | #mutationUndo | mutation-btn | button | ← UNDO (c) |  | disabled |  | N |
| 306 | sidebar-right | Mutate shader | button | #mutationRedo | mutation-btn | button | REDO → (c) |  | disabled |  | N |
| 307 | sidebar-right | Mutate shader | button | #mutationReset | mutation-btn | button | RESET (c) |  |  |  | N |
| 308 | sidebar-right | Mutate shader | label |  | mutation-locks-label | LabelText |  (c) |  |  |  | N |
| 309 | sidebar-right | Mutate shader | label |  | mutation-lock-chip | LabelText | Colors (f) |  |  |  | N |
| 310 | sidebar-right | Mutate shader | input[checkbox] |  | mutation-lock-cb | checkbox | Colors (c) |  | unchecked |  | N |
| 311 | sidebar-right | Mutate shader | label |  | mutation-lock-chip | LabelText | Kaleido (f) |  |  |  | N |
| 312 | sidebar-right | Mutate shader | input[checkbox] |  | mutation-lock-cb | checkbox | Kaleido (c) |  | unchecked |  | N |
| 313 | sidebar-right | Mutate shader | label |  | mutation-lock-chip | LabelText | Sim (f) |  |  |  | N |
| 314 | sidebar-right | Mutate shader | input[checkbox] |  | mutation-lock-cb | checkbox | Sim (c) |  | unchecked |  | N |
| 315 | sidebar-right | Mutate shader | label |  | mutation-lock-chip | LabelText | Effects (f) |  |  |  | N |
| 316 | sidebar-right | Mutate shader | input[checkbox] |  | mutation-lock-cb | checkbox | Effects (c) |  | unchecked |  | N |
| 317 | sidebar-right | Mutate shader | label |  | mutation-lock-chip | LabelText | Audio (f) |  |  |  | N |
| 318 | sidebar-right | Mutate shader | input[checkbox] |  | mutation-lock-cb | checkbox | Audio (c) |  | unchecked |  | N |
| 319 | sidebar-right | Effects | div |  | sidebar-section | generic | Effects (f) |  |  |  | Y |
| 320 | sidebar-right | Effects | span |  | section-title | button | EFFECTS (c) | expanded=true |  | 0 | Y |
| 321 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Light Source (c) | label=Preview Light Source |  | 0 | N |
| 322 | sidebar-right | Effects | input[checkbox] | #enableLighting |  | checkbox | LIGHT SOURCE (c) |  | unchecked |  | N |
| 323 | sidebar-right | Effects | label |  |  | LabelText | Light Source (f) |  |  |  | N |
| 324 | sidebar-right | Effects | label |  |  | LabelText | Mode (f) |  |  |  | N |
| 325 | sidebar-right | Effects | select | #lightMode |  | combobox |  (f) |  | manual |  | N |
| 326 | sidebar-right | Effects | label |  |  | LabelText | Speed 0.50 (f) |  |  |  | N |
| 327 | sidebar-right | Effects | input[range] | #lightSpeed |  | slider |  (f) |  | 0.5 |  | N |
| 328 | sidebar-right | Effects | label |  |  | LabelText | Intensity 0.50 (f) |  |  |  | N |
| 329 | sidebar-right | Effects | input[range] | #lightIntensity |  | slider |  (f) |  | 0.5 |  | N |
| 330 | sidebar-right | Effects | label |  |  | LabelText | Ambient 0.30 (f) |  |  |  | N |
| 331 | sidebar-right | Effects | input[range] | #lightAmbient |  | slider |  (f) |  | 0.3 |  | N |
| 332 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Light Shift (c) | label=Preview Light Shift |  | 0 | N |
| 333 | sidebar-right | Effects | input[checkbox] | #enableLightShift |  | checkbox | LIGHT SHIFT (c) |  | unchecked |  | N |
| 334 | sidebar-right | Effects | label |  |  | LabelText | Light Shift (f) |  |  |  | N |
| 335 | sidebar-right | Effects | label |  |  | LabelText | Draw a path through colors (f) |  |  |  | N |
| 336 | sidebar-right | Effects | label |  |  | LabelText | Blend Mode (f) |  |  |  | N |
| 337 | sidebar-right | Effects | select | #lightShiftMode |  | combobox | Replaces overblown/white areas with the… (f) |  | replace |  | N |
| 338 | sidebar-right | Effects | label |  |  | LabelText | Speed 0.50 (f) |  |  |  | N |
| 339 | sidebar-right | Effects | input[range] | #lightShiftSpeed |  | slider |  (f) |  | 0.5 |  | N |
| 340 | sidebar-right | Effects | label |  |  | LabelText | Threshold 0.85 (f) |  |  |  | N |
| 341 | sidebar-right | Effects | input[range] | #lightShiftThreshold |  | slider |  (f) |  | 0.85 |  | N |
| 342 | sidebar-right | Effects | label |  |  | LabelText | Intensity 0.50 (f) |  |  |  | N |
| 343 | sidebar-right | Effects | input[range] | #lightShiftIntensity |  | slider |  (f) |  | 0.5 |  | N |
| 344 | sidebar-right | Effects | label |  |  | LabelText | Saturation 1.00 (f) |  |  |  | N |
| 345 | sidebar-right | Effects | input[range] | #lightShiftSaturation |  | slider |  (f) |  | 1 |  | N |
| 346 | sidebar-right | Effects | button | #clearLightShiftPath | btn--destructive | button | Clear Path (f) |  |  |  | N |
| 347 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Glow (c) | label=Preview Glow |  | 0 | N |
| 348 | sidebar-right | Effects | input[checkbox] | #glowToggle |  | checkbox | GLOW (c) |  | unchecked |  | N |
| 349 | sidebar-right | Effects | label |  |  | LabelText | Glow (f) |  |  |  | N |
| 350 | sidebar-right | Effects | label |  |  | LabelText | Intensity 0.800 (f) |  |  |  | N |
| 351 | sidebar-right | Effects | input[range] | #glowIntensity |  | slider | Intensity 0.800 (f) |  | 0.8 |  | N |
| 352 | sidebar-right | Effects | label |  |  | LabelText | Threshold 0.60 (f) |  |  |  | N |
| 353 | sidebar-right | Effects | input[range] | #glowThreshold |  | slider | Threshold 0.60 (f) |  | 0.6 |  | N |
| 354 | sidebar-right | Effects | span |  | fx-thumb | img | Preview Scatter (f) | label=Preview Scatter |  | 0 | N |
| 355 | sidebar-right | Effects | input[checkbox] | #scatterToggle |  | checkbox | Scatter (f) |  | unchecked |  | N |
| 356 | sidebar-right | Effects | label |  |  | LabelText | Scatter (f) |  |  |  | N |
| 357 | sidebar-right | Effects | label |  |  | LabelText | Amount 0.50 (f) |  |  |  | N |
| 358 | sidebar-right | Effects | input[range] | #scatterAmount |  | slider | Amount 0.50 (f) |  | 0.5 |  | N |
| 359 | sidebar-right | Effects | label |  |  | LabelText | Reach 1.00 (f) |  |  |  | N |
| 360 | sidebar-right | Effects | input[range] | #scatterReach |  | slider | Reach 1.00 (f) |  | 1 |  | N |
| 361 | sidebar-right | Effects | input[checkbox] | #scatterBlockToggle |  | checkbox | Colliders Block Light (f) |  | checked |  | N |
| 362 | sidebar-right | Effects | label |  |  | LabelText | Colliders Block Light (f) |  |  |  | N |
| 363 | sidebar-right | Effects | label |  |  | LabelText | Source (f) |  |  |  | N |
| 364 | sidebar-right | Effects | select | #scatterSource |  | combobox | Source (f) |  | light |  | N |
| 365 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Surface Shading (c) | label=Preview Surface Shading |  | 0 | N |
| 366 | sidebar-right | Effects | input[checkbox] | #displayShadingToggle |  | checkbox | SURFACE SHADING (c) |  | unchecked |  | N |
| 367 | sidebar-right | Effects | label |  |  | LabelText | Surface Shading (f) |  |  |  | N |
| 368 | sidebar-right | Effects | label |  |  | LabelText | Intensity 2.0 (f) |  |  |  | N |
| 369 | sidebar-right | Effects | input[range] | #shadingIntensity |  | slider | Intensity 2.0 (f) |  | 2 |  | N |
| 370 | sidebar-right | Effects | label |  |  | LabelText | Relief 0.10 (f) |  |  |  | N |
| 371 | sidebar-right | Effects | input[range] | #shadeRelief |  | slider | Relief 0.10 (f) |  | 0.1 |  | N |
| 372 | sidebar-right | Effects | label |  |  | LabelText | Gloss 0.05 (f) |  |  |  | N |
| 373 | sidebar-right | Effects | input[range] | #shadeGloss |  | slider | Gloss 0.05 (f) |  | 0.05 |  | N |
| 374 | sidebar-right | Effects | label |  |  | LabelText | Ridges 6.0 (f) |  |  |  | N |
| 375 | sidebar-right | Effects | input[range] | #ridges |  | slider | Ridges 6.0 (f) |  | 6 |  | N |
| 376 | sidebar-right | Effects | label |  |  | LabelText | Ridge Strength 2.0 (f) |  |  |  | N |
| 377 | sidebar-right | Effects | input[range] | #sharpness |  | slider | Ridge Strength 2.0 (f) |  | 2 |  | N |
| 378 | sidebar-right | Effects | label |  |  | LabelText | Vibrance 0.50 (f) |  |  |  | N |
| 379 | sidebar-right | Effects | input[range] | #vibrance |  | slider | Vibrance 0.50 (f) |  | 0.5 |  | N |
| 380 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Dither (c) | label=Preview Dither |  | 0 | N |
| 381 | sidebar-right | Effects | input[checkbox] | #ditherToggle |  | checkbox | DITHER (c) |  | unchecked |  | N |
| 382 | sidebar-right | Effects | label |  |  | LabelText | Dither (f) |  |  |  | N |
| 383 | sidebar-right | Effects | label |  |  | LabelText | Pattern (f) |  |  |  | N |
| 384 | sidebar-right | Effects | select | #ditherPattern |  | combobox | Pattern (f) |  | bayer |  | N |
| 385 | sidebar-right | Effects | canvas | #ditherPad | dither-pad | application | Pattern pad, 16 by 16 squares. Arrow ke… (f) | label=Pattern pad, 16 by 16 s… |  | 0 | N |
| 386 | sidebar-right | Effects | button | #ditherPadInvert |  | button | Invert (f) |  |  |  | N |
| 387 | sidebar-right | Effects | button | #ditherPadClear | btn--destructive | button | Clear (f) |  |  |  | N |
| 388 | sidebar-right | Effects | label |  |  | LabelText | Levels 4 (f) |  |  |  | N |
| 389 | sidebar-right | Effects | input[range] | #ditherLevels |  | slider | Levels 4 (f) |  | 4 |  | N |
| 390 | sidebar-right | Effects | label |  |  | LabelText | Size 2 px (f) |  |  |  | N |
| 391 | sidebar-right | Effects | input[range] | #ditherSize |  | slider | Size 2 px (f) |  | 2 |  | N |
| 392 | sidebar-right | Effects | label |  |  | LabelText | Color (f) |  |  |  | N |
| 393 | sidebar-right | Effects | select | #ditherTone |  | combobox | Color (f) |  | retro |  | N |
| 394 | sidebar-right | Effects | label |  |  | LabelText | Beat pulse 0% (f) |  |  |  | N |
| 395 | sidebar-right | Effects | input[range] | #ditherPulse |  | slider | Beat pulse 0% (f) |  | 0 |  | N |
| 396 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Gravity Direction (c) | label=Preview Gravity Directi… |  | 0 | N |
| 397 | sidebar-right | Effects | input[checkbox] | #pressureConstant |  | checkbox | GRAVITY DIRECTION (c) |  | unchecked |  | N |
| 398 | sidebar-right | Effects | label |  |  | LabelText | Gravity Direction (f) |  |  |  | N |
| 399 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Border (c) | label=Preview Border |  | 0 | N |
| 400 | sidebar-right | Effects | input[checkbox] | #overflowToggle |  | checkbox | BORDER (c) |  | unchecked |  | N |
| 401 | sidebar-right | Effects | label |  |  | LabelText | Border (f) |  |  |  | N |
| 402 | sidebar-right | Effects | label |  |  | LabelText | Width 2.5% (f) |  |  |  | N |
| 403 | sidebar-right | Effects | input[range] | #overflowBand |  | slider | Width 2.5% (f) |  | 2.5 |  | N |
| 404 | sidebar-right | Effects | span |  | fx-thumb | image | Preview Breathing (c) | label=Preview Breathing |  | 0 | N |
| 405 | sidebar-right | Effects | input[checkbox] | #breathingToggle |  | checkbox | BREATHING (c) |  | unchecked |  | N |
| 406 | sidebar-right | Effects | label |  |  | LabelText | Breathing (f) |  |  |  | N |
| 407 | sidebar-right | Effects | label |  |  | LabelText | Pattern (f) |  |  |  | N |
| 408 | sidebar-right | Effects | select | #breathPattern |  | combobox | Pattern (f) |  | relaxed |  | N |
| 409 | sidebar-right | Effects | label |  |  | LabelText | Swirl strength 50% (f) |  |  |  | N |
| 410 | sidebar-right | Effects | input[range] | #breathStrength |  | slider | Swirl strength 50% (f) |  | 0.5 |  | N |
| 411 | sidebar-right | Effects | label |  |  | LabelText | Color (f) |  |  |  | N |
| 412 | sidebar-right | Effects | select | #breathColorMode |  | combobox | Color (f) |  | same |  | N |
| 413 | sidebar-right | Effects | input[checkbox] | #breathCueToggle |  | checkbox | Cue words (f) |  | checked |  | N |
| 414 | sidebar-right | Effects | label |  |  | LabelText | Cue words (f) |  |  |  | N |
| 415 | sidebar-right | Animations | div |  | sidebar-section | generic | Animations (f) |  |  |  | Y |
| 416 | sidebar-right | Animations | span |  | section-title | button | ANIMATIONS (c) | expanded=true |  | 0 | Y |
| 417 | sidebar-right | Animations | button | #recMiniRecordBtn | btn--record | button | ●RECORD (c) |  |  |  | N |
| 418 | sidebar-right | Animations | button | #recMiniPauseBtn |  | button | ▶PLAY (c) |  | disabled |  | N |
| 419 | sidebar-right | Animations | button | #recMiniStopBtn |  | button | ■STOP (c) |  | disabled |  | N |
| 420 | sidebar-right | Animations | div |  | rec-strip-chips btn-sm | group | Length (c) | label=Length |  |  | N |
| 421 | sidebar-right | Animations | button | #recLen4 |  | button | 4 S (c) | pressed=false |  |  | N |
| 422 | sidebar-right | Animations | button | #recLen8 |  | button | 8 S (c) | pressed=true |  |  | N |
| 423 | sidebar-right | Animations | button | #recLen15 |  | button | 15 S (c) | pressed=false |  |  | N |
| 424 | sidebar-right | Animations | button | #recLen30 |  | button | 30 S (c) | pressed=false |  |  | N |
| 425 | sidebar-right | Animations | div |  | rec-strip-chips btn-sm | group | What a take records (c) | label=What a take records |  |  | N |
| 426 | sidebar-right | Animations | button | #recSrcMe |  | button | LOCAL ONLY (c) | pressed=true |  |  | N |
| 427 | sidebar-right | Animations | button | #recSrcAll |  | button | EVERYTHING (c) | pressed=false |  |  | N |
| 428 | sidebar-right | Animations | button | #recKeepBtn | btn--emphasis | button | Keep (f) |  |  |  | N |
| 429 | sidebar-right | Animations | button | #recDiscardBtn | btn--destructive | button | Discard (f) |  |  |  | N |
| 430 | sidebar-right | Animations | button |  | anim-lib-head | button | SAVED ANIMATIONS ▾ (c) | expanded=false |  |  | N |
| 431 | sidebar-right | Audio | div |  | sidebar-section | generic | Audio (f) |  |  |  | Y |
| 432 | sidebar-right | Audio | span |  | section-title | button | AUDIO (c) | expanded=true |  | 0 | Y |
| 433 | sidebar-right | Audio | label |  |  | LabelText |  (c) |  |  |  | N |
| 434 | sidebar-right | Audio | select | #audioMode |  | combobox | AUDIO MODE (c) |  | off |  | N |
| 435 | sidebar-right | Audio | label |  | audio-mini-enable | LabelText | Enable (f) |  |  |  | N |
| 436 | sidebar-right | Audio | input[checkbox] | #audioReactToggle |  | checkbox | Enable (f) |  | unchecked |  | N |
| 437 | sidebar-right | Audio | select | #audioReactSource | audio-mini-src | combobox |  (f) |  | mic |  | N |
| 438 | sidebar-right | Audio | button | #audioChooseTrack | audio-choose-track | button | Audio File (f) |  |  |  | N |
| 439 | sidebar-right | Audio | button | #audioPlayBtn | audio-play-btn | button | ⏸ (f) |  |  |  | N |
| 440 | sidebar-right | Audio | button | #audioRestartBtn | audio-play-btn | button | ⏮ (f) |  |  |  | N |
| 441 | sidebar-right | Audio | button | #audioLoopBtn | audio-play-btn active | button | 🔁 (f) |  |  |  | N |
| 442 | sidebar-right | Audio | input[range] | #audioSeek | audio-seek | slider | Draggable playhead for scrubbing (f) |  | 0 |  | N |
| 443 | sidebar-right | Audio | button | #audioMuteBtn | audio-play-btn | button | 🔊 (f) |  |  |  | N |
| 444 | sidebar-right | Audio | input[range] | #audioVolume | audio-vol | slider | Playback volume (f) |  | 0.85 |  | N |
| 445 | sidebar-right | Audio | button | #audioOpenFullBtn | audio-mini-full | button | ⬆️ Full Audio (f) |  |  |  | N |
| 446 | sidebar-right | Audio | input[file] | #audioReactFile |  | button |  (f) |  |  |  | N |
| 447 | sidebar-right | Audio | input[checkbox] | #audioTimingToggle |  | checkbox | VISUALIZE AUDIO TIMING (c) |  | unchecked |  | N |
| 448 | sidebar-right | Audio | label |  |  | LabelText | Visualize the track as descending bars … (c) |  |  |  | N |
| 449 | sidebar-right | Kaleidoscope | div |  | sidebar-section | generic | Kaleidoscope (f) |  |  |  | Y |
| 450 | sidebar-right | Kaleidoscope | span |  | section-title | button | KALEIDOSCOPE (c) | expanded=true |  | 0 | Y |
| 451 | sidebar-right | Kaleidoscope | input[checkbox] | #mandalaToggle |  | switch | MANDALA OVERLAY (c) |  | unchecked |  | N |
| 452 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Mandala Overlay (f) |  |  |  | N |
| 453 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Wedges 12 (f) |  |  |  | N |
| 454 | sidebar-right | Kaleidoscope | input[range] | #mandalaWedges |  | slider | Wedges 12 (f) |  | 12 |  | N |
| 455 | sidebar-right | Kaleidoscope | input[checkbox] | #mandalaConstrain |  | checkbox | Paint Only In Wedge (f) |  | checked |  | N |
| 456 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Paint Only In Wedge (f) |  |  |  | N |
| 457 | sidebar-right | Kaleidoscope | input[checkbox] | #mandalaHideGuides |  | checkbox | Hide Guides (f) |  | unchecked |  | N |
| 458 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Hide Guides (f) |  |  |  | N |
| 459 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Fill (f) |  |  |  | N |
| 460 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Off (f) |  |  |  | N |
| 461 | sidebar-right | Kaleidoscope | input[radio] |  |  | radio | Off (f) |  | checked |  | N |
| 462 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Fit (f) |  |  |  | N |
| 463 | sidebar-right | Kaleidoscope | input[radio] |  |  | radio | Fit (f) |  | unchecked |  | N |
| 464 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Full (f) |  |  |  | N |
| 465 | sidebar-right | Kaleidoscope | input[radio] |  |  | radio | Full (f) |  | unchecked |  | N |
| 466 | sidebar-right | Kaleidoscope | input[checkbox] | #zoomModeToggle |  | checkbox | Zoom Mode (Z) (f) |  | unchecked |  | N |
| 467 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Zoom Mode (Z) (f) |  |  |  | N |
| 468 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Density Sustain 0.9900 (f) |  |  |  | N |
| 469 | sidebar-right | Kaleidoscope | input[range] | #mandalaDensity |  | slider | Density Sustain 0.9900 (f) |  | 0.99 |  | N |
| 470 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Motion Isolation 2.000 (f) |  |  |  | N |
| 471 | sidebar-right | Kaleidoscope | input[range] | #mandalaIsolation |  | slider | Motion Isolation 2.000 (f) |  | 2 |  | N |
| 472 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Drying 1.00 (f) |  |  |  | N |
| 473 | sidebar-right | Kaleidoscope | input[range] | #mandalaWet |  | slider | Drying 1.00 (f) |  | 1 |  | N |
| 474 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Dry Time 0.5s (f) |  |  |  | N |
| 475 | sidebar-right | Kaleidoscope | input[range] | #mandalaDryTime |  | slider | Dry Time 0.5s (f) |  | 0.5 |  | N |
| 476 | sidebar-right | Kaleidoscope | button | #mandalaCaptureBtn |  | button | Save picture (f) |  |  |  | N |
| 477 | sidebar-right | Kaleidoscope | input[checkbox] | #kaleidoToggle |  | switch | KALEIDO (c) |  | unchecked |  | N |
| 478 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Kaleido (f) |  |  |  | N |
| 479 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Facets 12 (f) |  |  |  | N |
| 480 | sidebar-right | Kaleidoscope | input[range] | #kaleidoSegments |  | slider | Facets 12 (f) |  | 12 |  | N |
| 481 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Kaleidoscope Mode (f) |  |  |  | N |
| 482 | sidebar-right | Kaleidoscope | select | #kaleidoMode |  | combobox | Kaleidoscope Mode (f) |  | 1 |  | N |
| 483 | sidebar-right | Kaleidoscope | input[checkbox] | #kaleidoShowGuides |  | checkbox | Show Guides (f) |  | unchecked |  | N |
| 484 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Show Guides (f) |  |  |  | N |
| 485 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Angle 0° (f) |  |  |  | N |
| 486 | sidebar-right | Kaleidoscope | input[range] | #kAngle |  | slider | Angle 0° (f) |  | 0 |  | N |
| 487 | sidebar-right | Kaleidoscope | input[checkbox] | #kAnimateRot |  | checkbox | Animate Rotation (f) |  | unchecked |  | N |
| 488 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Animate Rotation (f) |  |  |  | N |
| 489 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Spin Speed 30°/s (f) |  |  |  | N |
| 490 | sidebar-right | Kaleidoscope | input[range] | #kSpinSpeed |  | slider |  (f) |  | 30 |  | N |
| 491 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Twist 0.0 (f) |  |  |  | N |
| 492 | sidebar-right | Kaleidoscope | input[range] | #kTwist |  | slider | Twist 0.0 (f) |  | 0 |  | N |
| 493 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Zoom 1.00 (f) |  |  |  | N |
| 494 | sidebar-right | Kaleidoscope | input[range] | #kZoom |  | slider | Zoom 1.00 (f) |  | 1 |  | N |
| 495 | sidebar-right | Kaleidoscope | label |  |  | LabelText | Opacity 1.00 (f) |  |  |  | N |
| 496 | sidebar-right | Kaleidoscope | input[range] | #kBlend |  | slider | Opacity 1.00 (f) |  | 1 |  | N |
| 497 | sidebar-right | Text | div |  | sidebar-section | generic | Text (f) |  |  |  | Y |
| 498 | sidebar-right | Text | span |  | section-title | button | TEXT (c) | expanded=true |  | 0 | Y |
| 499 | sidebar-right | Text | button |  | btn--emphasis | button | + ADD TEXT (c) |  |  |  | N |
| 500 | sidebar-right | Text | button |  |  | button | ARRANGE ON CANVAS (c) |  |  |  | N |
| 501 | sidebar-right | Text | textarea | #textOverlayContent |  | textbox | Your text here, enter starts a new line (f) |  |  |  | N |
| 502 | sidebar-right | Text | select | #textOverlayFont |  | combobox |  (f) |  | system-ui, -apple-syste… |  | N |
| 503 | sidebar-right | Text | button |  | btn--ghost | button | + Fonts installed on this computer (f) |  |  |  | N |
| 504 | sidebar-right | Text | input[number] | #textOverlaySize |  | spinbutton | Font size in pixels (f) |  |  |  | N |
| 505 | sidebar-right | Text | select | #textOverlayWeight |  | combobox | Font weight (f) |  | 100 |  | N |
| 506 | sidebar-right | Text | button |  |  | button | I (f) |  |  |  | N |
| 507 | sidebar-right | Text | button |  |  | button | Align left (f) |  |  |  | N |
| 508 | sidebar-right | Text | button |  |  | button | Align center (f) |  |  |  | N |
| 509 | sidebar-right | Text | button |  |  | button | Align right (f) |  |  |  | N |
| 510 | sidebar-right | Text | select | #textOverlayCase |  | combobox | Letter case (f) |  | none |  | N |
| 511 | sidebar-right | Text | label |  |  | LabelText | Letter Spacing (f) |  |  |  | N |
| 512 | sidebar-right | Text | input[range] | #textOverlayTracking |  | slider | Letter Spacing (f) |  | 30 |  | N |
| 513 | sidebar-right | Text | label |  |  | LabelText | Line Height (f) |  |  |  | N |
| 514 | sidebar-right | Text | input[range] | #textOverlayLeading |  | slider | Line Height (f) |  | 2.7 |  | N |
| 515 | sidebar-right | Text | label |  |  | LabelText | Opacity (f) |  |  |  | N |
| 516 | sidebar-right | Text | input[range] | #textOverlayOpacity |  | slider | Opacity (f) |  | 1 |  | N |
| 517 | sidebar-right | Text | input[color] | #textOverlayColor | text-swatch | ColorWell | Text colour (f) |  | #000000 |  | N |
| 518 | sidebar-right | Text | input[checkbox] | #textOverlayBgToggle |  | checkbox | Draw a filled box behind the text (f) |  | unchecked |  | N |
| 519 | sidebar-right | Text | input[color] | #textOverlayBgColor | text-swatch | ColorWell | Background colour (f) |  | #000000 |  | N |
| 520 | sidebar-right | Text | label |  |  | LabelText | Background Opacity (f) |  |  |  | N |
| 521 | sidebar-right | Text | input[range] | #textOverlayBgOpacity |  | slider | Background Opacity (f) |  | 1 |  | N |
| 522 | sidebar-right | Text | input[number] | #textOverlayPadding |  | spinbutton | Space between the text and the box edge (f) |  |  |  | N |
| 523 | sidebar-right | Text | input[number] | #textOverlayRadius |  | spinbutton | Corner radius of the box (f) |  |  |  | N |
| 524 | sidebar-right | Text | label |  |  | LabelText | Drop shadow (f) |  |  |  | N |
| 525 | sidebar-right | Text | input[checkbox] | #textOverlayShadow |  | checkbox | Drop shadow (f) |  | unchecked |  | N |
| 526 | sidebar-right | Text | label |  |  | LabelText | Fluid collides with this text (f) |  |  |  | N |
| 527 | sidebar-right | Text | input[checkbox] | #textOverlayCollider |  | checkbox | Fluid collides with this text (f) |  | unchecked |  | N |
| 528 | sidebar-right | Text | select | #textOverlayColliderMode |  | combobox | Block: swirls pile up against and go ar… (f) |  | block |  | N |
| 529 | sidebar-right | Text | label |  |  | LabelText | Wall Strength (f) |  |  |  | N |
| 530 | sidebar-right | Text | input[range] | #textOverlayColliderStrength |  | slider | Wall Strength (f) |  | 1 |  | N |
| 531 | sidebar-right | Text | button |  | hk-picker-key | button | Set key (f) | pressed=false |  |  | N |
| 532 | sidebar-right | Text | button |  | hk-picker-clear btn--ghost | button | Remove this hotkey (f) | label=Remove this hotkey |  |  | N |
| 533 | sidebar-right | Text | select | #textOverlayHotkeyAction |  | combobox | Pour into Fluid: Hotkey turns the brush… (f) |  | pour |  | N |
| 534 | sidebar-right | Text | label |  |  | LabelText | Pour at the brush location (f) |  |  |  | N |
| 535 | sidebar-right | Text | input[checkbox] | #textOverlayHotkeyAtBrush |  | checkbox | Pour at the brush location (f) |  | unchecked |  | N |
| 536 | sidebar-right | Text | button |  |  | button | Duplicate (f) |  |  |  | N |
| 537 | sidebar-right | Text | button | #textOverlayFluidize |  | button | Fluidize (f) |  |  |  | N |
| 538 | sidebar-right | Text | button |  | btn--destructive | button | Delete (f) |  |  |  | N |
| 539 | sidebar-right | Text | button | #textOverlayMakeBrush |  | button | Convert to brush (f) |  |  |  | N |
| 540 | sidebar-right | Text | button | #textOverlayClearAll | btn--destructive | button | CLEAR ALL (c) | expanded=false controls=textOverlayClearAsk |  |  | N |
| 541 | sidebar-right | Text | div | #textOverlayClearAsk |  | group | Clear all text? (f) | label=Clear all text? |  |  | N |
| 542 | sidebar-right | Text | button |  |  | button | Cancel (f) |  |  |  | N |
| 543 | sidebar-right | Text | button | #textOverlayClearConfirm | btn--destructive | button | Yes, clear all (f) |  |  |  | N |
| 544 | sidebar-right | Focus | div |  | sidebar-section | generic | Focus (f) |  |  |  | Y |
| 545 | sidebar-right | Focus | span |  | section-title | button | FOCUS (c) | expanded=true |  | 0 | Y |
| 546 | sidebar-right | Focus | input[checkbox] | #focusModeToggle |  | checkbox | FOCUS MODE (F) (c) |  | unchecked |  | N |
| 547 | sidebar-right | Focus | label |  |  | LabelText | Focus Mode (F) (f) |  |  |  | N |
| 548 | sidebar-right | Focus | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 549 | sidebar-right | Focus | button |  |  | button | 9:16 TIKTOK (c) |  |  |  | N |
| 550 | sidebar-right | Focus | button |  |  | button | 1:1 SQUARE (c) |  |  |  | N |
| 551 | sidebar-right | Focus | button |  |  | button | 16:9 YOUTUBE (c) |  |  |  | N |
| 552 | sidebar-right | Focus | button |  |  | button | 21:9 ULTRA (c) |  |  |  | N |
| 553 | sidebar-right | Focus | input[checkbox] | #streamFormatLock |  | checkbox | LOCK FORMAT (c) |  | unchecked |  | N |
| 554 | sidebar-right | Focus | label |  |  | LabelText | Lock Format (f) |  |  |  | N |
| 555 | sidebar-right | Display | div |  | sidebar-section | generic | Display (f) |  |  |  | Y |
| 556 | sidebar-right | Display | span |  | section-title | button | DISPLAY (c) | expanded=true |  | 0 | Y |
| 557 | sidebar-right | Display | input[checkbox] | #photoSafeToggle |  | checkbox | REDUCE FLASHING AND RAPID BRIGHTNESS CH… (c) |  | checked |  | N |
| 558 | sidebar-right | Display | label |  |  | LabelText | Photosensitivity protection: reduces ra… (c) |  |  |  | N |
| 559 | sidebar-right | Display | button | #photoWarnShowBtn |  | button | SHOW PHOTOSENSITIVITY WARNING (c) |  |  |  | N |
| 560 | sidebar-right | Display | a |  | photo-warn-learn | link | Learn more about photosensitivity (Epil… (c) |  |  |  | N |
| 561 | sidebar-right | Display | label |  |  | LabelText |  (c) |  |  |  | N |
| 562 | sidebar-right | Display | select | #windowMode |  | combobox | WINDOW MODE F11 (c) |  | windowed |  | N |
| 563 | sidebar-right | Display | label |  |  | LabelText |  (c) |  |  |  | N |
| 564 | sidebar-right | Display | button | #penWindowBtn |  | button | PEN INPUT WINDOW (c) |  |  |  | N |
| 565 | sidebar-right | Display | label |  |  | LabelText | Select the visual mode to show in the s… (c) |  |  |  | N |
| 566 | sidebar-right | Display | select | #penWindowMirror |  | combobox | PEN WINDOW MIRROR (c) |  | light |  | N |
| 567 | sidebar-right | Display | label |  |  | LabelText | Select screen the pen window opens on. (c) |  |  |  | N |
| 568 | sidebar-right | Display | button |  |  | button | FIND SCREENS (c) |  |  |  | N |
| 569 | sidebar-right | Display | label |  |  | LabelText |  (c) |  |  |  | N |
| 570 | sidebar-right | Display | input[color] | #backgroundColorPicker |  | ColorWell | BACKGROUND COLOR (c) |  | #000000 |  | N |
| 571 | sidebar-right | Display | input[checkbox] | #transparentMode |  | checkbox | TRANSPARENT BACKGROUND (c) |  | unchecked |  | N |
| 572 | sidebar-right | Display | label |  |  | LabelText | Transparent Background (f) |  |  |  | N |
| 573 | sidebar-right | Display | button | #transparentRestartBtn |  | button | Restart now (f) |  |  |  | N |
| 574 | sidebar-right | Display | label |  |  | LabelText |  (c) |  |  |  | N |
| 575 | sidebar-right | Display | input[range] | #canvasOpacity |  | slider | CANVAS OPACITY (SIM VISIBILITY) 100% (c) |  | 100 |  | N |
| 576 | sidebar-right | Display | input[checkbox] | #preserveFluidOpacity |  | checkbox | EMPTY ALPHA LOCKED (c) |  | checked |  | N |
| 577 | sidebar-right | Display | label |  |  | LabelText | Empty Alpha Locked (f) |  |  |  | N |
| 578 | sidebar-right | Display | label |  |  | LabelText | Background Transparency 80% (f) |  |  |  | N |
| 579 | sidebar-right | Display | input[range] | #captureDimming |  | slider | Background Transparency 80% (f) |  | 80 |  | N |
| 580 | sidebar-right | Display | input[checkbox] | #showCanvasHandles |  | checkbox | SHOW CANVAS BORDER & HANDLES (c) |  | checked |  | N |
| 581 | sidebar-right | Display | label |  |  | LabelText | Show Canvas Border & Handles (f) |  |  |  | N |
| 582 | sidebar-right | Display | input[checkbox] | #lockCanvasBorders |  | checkbox | LOCK CANVAS BORDERS (c) |  | unchecked |  | N |
| 583 | sidebar-right | Display | label |  |  | LabelText | Lock Canvas Borders (f) |  |  |  | N |
| 584 | sidebar-right | Display | input[checkbox] | #statsToggle |  | checkbox | DEBUG INFO (c) |  | unchecked |  | N |
| 585 | sidebar-right | Display | label |  |  | LabelText | Debug Info (f) |  |  |  | N |
| 586 | sidebar-right | Export | div |  | sidebar-section | generic | Export (f) |  |  |  | Y |
| 587 | sidebar-right | Export | span |  | section-title | button | EXPORT (c) | expanded=true |  | 0 | Y |
| 588 | sidebar-right | Export | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 589 | sidebar-right | Export | button |  |  | button | SAVE PROJECT (c) |  |  |  | N |
| 590 | sidebar-right | Export | button |  |  | button | LOAD PROJECT (c) |  |  |  | N |
| 591 | sidebar-right | Export | input[file] |  |  | button |  (f) |  |  |  | N |
| 592 | sidebar-right | Export | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 593 | sidebar-right | Export | button | #exportVideoBtn |  | button | VIDEO (c) |  |  |  | N |
| 594 | sidebar-right | Export | button | #exportGifBtn |  | button | GIF (c) |  |  |  | N |
| 595 | sidebar-right | Export | button | #exportStillBtn |  | button | SAVE PICTURE (c) |  |  |  | N |
| 596 | sidebar-right | Export | button | #exportSequenceBtn |  | button | SEQUENCE (c) |  |  |  | N |
| 597 | sidebar-right | Export | label |  |  | LabelText |  (c) |  |  |  | N |
| 598 | sidebar-right | Export | select | #exportGround |  | combobox | Background (c) |  | seen |  | N |
| 599 | sidebar-right | Export | button | #exportStopBtn |  | button | Cancel export (f) |  |  |  | N |
| 600 | sidebar-right | Export | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 601 | sidebar-right | Export | label |  |  | LabelText |  (c) |  |  |  | N |
| 602 | sidebar-right | Export | input[number] | #exportVideoDuration |  | spinbutton |  (c) |  | 15 |  | N |
| 603 | sidebar-right | Export | label |  |  | LabelText |  (c) |  |  |  | N |
| 604 | sidebar-right | Export | select | #exportVideoFPS |  | combobox |  (c) |  | 60 |  | N |
| 605 | sidebar-right | Export | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 606 | sidebar-right | Export | label |  |  | LabelText |  (c) |  |  |  | N |
| 607 | sidebar-right | Export | input[number] | #exportGifDuration |  | spinbutton |  (c) |  | 3 |  | N |
| 608 | sidebar-right | Export | label |  |  | LabelText |  (c) |  |  |  | N |
| 609 | sidebar-right | Export | select | #exportGifFPS |  | combobox |  (c) |  | 15 |  | N |
| 610 | sidebar-right | Settings | div |  | sidebar-section | generic | Settings (f) |  |  |  | Y |
| 611 | sidebar-right | Settings | span |  | section-title | button | SETTINGS (c) | expanded=true |  | 0 | Y |
| 612 | sidebar-right | Settings | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 613 | sidebar-right | Settings | button |  | ch-text-toggle | button | SIMPLE (c) |  |  |  | N |
| 614 | sidebar-right | Settings | button |  | ch-text-toggle active | button | EVERYTHING (c) |  |  |  | N |
| 615 | sidebar-right | Settings | button |  | ui-vis-trigger btn--block | button | VISIBLE SECTIONS 28 / 28 ▾ (c) | expanded=false |  |  | N |
| 616 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Material Type (f) |  |  |  | N |
| 617 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Material Type (f) |  | checked |  | N |
| 618 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Viscosity (f) |  |  |  | N |
| 619 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Viscosity (f) |  | checked |  | N |
| 620 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Isolation (f) |  |  |  | N |
| 621 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Isolation (f) |  | checked |  | N |
| 622 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Laminar / Blend (f) |  |  |  | N |
| 623 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Laminar / Blend (f) |  | checked |  | N |
| 624 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Time (f) |  |  |  | N |
| 625 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Time (f) |  | checked |  | N |
| 626 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Density (f) |  |  |  | N |
| 627 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Density (f) |  | checked |  | N |
| 628 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Velocity (f) |  |  |  | N |
| 629 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Velocity (f) |  | checked |  | N |
| 630 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Color (f) |  |  |  | N |
| 631 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Color (f) |  | checked |  | N |
| 632 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Presets (f) |  |  |  | N |
| 633 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Presets (f) |  | checked |  | N |
| 634 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Transport (f) |  |  |  | N |
| 635 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Transport (f) |  | checked |  | N |
| 636 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Swirl Together (f) |  |  |  | N |
| 637 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Swirl Together (f) |  | checked |  | N |
| 638 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Simulation (f) |  |  |  | N |
| 639 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Simulation (f) |  | checked |  | N |
| 640 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Colors and palettes (f) |  |  |  | N |
| 641 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Colors and palettes (f) |  | checked |  | N |
| 642 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Layers (f) |  |  |  | N |
| 643 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Layers (f) |  | checked |  | N |
| 644 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Mutate shader (f) |  |  |  | N |
| 645 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Mutate shader (f) |  | checked |  | N |
| 646 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Effects (f) |  |  |  | N |
| 647 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Effects (f) |  | checked |  | N |
| 648 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Animations (f) |  |  |  | N |
| 649 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Animations (f) |  | checked |  | N |
| 650 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Audio (f) |  |  |  | N |
| 651 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Audio (f) |  | checked |  | N |
| 652 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Kaleidoscope (f) |  |  |  | N |
| 653 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Kaleidoscope (f) |  | checked |  | N |
| 654 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Text (f) |  |  |  | N |
| 655 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Text (f) |  | checked |  | N |
| 656 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Focus (f) |  |  |  | N |
| 657 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Focus (f) |  | checked |  | N |
| 658 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Display (f) |  |  |  | N |
| 659 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Display (f) |  | checked |  | N |
| 660 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Export (f) |  |  |  | N |
| 661 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Export (f) |  | checked |  | N |
| 662 | sidebar-right | Settings | label |  | ui-vis-row is-pinned | LabelText | Settingsalways shown (f) |  |  |  | N |
| 663 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Settingsalways shown (f) |  | checked disabled |  | N |
| 664 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Brush (f) |  |  |  | N |
| 665 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Brush (f) |  | checked |  | N |
| 666 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Multi-Brush (f) |  |  |  | N |
| 667 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Multi-Brush (f) |  | checked |  | N |
| 668 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Stroke and replay (f) |  |  |  | N |
| 669 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Stroke and replay (f) |  | checked |  | N |
| 670 | sidebar-right | Settings | label |  | ui-vis-row | LabelText | Quality bar (f) |  |  |  | N |
| 671 | sidebar-right | Settings | input[checkbox] |  |  | checkbox | Quality bar (f) |  | checked |  | N |
| 672 | sidebar-right | Settings | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 673 | sidebar-right | Settings | button |  | hk-bind-btn btn--block | button | + BIND A CONTROL CTRL+SHIFT+H (c) |  |  |  | N |
| 674 | sidebar-right | Settings | button |  | hk-list-trigger btn--block | button | YOUR HOTKEYS ▾ (c) | expanded=false |  |  | N |
| 675 | sidebar-right | Settings | label |  | brush-section-label | LabelText |  (c) |  |  |  | N |
| 676 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Brush Size” off the menu (c) | label=Take “Brush Size” off t… |  |  | N |
| 677 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Material Type - Fluid” off the me… (c) | label=Take “Material Type - F… |  |  | N |
| 678 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Viscosity” off the menu (c) | label=Take “Viscosity” off th… |  |  | N |
| 679 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Isolation” off the menu (c) | label=Take “Isolation” off th… |  |  | N |
| 680 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Laminar / Blend” off the menu (c) | label=Take “Laminar / Blend” … |  |  | N |
| 681 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Multi-Brush” off the menu (c) | label=Take “Multi-Brush” off … |  |  | N |
| 682 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Time” off the menu (c) | label=Take “Time” off the menu |  |  | N |
| 683 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Density” off the menu (c) | label=Take “Density” off the … |  |  | N |
| 684 | sidebar-right | Settings | button |  | hk-row-del btn--ghost | button | Take “Velocity” off the menu (c) | label=Take “Velocity” off the… |  |  | N |
| 685 | sidebar-right | Settings | button |  | radial-pick-btn btn--block | button | + ADD FROM THE INTERFACE (c) |  |  |  | N |
| 686 | sidebar-right | Settings | input[text] |  | radial-add-label | textbox | Label for a new key item (c) | label=Label for a new key item |  |  | N |
| 687 | sidebar-right | Settings | button |  | hk-picker-key | button | ITS KEY (c) | pressed=false |  |  | N |
| 688 | sidebar-right | Settings | button |  | hk-picker-clear btn--ghost | button | Remove this hotkey (f) | label=Remove this hotkey |  |  | N |
| 689 | sidebar-right | Settings | button |  | radial-add-btn | button | ADD (c) |  |  |  | N |
| 690 | sidebar-right | Settings | button |  | btn--ghost radial-reset | button | Back to the starting items (f) |  |  |  | N |
| 691 | sidebar-right | Settings | label |  |  | LabelText |  (c) |  |  |  | N |
| 692 | sidebar-right | Settings | button | #saveSettingsBtn |  | button | SAVE SETTINGS (c) |  |  |  | N |
| 693 | sidebar-right | Settings | button | #loadSettingsBtn |  | button | LOAD (c) |  |  |  | N |
| 694 | sidebar-right | Settings | button | #clearSettingsBtn | btn--destructive | button | CLEAR (c) |  |  |  | N |
| 695 | sidebar-right | Settings | input[checkbox] | #autoloadSettings |  | checkbox | LOAD SAVED ON START (c) |  | checked |  | N |
| 696 | sidebar-right | Settings | label |  |  | LabelText | Load saved on start (f) |  |  |  | N |
| 697 | sidebar-right | Settings | label |  |  | LabelText |  (c) |  |  |  | N |
| 698 | sidebar-right | Settings | button | #exportAllPresetsBtn |  | button | ⤓ EXPORT PRESETS (c) |  |  |  | N |
| 699 | sidebar-right | Settings | button | #importPresetsBtn |  | button | ⤒ IMPORT PRESETS (c) |  |  |  | N |
| 700 | sidebar-right | Settings | input[file] | #importPresetsInput |  | button |  (f) |  |  |  | N |
| 701 | sidebar-right | Settings | button | #openPresetsFolderBtn |  | button | Open Presets Folder (f) |  |  |  | N |
| 702 | overlay:.controls |  | label |  |  | LabelText | Brush Size (f) |  |  |  | N |
| 703 | overlay:.controls |  | label |  |  | LabelText | Fluid Color (f) |  |  |  | N |
| 704 | overlay:.controls |  | label |  |  | LabelText | Random Colors (f) |  |  |  | N |
| 705 | overlay:.controls |  | label |  |  | LabelText | Limit (f) |  |  |  | N |
| 706 | overlay:.controls |  | label |  |  | LabelText | Palette mode (new colour each stroke) (f) |  |  |  | N |
| 707 | overlay:.controls |  | label |  |  | LabelText | Image Sharpness (f) |  |  |  | N |
| 708 | overlay:.controls |  | label |  |  | LabelText | Motion Detail (f) |  |  |  | N |
| 709 | overlay:.controls |  | label |  |  | LabelText | Shading Detail (f) |  |  |  | N |
| 710 | overlay:.controls |  | label |  |  | LabelText | Density Sustain (f) |  |  |  | N |
| 711 | overlay:.controls |  | label |  |  | LabelText | Velocity Sustain (f) |  |  |  | N |
| 712 | overlay:.controls |  | label |  |  | LabelText | Motion Isolation (f) |  |  |  | N |
| 713 | overlay:.controls |  | label |  |  | LabelText |  (f) |  |  |  | N |
| 714 | overlay:.controls |  | label |  |  | LabelText | Viscosity (f) |  |  |  | N |
| 715 | overlay:.controls |  | label |  |  | LabelText | Laminar / Blend (f) |  |  |  | N |
| 716 | overlay:.controls |  | label |  |  | LabelText | Multiplier (f) |  |  |  | N |
| 717 | overlay:.controls |  | label |  |  | LabelText | ⏱️ Time (f) |  |  |  | N |
| 718 | overlay:.controls |  | label |  |  | LabelText | Presets (f) |  |  |  | N |
| 719 | overlay:.controls |  | button | #saveAsPresetBtn |  | button | + Save Current as Preset (f) |  |  |  | N |
| 720 | overlay:.controls |  | input[text] | #userPresetNameInput |  | textbox | Preset name... (f) |  |  |  | N |
| 721 | overlay:.controls |  | button | #userPresetConfirmBtn |  | button | Save (f) |  |  |  | N |
| 722 | overlay:.controls |  | button | #userPresetCancelBtn |  | button | Cancel (f) |  |  |  | N |
| 723 | overlay:.controls |  | button | #jellyfishBtn |  | button | Jellyfish (f) |  |  |  | N |
| 724 | overlay:.controls |  | button |  |  | button | Portrait (f) |  |  |  | N |
| 725 | overlay:.controls |  | button | #portalBtn |  | button | Portal (f) |  |  |  | N |
| 726 | overlay:.controls |  | button | #chimeraBtn |  | button | Chimera Three sine strokes × 8 arms (f) |  |  |  | N |
| 727 | overlay:.controls |  | label |  | anim-switch | LabelText |  (f) |  |  |  | N |
| 728 | overlay:.controls |  | input[checkbox] | #shootingStarToggle |  | checkbox |  (f) |  | unchecked |  | N |
| 729 | overlay:.controls |  | label |  |  | LabelText | Frequency 2.0/s (f) |  |  |  | N |
| 730 | overlay:.controls |  | input[range] | #ssFrequency |  | slider | Frequency 2.0/s (f) |  | 2 |  | N |
| 731 | overlay:.controls |  | label |  |  | LabelText | Angle 120° (f) |  |  |  | N |
| 732 | overlay:.controls |  | input[range] | #ssAngle |  | slider | Angle 120° (f) |  | 120 |  | N |
| 733 | overlay:.controls |  | label |  |  | LabelText | Length 0.4s (f) |  |  |  | N |
| 734 | overlay:.controls |  | input[range] | #ssLength |  | slider | Length 0.4s (f) |  | 0.4 |  | N |
| 735 | overlay:.controls |  | label |  |  | LabelText | Size 0.5x (f) |  |  |  | N |
| 736 | overlay:.controls |  | input[range] | #ssSize |  | slider | Size 0.5x (f) |  | 0.5 |  | N |
| 737 | overlay:.controls |  | label |  |  | LabelText | Origin (f) |  |  |  | N |
| 738 | overlay:.controls |  | label |  |  | LabelText | Variance 15% (f) |  |  |  | N |
| 739 | overlay:.controls |  | input[range] | #ssVariance |  | slider | Variance 15% (f) |  | 15 |  | N |
| 740 | overlay:.controls |  | label |  |  | LabelText | Gravity 0.10 (f) |  |  |  | N |
| 741 | overlay:.controls |  | input[range] | #ssGravity |  | slider | Gravity 0.10 (f) |  | 0.1 |  | N |
| 742 | overlay:.controls |  | label |  |  | LabelText | Layers (f) |  |  |  | N |
| 743 | overlay:recDrawer |  | button |  | studio-tab active | button | Audio (f) |  |  |  | N |
| 744 | overlay:recDrawer |  | button | #studioCloseBtn | rec-close | button | ✕ (f) |  |  |  | N |
| 745 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | − (f) |  |  |  | N |
| 746 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | + (f) |  |  |  | N |
| 747 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Fit (f) |  |  |  | N |
| 748 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Follow (f) |  |  |  | N |
| 749 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Re-detect (f) |  |  |  | N |
| 750 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Undo (f) |  |  |  | N |
| 751 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Redo (f) |  |  |  | N |
| 752 | overlay:recDrawer |  | button |  | ace-btn btn--ghost btn--emphasis | button | Set up this song (f) |  |  |  | N |
| 753 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Texture (f) |  |  |  | N |
| 754 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Attacks (f) |  |  |  | N |
| 755 | overlay:recDrawer |  | label |  | ace-sim | LabelText | Similarity (f) |  |  |  | N |
| 756 | overlay:recDrawer |  | input[range] |  |  | slider | Similarity (f) |  | 0.65 |  | N |
| 757 | overlay:recDrawer |  | button |  | ace-btn btn--ghost btn--emphasis | button | Make a lane (f) |  |  |  | N |
| 758 | overlay:recDrawer |  | button |  | ace-btn btn--ghost | button | Cancel (f) |  |  |  | N |
| 759 | overlay:recDrawer |  | canvas |  | ace-canvas | generic |  (f) | label= |  | 0 | N |
| 760 | overlay:recDrawer |  | label |  |  | LabelText | Lanes (f) |  |  |  | N |
| 761 | overlay:recDrawer |  | button |  | audio-gate-clear | button | Clear (f) |  |  |  | N |
| 762 | overlay:recDrawer |  | button |  | atv-auto | button | ✨ Auto (f) |  |  |  | N |
| 763 | overlay:recDrawer |  | button |  | atv-fit | button | ⟳ Fit (f) |  |  |  | N |
| 764 | overlay:recDrawer |  | label |  |  | LabelText | Lead 2.2s (f) |  |  |  | N |
| 765 | overlay:recDrawer |  | input[range] |  |  | slider |  (f) |  | 2.2 |  | N |
| 766 | overlay:recDrawer |  | label |  |  | LabelText | Nudge 0ms (f) |  |  |  | N |
| 767 | overlay:recDrawer |  | input[range] |  |  | slider |  (f) |  | 0 |  | N |
| 768 | overlay:recDrawer |  | button |  | atv-reread | button | Re-read (f) |  |  |  | N |
| 769 | overlay:recDrawer |  | button |  | atv-reread | button | Save this track's lanes and what they d… (f) |  |  |  | N |
| 770 | overlay:recDrawer |  | button |  | atv-reread | button | Load lanes from a .swirlcues file onto … (f) |  |  |  | N |
| 771 | overlay:recDrawer |  | input[file] |  |  | button |  (f) |  |  |  | N |
| 772 | overlay:recDrawer |  | summary |  |  | DisclosureTriangle | Live reactions (f) |  |  |  | N |
| 773 | overlay:recDrawer |  | label |  |  | LabelText | Sensitivity 1.5 (f) |  |  |  | N |
| 774 | overlay:recDrawer |  | input[range] | #audioSensitivity |  | slider | Sensitivity 1.5 (f) |  | 1.5 |  | N |
| 775 | overlay:recDrawer |  | label |  |  | LabelText | Beat Threshold 0.65 (f) |  |  |  | N |
| 776 | overlay:recDrawer |  | input[range] | #audioBeatThreshold |  | slider | Beat Threshold 0.65 (f) |  | 0.65 |  | N |
| 777 | overlay:recDrawer |  | label |  | brush-section-label | LabelText | Mappings (f) |  |  |  | N |
| 778 | overlay:recDrawer |  | input[checkbox] | #arMapAutoSplat |  | checkbox | Bass → Auto Splat (f) |  | checked |  | N |
| 779 | overlay:recDrawer |  | label |  |  | LabelText | Bass → Auto Splat (f) |  |  |  | N |
| 780 | overlay:recDrawer |  | input[checkbox] | #arMapSize |  | checkbox | Energy → Brush Size (f) |  | unchecked |  | N |
| 781 | overlay:recDrawer |  | label |  |  | LabelText | Energy → Brush Size (f) |  |  |  | N |
| 782 | overlay:recDrawer |  | input[checkbox] | #arMapKaleido |  | checkbox | Mid → Kaleido Rotation (f) |  | checked |  | N |
| 783 | overlay:recDrawer |  | label |  |  | LabelText | Mid → Kaleido Rotation (f) |  |  |  | N |
| 784 | overlay:recDrawer |  | label |  |  | LabelText | Spin speed 45°/s (f) |  |  |  | N |
| 785 | overlay:recDrawer |  | input[range] | #audioKaleidoSpin |  | slider | Spin speed 45°/s (f) |  | 45 |  | N |
| 786 | overlay:recDrawer |  | input[checkbox] | #arMapColor |  | checkbox | Beats → Color Cycle (f) |  | unchecked |  | N |
| 787 | overlay:recDrawer |  | label |  |  | LabelText | Beats → Color Cycle (f) |  |  |  | N |
| 788 | overlay:recDrawer |  | label |  |  | LabelText | Change colour every (f) |  |  |  | N |
| 789 | overlay:recDrawer |  | select | #audioColorEvery |  | combobox | Change colour every (f) |  | 4 |  | N |
| 790 | overlay:recDrawer |  | label |  |  | LabelText | Auto-Splat Pattern (f) |  |  |  | N |
| 791 | overlay:recDrawer |  | button |  | ar-pattern-btn active | button | ◉Center (f) |  |  |  | N |
| 792 | overlay:recDrawer |  | button |  | ar-pattern-btn | button | ✦Scatter (f) |  |  |  | N |
| 793 | overlay:recDrawer |  | button |  | ar-pattern-btn | button | ◯Orbit (f) |  |  |  | N |
| 794 | overlay:recDrawer |  | button |  | ar-pattern-btn | button | ▦Grid (f) |  |  |  | N |
| 795 | overlay:recDrawer |  | button |  | ar-pattern-btn | button | 🌀Spiral (f) |  |  |  | N |
| 796 | overlay:recDrawer |  | button |  | ar-pattern-btn | button | ✺Burst (f) |  |  |  | N |
| 797 | overlay:recDrawer |  | button |  | ar-pattern-btn | button | ∿Freq (f) |  |  |  | N |
| 798 | overlay:hotkeyOverlay |  | button | #hotkeyClose | close-btn | button | Close (f) | label=Close |  |  | N |
| 799 | overlay:hotkeyOverlay |  | a |  |  | link | Pavel Dobryakov (f) |  |  |  | N |
| 800 | overlay:hotkeyOverlay |  | a |  |  | link | Mark Harris (f) |  |  |  | N |
| 801 | overlay:hotkeyOverlay |  | a |  |  | link | Mattias Harrysson (f) |  |  |  | N |
| 802 | overlay:hotkeyOverlay |  | a |  |  | link | George Corney (f) |  |  |  | N |
| 803 | overlay:deletePaletteModal |  | button |  | delete-modal-cancel | button | Cancel (f) |  |  |  | N |
| 804 | overlay:deletePaletteModal |  | button |  | delete-modal-confirm btn--destructive | button | Delete (f) |  |  |  | N |
| 805 | overlay:focus-mode-hint |  | div | #focus-mode-hint |  | status | Press F or Esc to leave Focus (f) |  |  |  | N |
| 806 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Liquid opal (f) |  |  |  | N |
| 807 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Electric bloom (f) |  |  |  | N |
| 808 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Two currents (f) |  |  |  | N |
| 809 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Gel pen (f) |  |  |  | N |
| 810 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Endless silk swirl (f) |  |  |  | N |
| 811 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Thick paint, still (f) |  |  |  | N |
| 812 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Smoke wisps (f) |  |  |  | N |
| 813 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Quick-fading brush tracer (f) |  |  |  | N |
| 814 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Drifting mist (f) |  |  |  | N |
| 815 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Gusty, fades fast (f) |  |  |  | N |
| 816 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Slow marbling (f) |  |  |  | N |
| 817 | overlay:.arm-colors-panel |  | button |  | mixer-preset-btn | button | Electric threads (f) |  |  |  | N |
| 818 | overlay:.arm-colors-panel |  | input[text] | #mixerPresetNameInput | mixer-preset-name-input | textbox | Name… (f) |  |  |  | N |
| 819 | overlay:.arm-colors-panel |  | select | #mixerPresetGroupSel | mixer-preset-group-sel | combobox | Which group to save it in (f) |  |  |  | N |
| 820 | overlay:.arm-colors-panel |  | input[text] |  | mixer-preset-name-input | textbox | New group… (f) |  |  |  | N |
| 821 | overlay:.arm-colors-panel |  | button |  | mixer-preset-save | button | + New Preset (f) |  |  |  | N |
| 822 | overlay:.arm-colors-panel |  | button |  | mixer-preset-save mixer-preset-new-group | button | + Group (f) |  |  |  | N |
| 823 | overlay:.arm-colors-panel |  | button |  | look-link-copy btn--sm | button | Link to current settings (f) |  |  |  | N |
| 824 | overlay:quality-underbar |  | button |  | qub-dd-btn | button | IMAGE SHARPNESS 2048 (c) | haspopup=listbox expanded=false controls=visualResolutionDd… |  |  | Y |
| 825 | overlay:quality-underbar |  | div | #visualResolutionDdList | qub-dd-list | listbox | Image Sharpness (f) | labelledby=visualResolutionDdCap |  |  | N |
| 826 | overlay:quality-underbar |  | select | #visualResolution | qub-native-hidden | combobox | Image Sharpness (f) | hidden=true | 2048 | -1 | Y |
| 827 | overlay:quality-underbar |  | button |  | qub-dd-btn | button | MOTION DETAIL 1024 (c) | haspopup=listbox expanded=false controls=physicsResolutionD… |  |  | Y |
| 828 | overlay:quality-underbar |  | div | #physicsResolutionDdList | qub-dd-list | listbox | Motion Detail (f) | labelledby=physicsResolutionDdCap |  |  | N |
| 829 | overlay:quality-underbar |  | select | #physicsResolution | qub-native-hidden | combobox | Motion Detail (f) | hidden=true | 1024 | -1 | Y |
| 830 | overlay:quality-underbar |  | button |  | qub-dd-btn | button | Shading Detail 256 (f) | haspopup=listbox expanded=false controls=shadeFormResolutio… |  |  | N |
| 831 | overlay:quality-underbar |  | div | #shadeFormResolutionDdList | qub-dd-list | listbox | Shading Detail (f) | labelledby=shadeFormResolutionDdCap |  |  | N |
| 832 | overlay:quality-underbar |  | select | #shadeFormResolution | qub-native-hidden | combobox | Shading Detail (f) | hidden=true | 256 | -1 | N |
| 833 | overlay:quality-underbar |  | button | #resetAppBtn | btn--ghost reset-app-btn | button | Reset app (c) |  |  |  | Y |
| 834 | overlay:mixer-more-panel |  | div | #mixer-more-panel | arm-colors-panel mixer-more-panel | group | More faders (f) | label=More faders |  |  | N |
| 835 | overlay:mpInvitePop |  | div | #mpInvitePop | brush-shape-menu mp-pop | dialog | Invite (f) | label=Invite |  |  | N |
| 836 | overlay:mpInvitePop |  | div |  | mp-share-modes | group | How to share this room (f) | label=How to share this room |  |  | N |
| 837 | overlay:mpInvitePop |  | button | #shareModeCode | mp-share-mode | button | Code (f) | pressed=true |  |  | N |
| 838 | overlay:mpInvitePop |  | button | #shareModeQr | mp-share-mode | button | QR (f) | pressed=false |  |  | N |
| 839 | overlay:mpInvitePop |  | button | #shareModeHidden | mp-share-mode | button | Hide (f) | pressed=false |  |  | N |
| 840 | overlay:mpInvitePop |  | button | #copyRoomBtn | mp-btn-share | button | Copy link (f) |  |  |  | N |
| 841 | overlay:mpInvitePop |  | button | #copyRoomCodeBtn | mp-btn-share mp-btn-share-code | button | Copy code (f) |  |  |  | N |
| 842 | overlay:mpInvitePop |  | button | #copyRoomLookBtn | mp-btn-share mp-btn-share-look | button | Room link + current settings (f) |  |  |  | N |
| 843 | overlay:mpInvitePop |  | button | #phonePadRoomBtn | mp-btn-share mp-btn-phone | button | Sync phone (f) |  |  |  | N |
| 844 | overlay:mpRoomMenu |  | div | #mpRoomMenu | brush-shape-menu mp-pop mp-room-menu | menu | Room options (f) | label=Room options |  |  | N |
| 845 | overlay:mpRoomMenu |  | button | #lockRoomBtn | btn--ghost mp-menu-item | menuitemcheckbox | Lock room (f) | checked=false |  |  | N |
| 846 | overlay:mpRoomMenu |  | button | #roomReportBtn | btn--ghost mp-menu-item mp-room-report | menuitem | Copy room report (f) |  |  |  | N |
