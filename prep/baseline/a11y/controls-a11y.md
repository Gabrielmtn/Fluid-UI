# Controls — role, name, state and keyboard pattern of every control

Generated 2026-10-17T08:17:14.896Z by `prep/baseline/scripts/a11y.js` (F3). Machine copy: `controls-a11y.json` (what `--check` diffs). Derived from `prep/baseline/dom/controls.json` (F0: 2026-10-17T07:41:00.663Z, 845 controls) and its `lazy-*.json`; selectors come from the live boot of this run, which was cross-checked against the F0 record (898 compared, 0 differences). Role and name are the CDP accessibility tree's (`nameSource` c) or the page-side fallback for nodes the tree ignores or does not build (f: `display:none` content, labels folded into their control, containers). The keyboard pattern is a hand-written table keyed on element / role / class with the handler's file:line; it says what the code does today, not what it should do. Notes: `NOTES.md`.

## Environment

| Fact | Value |
|---|---|
| date | 2026-10-17T08:17:14.896Z |
| headCommit | c4796dac21008b26528e57f813425ffb7bd58490 |
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
| url | http://127.0.0.1:54158/index.html |
| bodyClasses | web-mode photosafe-on |
| leftFolded | false |
| rightFolded | false |
| hiddenUiKeys | [] |
| axeVersion | 4.14.0 |

## Counts

- controls: **845** in the main dump (316 role/name from the AX tree, 529 fallback); lazily built UI: radial-menu 10, colour-picker 18, presets-popup 18, arm-tip-menu 7
- rendered with everything open (`visibleNow`): 367; not rendered (conditional sub-blocks, hidden overlays, orphans): 478
- focusable (computed tabIndex ≥ 0, not disabled): 540; with an explicit tabindex attribute: 43
- with an explicit `role=`: 64 (dialog 2, group 6, button 23, radiogroup 2, radio 7, checkbox 1, alert 1, status 3, combobox 1, img 9, application 1, switch 2, listbox 3, menu 1, menuitemcheckbox 1, menuitem 1)
- with a state attribute: aria-pressed 19, aria-checked 9, aria-expanded 33, aria-disabled 0, aria-haspopup 9, aria-hidden 7, native checked 99, native disabled 9
- empty accessible name: 36 focusable controls (listed under Open questions in NOTES.md)

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

### Per keyboard pattern

| Pattern | Kind | Controls |
|---|---|---|
| K00 | orphan markup | 41 |
| K01 | container | 35 |
| K02 | live region / message | 4 |
| K03 | label | 213 |
| K10 | native button | 202 |
| K11 | native toggle button | 18 |
| K12 | button that opens a popup | 4 |
| K13 | quality-bar list button | 3 |
| K14 | skip-menu button | 4 |
| K15 | arm tip square | 1 |
| K16 | sidebar fold tab | 2 |
| K20 | native slider | 88 |
| K21 | native checkbox | 92 |
| K22 | parked canonical input | 7 |
| K23 | native radio | 3 |
| K24 | native spinbutton | 6 |
| K25 | native text field | 7 |
| K26 | colour well | 5 |
| K27 | native file button | 8 |
| K28 | native select | 31 |
| K29 | native link | 6 |
| K2A | native disclosure | 1 |
| K30 | section title | 17 |
| K31 | Ignite latch | 1 |
| K32 | palette combobox | 1 |
| K33 | palette chip (roving) | 5 |
| K34 | effect preview thumb | 9 |
| K35 | dither pattern pad | 1 |
| K36 | paint-type radio | 3 |
| K37 | arm colour radio | 4 |
| K38 | arm Pressure (checkbox button) | 1 |
| K39 | room menu item | 2 |
| K3A | quality-bar listbox | 3 |
| K3B | PhotoSafe dialog | 1 |
| K3D | popup panel | 2 |
| K3E | focus target | 1 |
| K3F | cue-editor canvas | 1 |
| K56 | preset button | 12 |

## Keyboard patterns (legend)

Native means the browser's own handling for that element; custom means a handler in the app, cited by file:line.

| Id | Kind | Keys and handler |
|---|---|---|
| K00 | orphan markup | Never rendered: the static .controls panel from index.html that js/20-mixer-layout.js does not re-parent stays in the DOM with display:none (prep/baseline/dom/NOTES.md, surface overlay:.controls). No keyboard road, none intended. |
| K01 | container | Container, not focusable (.sidebar-section, .mixer-channel, role=group, role=radiogroup); its controls carry the keyboard. |
| K02 | live region / message | role=status, role=alert, role=note: announced, not interactive. |
| K03 | label | Native <label>: not focusable; a click forwards to its control (for= or wrapping). |
| K10 | native button | Native <button>: Enter and Space activate (click). |
| K11 | native toggle button | Native <button> with aria-pressed: Enter / Space toggle; aria-pressed follows the class (24 writers in js/, e.g. js/20-mixer-layout.js buildColorChannel). |
| K12 | button that opens a popup | Native <button> with aria-haspopup / aria-expanded: Enter / Space open the panel; opened from the keyboard, focus moves into it, Tab out closes it, Esc closes it, focus returns to the button (DialogFocus.popup, js/00b-dialog-focus.js:190-231; Presets js/20-mixer-layout.js:2243; Invite / room menu js/06e-mp-panel.js:807; More js/46-strip-more.js:215). |
| K13 | quality-bar list button | button.qub-dd-btn[aria-haspopup=listbox]: Enter / Space toggle the list, ArrowUp / ArrowDown open it, Esc closes it (js/20-mixer-layout.js:2867-2881); the list is K3A. |
| K14 | skip-menu button | .skip-menu-option: Space / Enter move focus into the region, the arrows jump to the region they point at, Home / End, Esc puts focus back where it came from; other keys never reach the hotkeys (js/66-skip-menu.js:252-278). |
| K15 | arm tip square | button.arm-tip-btn[aria-haspopup=menu]: Enter / Space open the arm-tip menu (js/20-mixer-layout.js:8901-8914); focus lands on the active option (798); Esc closes and returns focus to the square (694-701). The menu is K55. |
| K16 | sidebar fold tab | button.lsb-toggle / .rsb-toggle with aria-expanded: Enter / Space fold or unfold the bar (js/20-mixer-layout.js:2406, 2545). |
| K20 | native slider | input[type=range]: ArrowLeft / ArrowDown and ArrowRight / ArrowUp move at least 1% of the travel, Shift+arrow 10%, snapped to the slider's step (js/67-slider-keys.js:24-60); PageUp / PageDown, Home and End are the browser's. |
| K21 | native checkbox | input[type=checkbox] (role=switch included): Space toggles; its label forwards clicks. |
| K22 | parked canonical input | input / select with aria-hidden="true" and tabindex="-1": the state holder behind a proxy, out of the Tab order (strip colour chips: #randomColor / #stepPalette / #colorGate, js/20-mixer-layout.js buildColorChannel; quality bar selects: js/20-mixer-layout.js:2820-2822; #mutationScope). The keyboard reaches the proxy, not this element. |
| K23 | native radio | input[type=radio]: arrows move within the group, Space selects. |
| K24 | native spinbutton | input[type=number]: ArrowUp / ArrowDown step, typed digits, Enter commits. |
| K25 | native text field | input[type=text] / <textarea>: typing; app hotkeys are suspended while it has focus (js/01a-param-registry.js isTypingTarget). |
| K26 | colour well | input[type=color]: a click (Enter / Space on the focused well) is intercepted in the capture phase and opens the shared picker popover instead of the OS dialog (js/64-colour-picker.js:720-729 → openFor 612). The popover is K3D / K52-K54. |
| K27 | native file button | input[type=file]: Enter / Space open the OS file picker. |
| K28 | native select | <select>: ArrowUp / ArrowDown change the value, Alt+ArrowDown / Enter / Space open the list, type-ahead. |
| K29 | native link | <a href>: Enter follows it. |
| K2A | native disclosure | <summary>: Enter / Space toggle the <details>. |
| K30 | section title | span.section-title[role=button][tabindex=0]: Enter / Space toggle the section, with Shift additive so the accordion keeps the others open (js/20-mixer-layout.js:9326-9339); aria-expanded follows the .collapsed class and the title catches focus when its section folds under it (9340-9351). |
| K31 | Ignite latch | .ch-ignite-lock[role=button][tabindex=0]: Enter / Space toggle the latch (js/20-mixer-layout.js:1488-1497); aria-pressed follows .latched (1498-1501). |
| K32 | palette combobox | #paletteSelect[role=combobox][tabindex=0]: Enter / Space / ArrowDown / ArrowUp open the palette listbox (js/01-config.js:456-462); in the list ArrowDown / ArrowUp / Home / End move, Enter / Space choose (618-621), Esc closes, Tab closes and walks on (544-558); Menu key / right-click open rename / duplicate / delete (463-466). |
| K33 | palette chip (roving) | .palette-chip[role=button]: one chip in the Tab order (roving tabindex, js/01-config.js:945-948); ArrowLeft / ArrowRight / ArrowUp / ArrowDown, Home, End move along the row, Enter / Space paint with it (949-969); Menu key / Shift+F10 open the chip menu (contextmenu, 906-910). |
| K34 | effect preview thumb | span.fx-thumb[role=img][tabindex=0]: focus shows the effect card, blur hides it; Enter / Space click the effect's checkbox (js/20-mixer-layout.js:4441-4451). A focusable role=img that acts as a button (see Open questions). |
| K35 | dither pattern pad | canvas#ditherPad[role=application][tabindex=0]: the arrows move the cursor square (wrapping), Space / Enter flip it (js/68-dither.js:322-337); the aria-label says so. |
| K36 | paint-type radio | button[role=radio] in .brush-mode-row[role=radiogroup]: ArrowLeft / ArrowRight / ArrowUp / ArrowDown move the choice and focus (js/20-mixer-layout.js:5737-5749); Enter / Space are the native click; ~ steps the type too (js/59-brush-type-key.js:95). |
| K37 | arm colour radio | button[role=radio].arm-mode-btn in .arm-mode-wrap[role=radiogroup]: the native click sets the mode (js/20-mixer-layout.js:9000-9018); no arrow-key handler on this radiogroup (8889-8891), so every radio is its own Tab stop (see Open questions). |
| K38 | arm Pressure (checkbox button) | button[role=checkbox].arm-push-btn: Enter / Space toggle (native click); aria-checked is written by paintRow (js/20-mixer-layout.js:8926-8930, 8935+). |
| K39 | room menu item | button[role=menuitem \| menuitemcheckbox] inside #mpRoomMenu[role=menu]: native button; the menu is a popup (js/06e-mp-panel.js:807), Esc closes it (onRoomPopKey 847-851); no arrow-key movement (DialogFocus.menu is not used here). |
| K3A | quality-bar listbox | div.qub-dd-list[role=listbox]: opened from its button (K13); inside, ArrowDown / ArrowUp / Home / End move among the options (tabindex -1), Enter / Space pick, Esc closes, Tab walks on and closes (js/20-mixer-layout.js:2883-2899; DialogFocus.popup 2857). |
| K3B | PhotoSafe dialog | #photoWarn[role=dialog][aria-modal]: its own trap — Tab / Shift+Tab cycle checkbox → Learn more → Exit → Continue and every other key is stopped (index.html:486-500 keyGuard); focus starts on the title (411) and is pulled back if it leaves (505). |
| K3C | held dialog | role=dialog held by DialogFocus.hold: focus moves in, Tab / Shift+Tab cycle inside, Esc closes, focus returns to the opener after a keyboard close (js/00b-dialog-focus.js:60-80, 103-188). The F1 hotkey sheet: js/05n-hotkeys-init.js:41-51, toggled by F1 or Shift+? (444-447). |
| K3D | popup panel | Popup via DialogFocus.popup: focus moves in when opened from the keyboard, Tab out closes, Esc closes, focus back to the trigger (js/00b-dialog-focus.js:190-231). Invite: js/06e-mp-panel.js:807; Presets: js/20-mixer-layout.js:2243; colour picker: js/64-colour-picker.js:642 + Esc 695-700. |
| K3E | focus target | tabindex="-1" heading: a focus target only (the PhotoSafe dialog focuses it on open, index.html:411). |
| K3F | cue-editor canvas | canvas.ace-canvas[tabindex=0][data-owns-keys]: while focused it owns Delete, the arrows, Space and 1-8 (js/40b-audio-cue-editor.js:739-753, onKey 458); its aria-label is empty (see Open questions). |
| K40 | generic focusable | An element with tabindex and no role: focusable, keys per its own handler (none found). |
| K50 | radial menu | #radialMenu[role=menu]: pointer-driven — hold or tap E (or the bound mouse button) to open, move over an item, release or click to pick; Esc or E close it, any other key closes it (js/58-radial-menu.js:804-818); the wheel adjusts a slider item (789-800). Nothing in it is focusable. |
| K51 | radial item | .radial-label[role=menuitem]: no tabindex, picked by pointer (K50). |
| K52 | picker track | .cp-track[role=slider][tabindex=0]: ArrowRight / ArrowUp + step, ArrowLeft / ArrowDown − step, Shift ×10, Home / End (js/64-colour-picker.js:307-318); the value is committed on keyup. |
| K53 | picker number | input.cp-num: Enter applies, Esc reverts, change applies (js/64-colour-picker.js:325-329). |
| K54 | picker chip | .cp-chip[role=button][tabindex=0]: Enter / Space pick the colour (js/64-colour-picker.js:440-442 recents, 582-584 palette). |
| K55 | arm tip menu | .arm-tip-menu[role=menu]: focus moves to the active option on open (js/20-mixer-layout.js:798); Esc closes and returns focus to the square (694-701); the options are native buttons; no arrow-key movement (role=menu set by hand, DialogFocus.menu not used — see Open questions). |
| K56 | preset button | button.mixer-preset-btn / .mixer-user-preset-btn inside the Presets panel (K3D): Enter / Space apply the preset; the panel focuses the active one when opened from the keyboard (js/20-mixer-layout.js:2243-2250); the ⋯ menu is a DialogFocus.menu (1936: arrows, Home, End). |

## All controls (document order, everything open)

Columns: order (F0 index); surface; section; selector (live, state classes dropped); role (CDP AX tree role or implicit; `[r]` = explicit role attribute); name (c = AX tree, f = fallback); state (ARIA state attributes without the `aria-` prefix, native checked/disabled/readOnly/hidden, tabindex attribute, `[focusable]` when the computed tabIndex ≥ 0); keys (pattern id, see the legend); R = rendered with everything open.

| # | Surface | Section | Selector | Role | Name | State | Keys | R |
|---|---|---|---|---|---|---|---|---|
| 0 | overlay:skipMenu |  | button.skip-menu-left | button | Left sidebar (c) |  [focusable] | K14 | Y |
| 1 | overlay:skipMenu |  | button.skip-menu-top | button | Top nav (c) |  [focusable] | K14 | Y |
| 2 | overlay:skipMenu |  | button.skip-menu-right | button | Right sidebar (c) |  [focusable] | K14 | Y |
| 3 | overlay:skipMenu |  | button.skip-menu-bottom | button | Bottom nav (c) |  [focusable] | K14 | Y |
| 4 | overlay:photoWarn |  | #photoWarn | dialog [r] | ⚠ Photosensitive seizure warning (f) | modal=true hidden=true | K3B | N |
| 5 | overlay:photoWarn |  | #pwTitle | heading | ⚠ Photosensitive seizure warning (f) | tabindex=-1 | K3E | N |
| 6 | overlay:photoWarn |  | label.pw-check | LabelText | Reduce flashing and rapid brightness changes (r… (f) |  | K03 | N |
| 7 | overlay:photoWarn |  | #pwProtect | checkbox | Reduce flashing and rapid brightness changes (r… (f) | checked=true [focusable] | K21 | N |
| 8 | overlay:photoWarn |  | #pwLearn | link | Learn more about photosensitivity (Epilepsy Fou… (f) |  [focusable] | K29 | N |
| 9 | overlay:photoWarn |  | #pwExit | button | Exit App (f) |  [focusable] | K10 | N |
| 10 | overlay:photoWarn |  | #pwContinue | button | Continue with protection on (f) |  [focusable] | K10 | N |
| 11 | titlebar |  | #min-button | button | Minimize (f) |  [focusable] | K10 | N |
| 12 | titlebar |  | #max-button | button | Maximize (f) |  [focusable] | K10 | N |
| 13 | titlebar |  | #close-button | button | Close (f) |  [focusable] | K10 | N |
| 14 | mixer-strip | Material Type | div.ch-material | generic |  (c) |  | K01 | Y |
| 15 | mixer-strip | Material Type | #materialMode | combobox | Material - Changes settings to give a few diffe… (c) |  [focusable] | K28 | Y |
| 16 | mixer-strip | Material Type | #curl | slider | Fluid (c) |  [focusable] | K20 | Y |
| 17 | mixer-strip | Viscosity | #mixer-strip > div.mixer-channel:nth-of-type(2) | generic |  (c) |  | K01 | Y |
| 18 | mixer-strip | Viscosity | #viscosity | slider | Viscosity (c) |  [focusable] | K20 | Y |
| 19 | mixer-strip | Isolation | #mixer-strip > div.mixer-channel:nth-of-type(3) | generic |  (c) |  | K01 | Y |
| 20 | mixer-strip | Isolation | #velocityInfluence | slider | Isolation (c) |  [focusable] | K20 | Y |
| 21 | mixer-strip | Laminar / Blend | #mixer-strip > div.mixer-channel:nth-of-type(4) | generic |  (c) |  | K01 | Y |
| 22 | mixer-strip | Laminar / Blend | #colorBlend | slider | Laminar / Blend (f) |  [focusable] | K20 | N |
| 23 | mixer-strip | Laminar / Blend | #colorBlendPerceptual | slider | Laminar / Blend (c) |  [focusable] | K20 | Y |
| 24 | mixer-strip | Time | #mixer-strip > div.mixer-channel:nth-of-type(5) | generic |  (c) |  | K01 | Y |
| 25 | mixer-strip | Time | #timeScale | slider | ⏱️ Time (f) |  [focusable] | K20 | N |
| 26 | mixer-strip | Time | #timeScalePerceptual | slider | Time (c) |  [focusable] | K20 | Y |
| 27 | mixer-strip | Density | #mixer-strip > div.mixer-channel:nth-of-type(6) | generic |  (c) |  | K01 | Y |
| 28 | mixer-strip | Density | #densityDissipation | slider | Density Sustain (f) |  [focusable] | K20 | N |
| 29 | mixer-strip | Density | #densityDissipationPerceptual | slider | Density (c) |  [focusable] | K20 | Y |
| 30 | mixer-strip | Velocity | #mixer-strip > div.mixer-channel:nth-of-type(7) | generic |  (c) |  | K01 | Y |
| 31 | mixer-strip | Velocity | #velocityDissipation | slider | Velocity (c) |  [focusable] | K20 | Y |
| 32 | mixer-strip |  | #mixerMoreBtn | button | More▾ (f) | expanded=false haspopup=true [focusable] | K12 | N |
| 33 | mixer-strip | Color | div.ch-wide | generic |  (c) |  | K01 | Y |
| 34 | mixer-strip | Color | #randomColor | checkbox | Random Colors (f) | hidden=true checked=true tabindex=-1 | K22 | Y |
| 35 | mixer-strip | Color | #stepPalette | checkbox | Palette mode (new colour each stroke) (f) | hidden=true checked=false tabindex=-1 | K22 | Y |
| 36 | mixer-strip | Color | #colorGate | checkbox | Limit (f) | hidden=true checked=true tabindex=-1 | K22 | Y |
| 37 | mixer-strip | Color | div.ch-wide > div.ch-toggle-row:nth-of-type(1) > div.ch-seg-switch | group [r] | Color of each stroke (c) |  | K01 | Y |
| 38 | mixer-strip | Color | div.ch-wide > div.ch-toggle-row:nth-of-type(1) > div.ch-seg-switch > … | button | One (c) | pressed=false [focusable] | K11 | Y |
| 39 | mixer-strip | Color | div.ch-wide > div.ch-toggle-row:nth-of-type(1) > div.ch-seg-switch > … | button | Random (c) | pressed=true [focusable] | K11 | Y |
| 40 | mixer-strip | Color | div.ch-wide > div.ch-toggle-row:nth-of-type(1) > div.ch-seg-switch > … | button | Palette (c) | pressed=false [focusable] | K11 | Y |
| 41 | mixer-strip | Color | button.ch-gate-toggle | button | Limit  On (c) |  [focusable] | K10 | Y |
| 42 | mixer-strip | Color | #colorPicker | ColorWell |  (c) |  [focusable] | K26 | Y |
| 43 | mixer-strip | Color | button.ch-nudge-btn | button | Ignite (c) |  [focusable] | K10 | Y |
| 44 | mixer-strip | Color | div.ch-ignite-lock | button [r] | Lock Ignite on (c) | pressed=false tabindex=0 [focusable] | K31 | Y |
| 45 | mixer-strip |  | #mixerPresetsTrigger | button | Presets ▾ (c) | expanded=false haspopup=true [focusable] | K12 | Y |
| 46 | mixer-strip |  | div.mixer-actions > button.btn--destructive | button | Clear (c) |  [focusable] | K10 | Y |
| 47 | mixer-strip |  | #pauseBtn | button | ⏸ (c) | pressed=false [focusable] | K11 | Y |
| 48 | mixer-strip |  | #freezeBtn | button | Stop (c) | pressed=false [focusable] | K11 | Y |
| 49 | sidebar-left | Brush Size | div.lsb-head > div.mixer-channel:nth-of-type(1) | generic |  (c) |  | K01 | Y |
| 50 | sidebar-left | Brush Size | #brushSize | slider | Brush Size (f) |  [focusable] | K20 | N |
| 51 | sidebar-left | Brush Size | #brushSizePerceptual | slider | Brush Size (c) |  [focusable] | K20 | Y |
| 52 | sidebar-left |  | div.lsb-steady > div.control-group:nth-of-type(1) > label | LabelText |  (c) |  | K03 | Y |
| 53 | sidebar-left |  | #brushSteady | slider | STABILIZATION 0% (c) |  [focusable] | K20 | Y |
| 54 | sidebar-left |  | #brushSteadyHideGuide | checkbox | Hide guide (f) | checked=false [focusable] | K21 | N |
| 55 | sidebar-left |  | div.lsb-steady > div.control-group:nth-of-type(2) > label | LabelText | Hide guide (f) |  | K03 | N |
| 56 | sidebar-left | Brush | div.lsb-body > div.sidebar-section:nth-of-type(1) | generic | Brush (f) |  | K01 | Y |
| 57 | sidebar-left | Brush | div.lsb-body > div.sidebar-section:nth-of-type(1) > div.section-heade… | button [r] | BRUSH (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 58 | sidebar-left | Brush | div.brush-settings-panel > label.brush-section-label:nth-of-type(1) | LabelText |  (c) |  | K03 | Y |
| 59 | sidebar-left | Brush | div.brush-presets-save-row > input.mixer-preset-name-input | textbox | Brush name... (f) |  [focusable] | K25 | N |
| 60 | sidebar-left | Brush | div.brush-presets-save-row > button.mixer-preset-save | button | + New Brush Preset (c) |  [focusable] | K10 | Y |
| 61 | sidebar-left | Brush | div.brush-settings-panel > label.brush-section-label:nth-of-type(2) | LabelText | ~ steps between Fluid, Pressure and Collider (c) |  | K03 | Y |
| 62 | sidebar-left | Brush | div.brush-settings-panel > div.brush-mode-row:nth-of-type(3) | radiogroup [r] | Paint Type (Fluid / Pressure / Collider) (c) |  | K01 | Y |
| 63 | sidebar-left | Brush | div.brush-settings-panel > div.brush-mode-row:nth-of-type(3) > button… | radio [r] | Fluid (c) | checked=true [focusable] | K36 | Y |
| 64 | sidebar-left | Brush | div.brush-settings-panel > div.brush-mode-row:nth-of-type(3) > button… | radio [r] | Pressure (c) | checked=false [focusable] | K36 | Y |
| 65 | sidebar-left | Brush | div.brush-settings-panel > div.brush-mode-row:nth-of-type(3) > button… | radio [r] | Collider (c) | checked=false [focusable] | K36 | Y |
| 66 | sidebar-left | Brush | div.brush-settings-panel > div:nth-of-type(4) > div.brush-mode-row:nt… | button | Smudge (f) |  [focusable] | K10 | N |
| 67 | sidebar-left | Brush | div.brush-settings-panel > div:nth-of-type(4) > div.brush-mode-row:nt… | button | Spread (f) |  [focusable] | K10 | N |
| 68 | sidebar-left | Brush | div.brush-settings-panel > div:nth-of-type(4) > div.brush-mode-row:nt… | button | Gather (f) |  [focusable] | K10 | N |
| 69 | sidebar-left | Brush | div.brush-settings-panel > div:nth-of-type(4) > div.brush-mode-row:nt… | button | Swirl (f) |  [focusable] | K10 | N |
| 70 | sidebar-left | Brush | div.brush-settings-panel > div:nth-of-type(4) > div.control-group:nth… | LabelText | Strength 1.00× (f) |  | K03 | N |
| 71 | sidebar-left | Brush | #brushVelStrength | slider | Strength 1.00× (f) | disabled=true | K20 | N |
| 72 | sidebar-left | Brush | #cursorToggle | checkbox | Show Cursor (c) | checked=true [focusable] | K21 | Y |
| 73 | sidebar-left | Brush | div.brush-settings-panel > div.control-group:nth-of-type(5) > label | LabelText | Show Cursor (f) |  | K03 | Y |
| 74 | sidebar-left | Brush | label.brush-ghost-head | LabelText |  (c) |  | K03 | Y |
| 75 | sidebar-left | Brush | #brushGhostToggle | checkbox | BRUSH GHOST 100% (c) | checked=true [focusable] | K21 | Y |
| 76 | sidebar-left | Brush | #brushGhostOpacity | slider | Brush ghost opacity (c) |  [focusable] | K20 | Y |
| 77 | sidebar-left | Brush | button.brush-fold-head | button | TIP (c) | expanded=true [focusable] | K10 | Y |
| 78 | sidebar-left | Brush | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ◌ (c) |  [focusable] | K10 | Y |
| 79 | sidebar-left | Brush | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ⬤ (c) |  [focusable] | K10 | Y |
| 80 | sidebar-left | Brush | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ■ (c) |  [focusable] | K10 | Y |
| 81 | sidebar-left | Brush | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ▬ (c) |  [focusable] | K10 | Y |
| 82 | sidebar-left | Brush | #brushTipFoldBody > div.brush-tip-row:nth-of-type(1) > button.brush-t… | button | ◯ (c) |  [focusable] | K10 | Y |
| 83 | sidebar-left | Brush | button.brush-shape-add | button | ＋ (c) |  [focusable] | K10 | Y |
| 84 | sidebar-left | Brush | button.brush-shape-paste | button | Clipboard (c) |  [focusable] | K10 | Y |
| 85 | sidebar-left | Brush | div.brush-shapes-area > input | button |  (f) |  [focusable] | K27 | N |
| 86 | sidebar-left | Brush | #brushTipFoldBody > div.control-group:nth-of-type(3) > label | LabelText |  (c) |  | K03 | Y |
| 87 | sidebar-left | Brush | #brushTipTexture | slider | TEXTURE 100% (c) | disabled=true | K20 | Y |
| 88 | sidebar-left | Brush | #brushTipFoldBody > div.control-group:nth-of-type(4) > label | LabelText |  (c) |  | K03 | Y |
| 89 | sidebar-left | Brush | #brushAngle | slider | ANGLE 0° (c) |  [focusable] | K20 | Y |
| 90 | sidebar-left | Brush | div.brush-settings-panel > label.brush-section-label:nth-of-type(3) | LabelText |  (c) |  | K03 | Y |
| 91 | sidebar-left | Brush | div.brush-settings-panel > div.brush-mode-row:nth-of-type(8) > button… | button | On Move (c) |  [focusable] | K10 | Y |
| 92 | sidebar-left | Brush | div.brush-settings-panel > div.brush-mode-row:nth-of-type(8) > button… | button | Constant (c) |  [focusable] | K10 | Y |
| 93 | sidebar-left | Brush | div.brush-settings-panel > div.control-group:nth-of-type(9) > label | LabelText | Spacing 1.0% (f) |  | K03 | N |
| 94 | sidebar-left | Brush | #brushSpacing | slider | Spacing 1.0% (f) |  [focusable] | K20 | N |
| 95 | sidebar-left | Brush | div.brush-settings-panel > div.control-group:nth-of-type(10) > label | LabelText |  (c) |  | K03 | Y |
| 96 | sidebar-left | Brush | #brushDabInterval | slider | INTERVAL 4 ms · 250/s (c) |  [focusable] | K20 | Y |
| 97 | sidebar-left | Brush | div.brush-settings-panel > div.control-group:nth-of-type(11) > label | LabelText |  (c) |  | K03 | Y |
| 98 | sidebar-left | Brush | #brushFlow | slider | FLOW 100% (c) |  [focusable] | K20 | Y |
| 99 | sidebar-left | Brush | div.brush-settings-panel > div.control-group:nth-of-type(12) > label | LabelText |  (c) |  | K03 | Y |
| 100 | sidebar-left | Brush | #brushJitter | slider | JITTER 0% (c) |  [focusable] | K20 | Y |
| 101 | sidebar-left | Multi-Brush | div.lsb-body > div.sidebar-section:nth-of-type(2) | generic | Multi-Brush (f) |  | K01 | Y |
| 102 | sidebar-left | Multi-Brush | div.lsb-body > div.sidebar-section:nth-of-type(2) > div.section-heade… | button [r] | MULTI-BRUSH (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 103 | sidebar-left | Multi-Brush | div.lsb-body > div.sidebar-section:nth-of-type(2) > div.section-body:… | generic |  (c) |  | K01 | Y |
| 104 | sidebar-left | Multi-Brush | #multiplier | slider | Multi-Brush (c) |  [focusable] | K20 | Y |
| 105 | sidebar-left | Multi-Brush | #symmetryModeGroup > label | LabelText |  (c) |  | K03 | Y |
| 106 | sidebar-left | Multi-Brush | #symmetryMode | combobox | SYMMETRY (c) |  [focusable] | K28 | Y |
| 107 | sidebar-left | Multi-Brush | #symmetrySameAngle | checkbox | Same angle on every arm (c) | checked=false [focusable] | K21 | Y |
| 108 | sidebar-left | Multi-Brush | #symmetrySameAngleGroup > label | LabelText | Same angle on every arm (f) |  | K03 | Y |
| 109 | sidebar-left | Multi-Brush | #symmetryFaceCenter | checkbox | Stay oriented to the center (c) | checked=false [focusable] | K21 | Y |
| 110 | sidebar-left | Multi-Brush | #symmetryFaceCenterGroup > label | LabelText | Stay oriented to the center (f) |  | K03 | Y |
| 111 | sidebar-left | Multi-Brush | #symmetryHoldGroup > label | LabelText | Strength of symmetry assist force near center o… (c) |  | K03 | Y |
| 112 | sidebar-left | Multi-Brush | #symmetryHold | slider | HOLD SYMMETRY 0.00 (c) |  [focusable] | K20 | Y |
| 113 | sidebar-left | Multi-Brush | input.arm-picker | ColorWell | Arm 1 color (c) |  [focusable] | K26 | Y |
| 114 | sidebar-left | Multi-Brush | div.arm-mode-wrap | radiogroup [r] | Arm 1 color (c) |  | K01 | Y |
| 115 | sidebar-left | Multi-Brush | div.arm-mode-wrap > button.brush-mode-btn:nth-of-type(1) | radio [r] | Main (c) | checked=false [focusable] | K37 | Y |
| 116 | sidebar-left | Multi-Brush | div.arm-mode-wrap > button.brush-mode-btn:nth-of-type(2) | radio [r] | Custom (c) | checked=false [focusable] | K37 | Y |
| 117 | sidebar-left | Multi-Brush | div.arm-mode-wrap > button.brush-mode-btn:nth-of-type(3) | radio [r] | Random (c) | checked=true [focusable] | K37 | Y |
| 118 | sidebar-left | Multi-Brush | div.arm-mode-wrap > button.brush-mode-btn:nth-of-type(4) | radio [r] | Palette (c) | checked=false [focusable] | K37 | Y |
| 119 | sidebar-left | Multi-Brush | button.arm-push-btn | checkbox [r] | Pressure (c) | checked=false [focusable] | K38 | Y |
| 120 | sidebar-left | Multi-Brush | button.arm-tip-btn | button | Brush 1 tip: same as the brush (c) | haspopup=menu [focusable] | K15 | Y |
| 121 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) | generic | Stroke and replay (f) |  | K01 | Y |
| 122 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-heade… | button [r] | STROKE AND REPLAY (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 123 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | Controls for left mouse, right mouse, and mouse… (c) |  | K03 | Y |
| 124 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | normal brush with settings from the brush panel (c) |  | K03 | Y |
| 125 | sidebar-left | Stroke and replay | #buttonMode_left | combobox | LEFT CLICK (c) |  [focusable] | K28 | Y |
| 126 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ↔ (f) |  [focusable] | K10 | N |
| 127 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ↕ (f) |  [focusable] | K10 | N |
| 128 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ✛ (f) |  [focusable] | K10 | N |
| 129 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ◌ (f) |  [focusable] | K10 | N |
| 130 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ⬤ (f) |  [focusable] | K10 | N |
| 131 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ■ (f) |  [focusable] | K10 | N |
| 132 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ▬ (f) |  [focusable] | K10 | N |
| 133 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ◯ (f) |  [focusable] | K10 | N |
| 134 | sidebar-left | Stroke and replay | #altSizeOn_left | checkbox | Own size (f) | checked=false [focusable] | K21 | N |
| 135 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | Own size (f) |  | K03 | N |
| 136 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | slider |  (f) |  [focusable] | K20 | N |
| 137 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Copy brush (f) |  [focusable] | K10 | N |
| 138 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Tip only (f) |  [focusable] | K10 | N |
| 139 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Edit the menu (f) |  [focusable] | K10 | N |
| 140 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | Trigger replay with settings from the Replay Mo… (c) |  | K03 | Y |
| 141 | sidebar-left | Stroke and replay | #buttonMode_right | combobox | RIGHT CLICK (c) |  [focusable] | K28 | Y |
| 142 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ↔ (f) |  [focusable] | K10 | N |
| 143 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ↕ (f) |  [focusable] | K10 | N |
| 144 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ✛ (f) |  [focusable] | K10 | N |
| 145 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ◌ (f) |  [focusable] | K10 | N |
| 146 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ⬤ (f) |  [focusable] | K10 | N |
| 147 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ■ (f) |  [focusable] | K10 | N |
| 148 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ▬ (f) |  [focusable] | K10 | N |
| 149 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ◯ (f) |  [focusable] | K10 | N |
| 150 | sidebar-left | Stroke and replay | #altSizeOn_right | checkbox | Own size (f) | checked=false [focusable] | K21 | N |
| 151 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | Own size (f) |  | K03 | N |
| 152 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | slider |  (f) |  [focusable] | K20 | N |
| 153 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Copy brush (f) |  [focusable] | K10 | N |
| 154 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Tip only (f) |  [focusable] | K10 | N |
| 155 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Edit the menu (f) |  [focusable] | K10 | N |
| 156 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | Opens the radial menu at the pointer (c) |  | K03 | Y |
| 157 | sidebar-left | Stroke and replay | #buttonMode_middle | combobox | MIDDLE CLICK (MOUSE 3) (c) |  [focusable] | K28 | Y |
| 158 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ↔ (f) |  [focusable] | K10 | N |
| 159 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ↕ (f) |  [focusable] | K10 | N |
| 160 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ✛ (f) |  [focusable] | K10 | N |
| 161 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ◌ (f) |  [focusable] | K10 | N |
| 162 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ⬤ (f) |  [focusable] | K10 | N |
| 163 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ■ (f) |  [focusable] | K10 | N |
| 164 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ▬ (f) |  [focusable] | K10 | N |
| 165 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | ◯ (f) |  [focusable] | K10 | N |
| 166 | sidebar-left | Stroke and replay | #altSizeOn_middle | checkbox | Own size (f) | checked=false [focusable] | K21 | N |
| 167 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | Own size (f) |  | K03 | N |
| 168 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | slider |  (f) |  [focusable] | K20 | N |
| 169 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Copy brush (f) |  [focusable] | K10 | N |
| 170 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Tip only (f) |  [focusable] | K10 | N |
| 171 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Edit the menu (c) |  [focusable] | K10 | Y |
| 172 | sidebar-left | Stroke and replay | div.stroke-lock-block > label.brush-section-label | LabelText | Allows locking to the brush's current radius, o… (c) |  | K03 | Y |
| 173 | sidebar-left | Stroke and replay | div.stroke-lock-block > div.hk-row:nth-of-type(1) > div.hk-picker:nth… | button | Set key (c) | pressed=false [focusable] | K11 | Y |
| 174 | sidebar-left | Stroke and replay | div.stroke-lock-block > div.hk-row:nth-of-type(1) > div.hk-picker:nth… | button | Remove this hotkey (f) | hidden=true [focusable] | K10 | N |
| 175 | sidebar-left | Stroke and replay | div.stroke-lock-block > div.hk-row:nth-of-type(2) > div.hk-picker:nth… | button | Set key (c) | pressed=false [focusable] | K11 | Y |
| 176 | sidebar-left | Stroke and replay | div.stroke-lock-block > div.hk-row:nth-of-type(2) > div.hk-picker:nth… | button | Remove this hotkey (f) | hidden=true [focusable] | K10 | N |
| 177 | sidebar-left | Stroke and replay | #strokeLockGuides | checkbox | Show guides (c) | checked=false [focusable] | K21 | Y |
| 178 | sidebar-left | Stroke and replay | div.stroke-lock-block > div.control-group:nth-of-type(4) > label | LabelText | Shows the guide-lines for the angle / radius lo… (c) |  | K03 | Y |
| 179 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText |  (c) |  | K03 | Y |
| 180 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Stroke (c) |  [focusable] | K10 | Y |
| 181 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | button | Time (c) |  [focusable] | K10 | Y |
| 182 | sidebar-left | Stroke and replay | div.brush-time-group > label.brush-section-label | LabelText | Replay Period (f) |  | K03 | N |
| 183 | sidebar-left | Stroke and replay | #replayTimePeriod | spinbutton |  (f) |  [focusable] | K24 | N |
| 184 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText |  (c) |  | K03 | Y |
| 185 | sidebar-left | Stroke and replay | #replaySpeed | slider | REPLAY SPEED 1× (c) |  [focusable] | K20 | Y |
| 186 | sidebar-left | Stroke and replay | #preserveRandomness | checkbox | Preserve Randomness (c) | checked=false [focusable] | K21 | Y |
| 187 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText | Recorded strokes stay random, unchecked keeps t… (c) |  | K03 | Y |
| 188 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText |  (c) |  | K03 | Y |
| 189 | sidebar-left | Stroke and replay | #splatInMode | combobox |  (c) |  [focusable] | K28 | Y |
| 190 | sidebar-left | Stroke and replay | #splatInDist | slider |  (f) | disabled=true | K20 | N |
| 191 | sidebar-left | Stroke and replay | div.lsb-body > div.sidebar-section:nth-of-type(3) > div.section-body:… | LabelText |  (c) |  | K03 | Y |
| 192 | sidebar-left | Stroke and replay | #splatOutMode | combobox |  (c) |  [focusable] | K28 | Y |
| 193 | sidebar-left | Stroke and replay | #splatOutDist | slider |  (f) | disabled=true | K20 | N |
| 194 | sidebar-left |  | div.lsb-rail > button.lsb-rail-label:nth-of-type(1) | button | Brush (f) |  [focusable] | K10 | N |
| 195 | sidebar-left |  | div.lsb-rail > button.lsb-rail-label:nth-of-type(2) | button | Brush (f) |  [focusable] | K10 | N |
| 196 | sidebar-left |  | div.lsb-rail > button.lsb-rail-label:nth-of-type(3) | button | Multi-Brush (f) |  [focusable] | K10 | N |
| 197 | sidebar-left |  | div.lsb-rail > button.lsb-rail-label:nth-of-type(4) | button | Stroke and replay (f) |  [focusable] | K10 | N |
| 198 | main-area |  | button.lsb-toggle | button | Left-facing sideways arrows icon: collapses the… (c) | expanded=true [focusable] | K16 | Y |
| 199 | canvas-area |  | #statsCloseBtn | button | ✕ (f) |  [focusable] | K10 | N |
| 200 | canvas-area |  | div.stats-content > div.stats-section:nth-of-type(1) > div.stat-row:n… | LabelText | Adaptive Quality: (f) |  | K03 | N |
| 201 | canvas-area |  | #governorToggle | checkbox | Adaptive Quality: (f) | checked=true [focusable] | K21 | N |
| 202 | canvas-area |  | div.stats-content > div.stats-section:nth-of-type(1) > div.stat-row:n… | LabelText | Resolution Tiers: (f) |  | K03 | N |
| 203 | canvas-area |  | #governorAllowRes | checkbox | Resolution Tiers: (f) | checked=true [focusable] | K21 | N |
| 204 | canvas-area |  | div.stats-content > div.stats-section:nth-of-type(1) > div.stat-row:n… | LabelText | Effect Shedding: (f) |  | K03 | N |
| 205 | canvas-area |  | #governorAllowFx | checkbox | Effect Shedding: (f) | checked=false [focusable] | K21 | N |
| 206 | canvas-area |  | div.stats-content > div.stats-section:nth-of-type(1) > div.stat-row:n… | LabelText | Release VRAM When Hidden: (f) |  | K03 | N |
| 207 | canvas-area |  | #idleVramToggle | checkbox | Release VRAM When Hidden: (f) | checked=false [focusable] | K21 | N |
| 208 | main-area |  | button.rsb-toggle | button | Right Facing sideways arrows icon: collapses th… (f) | expanded=true [focusable] | K16 | N |
| 209 | sidebar-right |  | div.rsb-rail > button.rsb-rail-label:nth-of-type(1) | button | Controls (f) |  [focusable] | K10 | N |
| 210 | sidebar-right |  | div.rsb-rail > button.rsb-rail-label:nth-of-type(2) | button | Color (f) |  [focusable] | K10 | N |
| 211 | sidebar-right |  | div.rsb-rail > button.rsb-rail-label:nth-of-type(3) | button | Presets (f) |  [focusable] | K10 | N |
| 212 | sidebar-right |  | div.rsb-rail > button.rsb-rail-label:nth-of-type(4) | button | Together (f) |  [focusable] | K10 | N |
| 213 | sidebar-right | Swirl Together | #sidebar-right > div.sidebar-section:nth-of-type(2) | generic | Swirl Together (f) |  | K01 | Y |
| 214 | sidebar-right | Swirl Together | #sidebar-right > div.sidebar-section:nth-of-type(2) > div.section-hea… | button [r] | SWIRL TOGETHER (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 215 | sidebar-right | Swirl Together | #createRoomBtn | button | Start a room (c) |  [focusable] | K10 | Y |
| 216 | sidebar-right | Swirl Together | #strangerBtn | button | Stranger (c) |  [focusable] | K10 | Y |
| 217 | sidebar-right | Swirl Together | #joinRoomInput | textbox | Room code to join (c) |  [focusable] | K25 | Y |
| 218 | sidebar-right | Swirl Together | #joinRoomBtn | button | Join (c) |  [focusable] | K10 | Y |
| 219 | sidebar-right | Swirl Together | #phonePadBtn | button | Sync phone (c) |  [focusable] | K10 | Y |
| 220 | sidebar-right | Swirl Together | #shareLookBtn | button | Link to current settings (c) |  [focusable] | K10 | Y |
| 221 | sidebar-right | Swirl Together | #mpError | alert [r] |  (f) |  | K02 | N |
| 222 | sidebar-right | Swirl Together | #reconnectBtn | button | Reconnect (f) |  [focusable] | K10 | N |
| 223 | sidebar-right | Swirl Together | #multiplayerStatus | status [r] | Connecting… (f) |  | K02 | N |
| 224 | sidebar-right | Swirl Together | #mpInviteBtn | button | Invite ▾ (f) | expanded=false haspopup=dialog [focusable] | K12 | N |
| 225 | sidebar-right | Swirl Together | #mpMenuBtn | button | Room options (f) | expanded=false haspopup=menu [focusable] | K12 | N |
| 226 | sidebar-right | Swirl Together | #disconnectBtn | button | Leave (f) |  [focusable] | K10 | N |
| 227 | sidebar-right | Swirl Together | #multiplayerToggle | checkbox |  (f) | checked=false [focusable] | K21 | N |
| 228 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) | generic | Simulation (f) |  | K01 | Y |
| 229 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-hea… | button [r] | SIMULATION (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 230 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText |  (c) |  | K03 | Y |
| 231 | sidebar-right | Simulation | #fpsCap | combobox | FPS LIMIT (c) |  [focusable] | K28 | Y |
| 232 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText |  (c) |  | K03 | Y |
| 233 | sidebar-right | Simulation | #pressureDissipation | slider | PRESSURE DISSIPATION 0.950 (c) |  [focusable] | K20 | Y |
| 234 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText |  (c) |  | K03 | Y |
| 235 | sidebar-right | Simulation | #pressureIteration | slider | PRESSURE ITERATION 25 (c) |  [focusable] | K20 | Y |
| 236 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText | 0 = off (pure fluidity). Higher = more paint-li… (c) |  | K03 | Y |
| 237 | sidebar-right | Simulation | #wetInfluence | slider | DRYING 0.14 (c) |  [focusable] | K20 | Y |
| 238 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText | Drying time in seconds for wet paint to set. Lo… (c) |  | K03 | Y |
| 239 | sidebar-right | Simulation | #wetDrying | slider | DRY TIME 4.5s (c) |  [focusable] | K20 | Y |
| 240 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText | Smooths the finest grain out of paint while it … (c) |  | K03 | Y |
| 241 | sidebar-right | Simulation | #grainCleanup | slider | GRAIN CLEANUP 0.75 (c) |  [focusable] | K20 | Y |
| 242 | sidebar-right | Simulation | #macCormackToggle | checkbox | Crisp Advection (c) | checked=true [focusable] | K21 | Y |
| 243 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText | Adds MacCormack passes to Pavel's original shad… (c) |  | K03 | Y |
| 244 | sidebar-right | Simulation | #multigridToggle | checkbox | Multigrid Pressure (c) | checked=true [focusable] | K21 | Y |
| 245 | sidebar-right | Simulation | #sidebar-right > div.sidebar-section:nth-of-type(3) > div.section-bod… | LabelText | Adds options to fiddle with Pavel's original sh… (c) |  | K03 | Y |
| 246 | sidebar-right | Simulation | #multigridPanel > div.control-group:nth-of-type(1) > label | LabelText | Allows you to set how many down and back trips … (c) |  | K03 | Y |
| 247 | sidebar-right | Simulation | #mgCycles | slider | V-CYCLES 2 (c) |  [focusable] | K20 | Y |
| 248 | sidebar-right | Simulation | #multigridPanel > div.control-group:nth-of-type(2) > label | LabelText | Smoother sweeps before pushing the residual dow… (c) |  | K03 | Y |
| 249 | sidebar-right | Simulation | #mgPre | slider | PRE-SMOOTH 2 (c) |  [focusable] | K20 | Y |
| 250 | sidebar-right | Simulation | #multigridPanel > div.control-group:nth-of-type(3) > label | LabelText | Smoother sweeps after the coarse correction is … (c) |  | K03 | Y |
| 251 | sidebar-right | Simulation | #mgPost | slider | POST-SMOOTH 2 (c) |  [focusable] | K20 | Y |
| 252 | sidebar-right | Simulation | #multigridPanel > div.control-group:nth-of-type(4) > label | LabelText | Jacobi sweeps standing in for an exact solve on… (c) |  | K03 | Y |
| 253 | sidebar-right | Simulation | #mgCoarse | slider | COARSE SOLVE 8 (c) |  [focusable] | K20 | Y |
| 254 | sidebar-right | Simulation | #multigridPanel > div.control-group:nth-of-type(5) > label | LabelText | How much of each sweep’s change to keep. 1.0 ke… (c) |  | K03 | Y |
| 255 | sidebar-right | Simulation | #mgRelax | slider | RELAXATION 1.00 (c) |  [focusable] | K20 | Y |
| 256 | sidebar-right | Colors and palettes | #sidebar-right > div.sidebar-section:nth-of-type(4) | generic | Colors and palettes (f) |  | K01 | Y |
| 257 | sidebar-right | Colors and palettes | #sidebar-right > div.sidebar-section:nth-of-type(4) > div.section-hea… | button [r] | COLORS AND PALETTES (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 258 | sidebar-right | Colors and palettes | label.palette-label | LabelText |  (c) |  | K03 | Y |
| 259 | sidebar-right | Colors and palettes | #paletteSelect | combobox [r] | Palette (c) | expanded=false haspopup=listbox tabindex=0 [focusable] | K32 | Y |
| 260 | sidebar-right | Colors and palettes | #palettePreview > div.palette-chip-wrap:nth-of-type(1) > div.palette-… | button [r] | #2C5F2D (c) | tabindex=0 [focusable] | K33 | Y |
| 261 | sidebar-right | Colors and palettes | #palettePreview > div.palette-chip-wrap:nth-of-type(2) > div.palette-… | button [r] | #4A7856 (c) | tabindex=-1 | K33 | Y |
| 262 | sidebar-right | Colors and palettes | #palettePreview > div.palette-chip-wrap:nth-of-type(3) > div.palette-… | button [r] | #8B4513 (c) | tabindex=-1 | K33 | Y |
| 263 | sidebar-right | Colors and palettes | #palettePreview > div.palette-chip-wrap:nth-of-type(4) > div.palette-… | button [r] | #FFD700 (c) | tabindex=-1 | K33 | Y |
| 264 | sidebar-right | Colors and palettes | #palettePreview > div.palette-chip-wrap:nth-of-type(5) > div.palette-… | button [r] | #F0EAD6 (c) | tabindex=-1 | K33 | Y |
| 265 | sidebar-right | Colors and palettes | #paletteAddChip | button | + (c) | expanded=false [focusable] | K10 | Y |
| 266 | sidebar-right | Colors and palettes | #paletteNote | status [r] |  (f) | live=polite hidden=true | K02 | N |
| 267 | sidebar-right | Colors and palettes | div.palette-actions > button.btn--ghost:nth-of-type(1) | button | Export this (c) |  [focusable] | K10 | Y |
| 268 | sidebar-right | Colors and palettes | div.palette-actions > button.btn--ghost:nth-of-type(2) | button | Export all (c) |  [focusable] | K10 | Y |
| 269 | sidebar-right | Colors and palettes | div.palette-actions > button.btn--ghost:nth-of-type(3) | button | Import (c) |  [focusable] | K10 | Y |
| 270 | sidebar-right | Colors and palettes | #paletteFluidFile | button |  (f) |  [focusable] | K27 | N |
| 271 | sidebar-right | Layers | div.section-layers | generic | Layers (f) |  | K01 | Y |
| 272 | sidebar-right | Layers | div.section-layers > div.section-header:nth-of-type(1) > span.section… | button [r] | LAYERS (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 273 | sidebar-right | Layers | div.section-layers > div.section-body:nth-of-type(2) > input:nth-of-t… | button |  (f) |  [focusable] | K27 | N |
| 274 | sidebar-right | Layers | #uploadBtn | button | Import (c) |  [focusable] | K10 | Y |
| 275 | sidebar-right | Layers | #captureBtn | button | Visible to layer (c) |  [focusable] | K10 | Y |
| 276 | sidebar-right | Layers | #flattenLayersBtn | button | Flatten (c) |  [focusable] | K10 | Y |
| 277 | sidebar-right | Layers | #addCollisionLayerBtn | button | Collider (c) |  [focusable] | K10 | Y |
| 278 | sidebar-right | Layers | div.collision-source-menu > button:nth-of-type(1) | button | From Image (f) |  [focusable] | K10 | N |
| 279 | sidebar-right | Layers | div.collision-source-menu > button:nth-of-type(2) | button | From Canvas (f) |  [focusable] | K10 | N |
| 280 | sidebar-right | Layers | input.layer-title | textbox |  (c) | readOnly=true [focusable] | K25 | Y |
| 281 | sidebar-right | Layers | label.layer-vis | LabelText | Show or hide this layer (c) |  | K03 | Y |
| 282 | sidebar-right | Layers | input.layer-vis-check | checkbox | Show or hide this layer (c) | checked=true [focusable] | K21 | Y |
| 283 | sidebar-right | Layers | button.subsection-add-btn | button | + New Path (c) |  [focusable] | K10 | Y |
| 284 | sidebar-right | Layers | button.path-empty-create | button | + Create Path Layer (c) |  [focusable] | K10 | Y |
| 285 | sidebar-right | Layers | #hoverCaptureToggle | checkbox | Enable Capture on Hover (c) | checked=false [focusable] | K21 | Y |
| 286 | sidebar-right | Layers | div.layers-options-group > div.control-group:nth-of-type(2) > label | LabelText | Enable Capture on Hover (f) |  | K03 | Y |
| 287 | sidebar-right | Layers | #detachCaptureToggle | checkbox | Detach Capture Area (c) | checked=false [focusable] | K21 | Y |
| 288 | sidebar-right | Layers | div.layers-options-group > div.control-group:nth-of-type(3) > label | LabelText | Detach Capture Area (f) |  | K03 | Y |
| 289 | sidebar-right | Layers | #showPreviewLayersCb | checkbox | Show Preview Layers (c) | checked=false [focusable] | K21 | Y |
| 290 | sidebar-right | Layers | div.layers-options-group > div.checkbox-group:nth-of-type(4) > label | LabelText | Show Preview Layers (f) |  | K03 | Y |
| 291 | sidebar-right | Layers | #imageUpload | button |  (f) |  [focusable] | K27 | N |
| 292 | sidebar-right | Mutate shader | #mutation-section | generic |  (c) |  | K01 | Y |
| 293 | sidebar-right | Mutate shader | #mutation-section > div.section-header:nth-of-type(1) > span.section-… | button [r] | MUTATE SHADER (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 294 | sidebar-right | Mutate shader | div.mutation-controls > div.mutation-field:nth-of-type(1) > label | LabelText |  (c) |  | K03 | Y |
| 295 | sidebar-right | Mutate shader | div.mutation-scope-seg > button.ch-text-toggle:nth-of-type(1) | button | Basic (c) |  [focusable] | K10 | Y |
| 296 | sidebar-right | Mutate shader | div.mutation-scope-seg > button.ch-text-toggle:nth-of-type(2) | button | All (c) |  [focusable] | K10 | Y |
| 297 | sidebar-right | Mutate shader | #mutationScope | combobox |  (f) | hidden=true tabindex=-1 | K22 | Y |
| 298 | sidebar-right | Mutate shader | div.mutation-controls > div.control-group:nth-of-type(2) > label | LabelText |  (c) |  | K03 | Y |
| 299 | sidebar-right | Mutate shader | #mutationStrength | slider | Strength of mutate, larger creates wider swings… (c) |  [focusable] | K20 | Y |
| 300 | sidebar-right | Mutate shader | div.mutation-controls > div.mutation-field:nth-of-type(3) > label | LabelText |  (c) |  | K03 | Y |
| 301 | sidebar-right | Mutate shader | #mutationCount | combobox |  (c) |  [focusable] | K28 | Y |
| 302 | sidebar-right | Mutate shader | #mutationGenerate | button | Mutate M (c) |  [focusable] | K10 | Y |
| 303 | sidebar-right | Mutate shader | #mutationUndo | button | ← Undo (c) | disabled=true | K10 | Y |
| 304 | sidebar-right | Mutate shader | #mutationRedo | button | Redo → (c) | disabled=true | K10 | Y |
| 305 | sidebar-right | Mutate shader | #mutationReset | button | Reset (c) |  [focusable] | K10 | Y |
| 306 | sidebar-right | Mutate shader | label.mutation-locks-label | LabelText |  (c) |  | K03 | Y |
| 307 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(2) | LabelText | Colors (f) |  | K03 | Y |
| 308 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(2) > input.… | checkbox | Colors (c) | checked=false [focusable] | K21 | Y |
| 309 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(3) | LabelText | Kaleido (f) |  | K03 | Y |
| 310 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(3) > input.… | checkbox | Kaleido (c) | checked=false [focusable] | K21 | Y |
| 311 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(4) | LabelText | Sim (f) |  | K03 | Y |
| 312 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(4) > input.… | checkbox | Sim (c) | checked=false [focusable] | K21 | Y |
| 313 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(5) | LabelText | Effects (f) |  | K03 | Y |
| 314 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(5) > input.… | checkbox | Effects (c) | checked=false [focusable] | K21 | Y |
| 315 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(6) | LabelText | Audio (f) |  | K03 | Y |
| 316 | sidebar-right | Mutate shader | div.mutation-locks > label.mutation-lock-chip:nth-of-type(6) > input.… | checkbox | Audio (c) | checked=false [focusable] | K21 | Y |
| 317 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) | generic | Effects (f) |  | K01 | Y |
| 318 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-hea… | button [r] | EFFECTS (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 319 | sidebar-right | Effects | div.fx-cluster > div.control-group:nth-of-type(1) > span.fx-thumb:nth… | image [r] | Preview Light Source (c) | tabindex=0 [focusable] | K34 | Y |
| 320 | sidebar-right | Effects | #enableLighting | checkbox | Light Source (c) | checked=false [focusable] | K21 | Y |
| 321 | sidebar-right | Effects | div.fx-cluster > div.control-group:nth-of-type(1) > label | LabelText | Light Source (f) |  | K03 | Y |
| 322 | sidebar-right | Effects | #lightSourceControls > div.control-group:nth-of-type(1) > label | LabelText | Mode (f) |  | K03 | N |
| 323 | sidebar-right | Effects | #lightMode | combobox |  (f) |  [focusable] | K28 | N |
| 324 | sidebar-right | Effects | #lightSpeedControl > label | LabelText | Speed 0.50 (f) |  | K03 | N |
| 325 | sidebar-right | Effects | #lightSpeed | slider |  (f) |  [focusable] | K20 | N |
| 326 | sidebar-right | Effects | #lightSourceControls > div.control-group:nth-of-type(4) > label | LabelText | Intensity 0.50 (f) |  | K03 | N |
| 327 | sidebar-right | Effects | #lightIntensity | slider |  (f) |  [focusable] | K20 | N |
| 328 | sidebar-right | Effects | #lightSourceControls > div.control-group:nth-of-type(5) > label | LabelText | Ambient 0.30 (f) |  | K03 | N |
| 329 | sidebar-right | Effects | #lightAmbient | slider |  (f) |  [focusable] | K20 | N |
| 330 | sidebar-right | Effects | div.fx-cluster > div.control-group:nth-of-type(3) > span.fx-thumb:nth… | image [r] | Preview Light Shift (c) | tabindex=0 [focusable] | K34 | Y |
| 331 | sidebar-right | Effects | #enableLightShift | checkbox | Light Shift (c) | checked=false [focusable] | K21 | Y |
| 332 | sidebar-right | Effects | div.fx-cluster > div.control-group:nth-of-type(3) > label | LabelText | Light Shift (f) |  | K03 | Y |
| 333 | sidebar-right | Effects | #lightShiftControls > div:nth-of-type(1) > label | LabelText | Draw a path through colors (f) |  | K03 | N |
| 334 | sidebar-right | Effects | #lightShiftControls > div.control-group:nth-of-type(3) > label | LabelText | Blend Mode (f) |  | K03 | N |
| 335 | sidebar-right | Effects | #lightShiftMode | combobox | Replaces overblown/white areas with the shift c… (f) |  [focusable] | K28 | N |
| 336 | sidebar-right | Effects | #lightShiftControls > div.control-group:nth-of-type(4) > label | LabelText | Speed 0.50 (f) |  | K03 | N |
| 337 | sidebar-right | Effects | #lightShiftSpeed | slider |  (f) |  [focusable] | K20 | N |
| 338 | sidebar-right | Effects | #lightShiftControls > div.control-group:nth-of-type(5) > label | LabelText | Threshold 0.85 (f) |  | K03 | N |
| 339 | sidebar-right | Effects | #lightShiftThreshold | slider |  (f) |  [focusable] | K20 | N |
| 340 | sidebar-right | Effects | #lightShiftControls > div.control-group:nth-of-type(6) > label | LabelText | Intensity 0.50 (f) |  | K03 | N |
| 341 | sidebar-right | Effects | #lightShiftIntensity | slider |  (f) |  [focusable] | K20 | N |
| 342 | sidebar-right | Effects | #lightShiftControls > div.control-group:nth-of-type(7) > label | LabelText | Saturation 1.00 (f) |  | K03 | N |
| 343 | sidebar-right | Effects | #lightShiftSaturation | slider |  (f) |  [focusable] | K20 | N |
| 344 | sidebar-right | Effects | #clearLightShiftPath | button | Clear Path (f) |  [focusable] | K10 | N |
| 345 | sidebar-right | Effects | div.fx-cluster > div.control-group:nth-of-type(5) > span.fx-thumb:nth… | image [r] | Preview Glow (c) | tabindex=0 [focusable] | K34 | Y |
| 346 | sidebar-right | Effects | #glowToggle | checkbox | Glow (c) | checked=false [focusable] | K21 | Y |
| 347 | sidebar-right | Effects | div.fx-cluster > div.control-group:nth-of-type(5) > label | LabelText | Glow (f) |  | K03 | Y |
| 348 | sidebar-right | Effects | #glowPanel > div.control-group:nth-of-type(1) > label | LabelText | Intensity 0.800 (f) |  | K03 | N |
| 349 | sidebar-right | Effects | #glowIntensity | slider | Intensity 0.800 (f) |  [focusable] | K20 | N |
| 350 | sidebar-right | Effects | #glowPanel > div.control-group:nth-of-type(2) > label | LabelText | Threshold 0.60 (f) |  | K03 | N |
| 351 | sidebar-right | Effects | #glowThreshold | slider | Threshold 0.60 (f) |  [focusable] | K20 | N |
| 352 | sidebar-right | Effects | #glowPanel > div.control-group:nth-of-type(3) > span.fx-thumb:nth-of-… | img [r] | Preview Scatter (f) | tabindex=0 [focusable] | K34 | N |
| 353 | sidebar-right | Effects | #scatterToggle | checkbox | Scatter (f) | checked=false [focusable] | K21 | N |
| 354 | sidebar-right | Effects | #glowPanel > div.control-group:nth-of-type(3) > label | LabelText | Scatter (f) |  | K03 | N |
| 355 | sidebar-right | Effects | #scatterPanel > div.control-group:nth-of-type(1) > label | LabelText | Amount 0.50 (f) |  | K03 | N |
| 356 | sidebar-right | Effects | #scatterAmount | slider | Amount 0.50 (f) |  [focusable] | K20 | N |
| 357 | sidebar-right | Effects | #scatterPanel > div.control-group:nth-of-type(2) > label | LabelText | Reach 1.00 (f) |  | K03 | N |
| 358 | sidebar-right | Effects | #scatterReach | slider | Reach 1.00 (f) |  [focusable] | K20 | N |
| 359 | sidebar-right | Effects | #scatterBlockToggle | checkbox | Colliders Block Light (f) | checked=true [focusable] | K21 | N |
| 360 | sidebar-right | Effects | #scatterPanel > div.control-group:nth-of-type(3) > label | LabelText | Colliders Block Light (f) |  | K03 | N |
| 361 | sidebar-right | Effects | #scatterPanel > div.control-group:nth-of-type(4) > label | LabelText | Source (f) |  | K03 | N |
| 362 | sidebar-right | Effects | #scatterSource | combobox | Source (f) |  [focusable] | K28 | N |
| 363 | sidebar-right | Effects | div.fx-group > div.control-group:nth-of-type(1) > span.fx-thumb:nth-o… | image [r] | Preview Surface Shading (c) | tabindex=0 [focusable] | K34 | Y |
| 364 | sidebar-right | Effects | #displayShadingToggle | checkbox | Surface Shading (c) | checked=false [focusable] | K21 | Y |
| 365 | sidebar-right | Effects | div.fx-group > div.control-group:nth-of-type(1) > label | LabelText | Surface Shading (f) |  | K03 | Y |
| 366 | sidebar-right | Effects | #shadingIntensityGroup > div.control-group:nth-of-type(1) > label | LabelText | Intensity 2.0 (f) |  | K03 | N |
| 367 | sidebar-right | Effects | #shadingIntensity | slider | Intensity 2.0 (f) |  [focusable] | K20 | N |
| 368 | sidebar-right | Effects | #shadingIntensityGroup > div.control-group:nth-of-type(2) > label | LabelText | Relief 0.10 (f) |  | K03 | N |
| 369 | sidebar-right | Effects | #shadeRelief | slider | Relief 0.10 (f) |  [focusable] | K20 | N |
| 370 | sidebar-right | Effects | #shadingIntensityGroup > div.control-group:nth-of-type(3) > label | LabelText | Gloss 0.05 (f) |  | K03 | N |
| 371 | sidebar-right | Effects | #shadeGloss | slider | Gloss 0.05 (f) |  [focusable] | K20 | N |
| 372 | sidebar-right | Effects | #shadingIntensityGroup > div.control-group:nth-of-type(4) > label | LabelText | Ridges 6.0 (f) |  | K03 | N |
| 373 | sidebar-right | Effects | #ridges | slider | Ridges 6.0 (f) |  [focusable] | K20 | N |
| 374 | sidebar-right | Effects | #shadingIntensityGroup > div.control-group:nth-of-type(5) > label | LabelText | Ridge Strength 2.0 (f) |  | K03 | N |
| 375 | sidebar-right | Effects | #sharpness | slider | Ridge Strength 2.0 (f) |  [focusable] | K20 | N |
| 376 | sidebar-right | Effects | #shadingIntensityGroup > div.control-group:nth-of-type(6) > label | LabelText | Vibrance 0.50 (f) |  | K03 | N |
| 377 | sidebar-right | Effects | #vibrance | slider | Vibrance 0.50 (f) |  [focusable] | K20 | N |
| 378 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image [r] | Preview Dither (c) | tabindex=0 [focusable] | K34 | Y |
| 379 | sidebar-right | Effects | #ditherToggle | checkbox | Dither (c) | checked=false [focusable] | K21 | Y |
| 380 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | LabelText | Dither (f) |  | K03 | Y |
| 381 | sidebar-right | Effects | #ditherPanel > div.control-group:nth-of-type(1) > label | LabelText | Pattern (f) |  | K03 | N |
| 382 | sidebar-right | Effects | #ditherPattern | combobox | Pattern (f) |  [focusable] | K28 | N |
| 383 | sidebar-right | Effects | #ditherPad | application [r] | Pattern pad, 16 by 16 squares. Arrow keys move,… (f) | tabindex=0 [focusable] | K35 | N |
| 384 | sidebar-right | Effects | #ditherPadInvert | button | Invert (f) |  [focusable] | K10 | N |
| 385 | sidebar-right | Effects | #ditherPadClear | button | Clear (f) |  [focusable] | K10 | N |
| 386 | sidebar-right | Effects | #ditherPanel > div.control-group:nth-of-type(3) > label | LabelText | Levels 4 (f) |  | K03 | N |
| 387 | sidebar-right | Effects | #ditherLevels | slider | Levels 4 (f) |  [focusable] | K20 | N |
| 388 | sidebar-right | Effects | #ditherPanel > div.control-group:nth-of-type(4) > label | LabelText | Size 2 px (f) |  | K03 | N |
| 389 | sidebar-right | Effects | #ditherSize | slider | Size 2 px (f) |  [focusable] | K20 | N |
| 390 | sidebar-right | Effects | #ditherPanel > div.control-group:nth-of-type(5) > label | LabelText | Color (f) |  | K03 | N |
| 391 | sidebar-right | Effects | #ditherTone | combobox | Color (f) |  [focusable] | K28 | N |
| 392 | sidebar-right | Effects | #ditherPanel > div.control-group:nth-of-type(6) > label | LabelText | Beat pulse 0% (f) |  | K03 | N |
| 393 | sidebar-right | Effects | #ditherPulse | slider | Beat pulse 0% (f) |  [focusable] | K20 | N |
| 394 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image [r] | Preview Gravity Direction (c) | tabindex=0 [focusable] | K34 | Y |
| 395 | sidebar-right | Effects | #pressureConstant | checkbox | Gravity Direction (c) | checked=false [focusable] | K21 | Y |
| 396 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | LabelText | Gravity Direction (f) |  | K03 | Y |
| 397 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image [r] | Preview Border (c) | tabindex=0 [focusable] | K34 | Y |
| 398 | sidebar-right | Effects | #overflowToggle | checkbox | Border (c) | checked=false [focusable] | K21 | Y |
| 399 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | LabelText | Border (f) |  | K03 | Y |
| 400 | sidebar-right | Effects | #overflowPanel > div.control-group > label | LabelText | Width 2.5% (f) |  | K03 | N |
| 401 | sidebar-right | Effects | #overflowBand | slider | Width 2.5% (f) |  [focusable] | K20 | N |
| 402 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | image [r] | Preview Breathing (c) | tabindex=0 [focusable] | K34 | Y |
| 403 | sidebar-right | Effects | #breathingToggle | checkbox | Breathing (c) | checked=false [focusable] | K21 | Y |
| 404 | sidebar-right | Effects | #sidebar-right > div.sidebar-section:nth-of-type(7) > div.section-bod… | LabelText | Breathing (f) |  | K03 | Y |
| 405 | sidebar-right | Effects | #breathingPanel > div.control-group:nth-of-type(1) > label | LabelText | Pattern (f) |  | K03 | N |
| 406 | sidebar-right | Effects | #breathPattern | combobox | Pattern (f) |  [focusable] | K28 | N |
| 407 | sidebar-right | Effects | #breathingPanel > div.control-group:nth-of-type(2) > label | LabelText | Swirl strength 50% (f) |  | K03 | N |
| 408 | sidebar-right | Effects | #breathStrength | slider | Swirl strength 50% (f) |  [focusable] | K20 | N |
| 409 | sidebar-right | Effects | #breathingPanel > div.control-group:nth-of-type(3) > label | LabelText | Color (f) |  | K03 | N |
| 410 | sidebar-right | Effects | #breathColorMode | combobox | Color (f) |  [focusable] | K28 | N |
| 411 | sidebar-right | Effects | #breathCueToggle | checkbox | Cue words (f) | checked=true [focusable] | K21 | N |
| 412 | sidebar-right | Effects | #breathingPanel > div.control-group:nth-of-type(4) > label | LabelText | Cue words (f) |  | K03 | N |
| 413 | sidebar-right | Animations | #sidebar-right > div.sidebar-section:nth-of-type(8) | generic | Animations (f) |  | K01 | Y |
| 414 | sidebar-right | Animations | #sidebar-right > div.sidebar-section:nth-of-type(8) > div.section-hea… | button [r] | ANIMATIONS (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 415 | sidebar-right | Animations | #recMiniRecordBtn | button | ●Record (c) |  [focusable] | K10 | Y |
| 416 | sidebar-right | Animations | #recMiniPauseBtn | button | ▶Play (c) | disabled=true | K10 | Y |
| 417 | sidebar-right | Animations | #recMiniStopBtn | button | ■Stop (c) | disabled=true | K10 | Y |
| 418 | sidebar-right | Animations | div.rec-strip-length > div.rec-strip-chips | group [r] | Length (c) |  | K01 | Y |
| 419 | sidebar-right | Animations | #recLen4 | button | 4 s (c) | pressed=false [focusable] | K11 | Y |
| 420 | sidebar-right | Animations | #recLen8 | button | 8 s (c) | pressed=true [focusable] | K11 | Y |
| 421 | sidebar-right | Animations | #recLen15 | button | 15 s (c) | pressed=false [focusable] | K11 | Y |
| 422 | sidebar-right | Animations | #recLen30 | button | 30 s (c) | pressed=false [focusable] | K11 | Y |
| 423 | sidebar-right | Animations | div.rec-strip-source > div.rec-strip-chips | group [r] | What a take records (c) |  | K01 | Y |
| 424 | sidebar-right | Animations | #recSrcMe | button | Local Only (c) | pressed=true [focusable] | K11 | Y |
| 425 | sidebar-right | Animations | #recSrcAll | button | Everything (c) | pressed=false [focusable] | K11 | Y |
| 426 | sidebar-right | Animations | #recKeepBtn | button | Keep (f) |  [focusable] | K10 | N |
| 427 | sidebar-right | Animations | #recDiscardBtn | button | Discard (f) |  [focusable] | K10 | N |
| 428 | sidebar-right | Animations | button.anim-lib-head | button | Saved Animations ▾ (c) | expanded=false [focusable] | K10 | Y |
| 429 | sidebar-right | Audio | #sidebar-right > div.sidebar-section:nth-of-type(9) | generic | Audio (f) |  | K01 | Y |
| 430 | sidebar-right | Audio | #sidebar-right > div.sidebar-section:nth-of-type(9) > div.section-hea… | button [r] | AUDIO (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 431 | sidebar-right | Audio | #sidebar-right > div.sidebar-section:nth-of-type(9) > div.section-bod… | LabelText |  (c) |  | K03 | Y |
| 432 | sidebar-right | Audio | #audioMode | combobox | AUDIO MODE (c) |  [focusable] | K28 | Y |
| 433 | sidebar-right | Audio | label.audio-mini-enable | LabelText | Enable (f) |  | K03 | N |
| 434 | sidebar-right | Audio | #audioReactToggle | checkbox | Enable (f) | checked=false [focusable] | K21 | N |
| 435 | sidebar-right | Audio | #audioReactSource | combobox |  (f) |  [focusable] | K28 | N |
| 436 | sidebar-right | Audio | #audioChooseTrack | button | Audio File (f) |  [focusable] | K10 | N |
| 437 | sidebar-right | Audio | #audioPlayBtn | button | ⏸ (f) |  [focusable] | K10 | N |
| 438 | sidebar-right | Audio | #audioRestartBtn | button | ⏮ (f) |  [focusable] | K10 | N |
| 439 | sidebar-right | Audio | #audioLoopBtn | button | 🔁 (f) |  [focusable] | K10 | N |
| 440 | sidebar-right | Audio | #audioSeek | slider | Draggable playhead for scrubbing (f) |  [focusable] | K20 | N |
| 441 | sidebar-right | Audio | #audioMuteBtn | button | 🔊 (f) |  [focusable] | K10 | N |
| 442 | sidebar-right | Audio | #audioVolume | slider | Playback volume (f) |  [focusable] | K20 | N |
| 443 | sidebar-right | Audio | #audioOpenFullBtn | button | ⬆️ Full Audio (f) |  [focusable] | K10 | N |
| 444 | sidebar-right | Audio | #audioReactFile | button |  (f) |  [focusable] | K27 | N |
| 445 | sidebar-right | Audio | #audioTimingToggle | checkbox | Visualize Audio Timing (c) | checked=false [focusable] | K21 | Y |
| 446 | sidebar-right | Audio | #sidebar-right > div.sidebar-section:nth-of-type(9) > div.section-bod… | LabelText | Visualize the track as descending bars for easy… (c) |  | K03 | Y |
| 447 | sidebar-right | Kaleidoscope | #sidebar-right > div.sidebar-section:nth-of-type(10) | generic | Kaleidoscope (f) |  | K01 | Y |
| 448 | sidebar-right | Kaleidoscope | #sidebar-right > div.sidebar-section:nth-of-type(10) > div.section-he… | button [r] | KALEIDOSCOPE (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 449 | sidebar-right | Kaleidoscope | #mandalaToggle | switch [r] | Mandala Overlay (c) | checked=false [focusable] | K21 | Y |
| 450 | sidebar-right | Kaleidoscope | #sidebar-right > div.sidebar-section:nth-of-type(10) > div.section-bo… | LabelText | Mandala Overlay (f) |  | K03 | Y |
| 451 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(1) > label | LabelText | Wedges 12 (f) |  | K03 | N |
| 452 | sidebar-right | Kaleidoscope | #mandalaWedges | slider | Wedges 12 (f) |  [focusable] | K20 | N |
| 453 | sidebar-right | Kaleidoscope | #mandalaConstrain | checkbox | Paint Only In Wedge (f) | checked=true [focusable] | K21 | N |
| 454 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(2) > label | LabelText | Paint Only In Wedge (f) |  | K03 | N |
| 455 | sidebar-right | Kaleidoscope | #mandalaHideGuides | checkbox | Hide Guides (f) | checked=false [focusable] | K21 | N |
| 456 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(3) > label | LabelText | Hide Guides (f) |  | K03 | N |
| 457 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(4) > label | LabelText | Fill (f) |  | K03 | N |
| 458 | sidebar-right | Kaleidoscope | #mandalaFill > label:nth-of-type(1) | LabelText | Off (f) |  | K03 | N |
| 459 | sidebar-right | Kaleidoscope | #mandalaFill > label:nth-of-type(1) > input | radio | Off (f) | checked=true [focusable] | K23 | N |
| 460 | sidebar-right | Kaleidoscope | #mandalaFill > label:nth-of-type(2) | LabelText | Fit (f) |  | K03 | N |
| 461 | sidebar-right | Kaleidoscope | #mandalaFill > label:nth-of-type(2) > input | radio | Fit (f) | checked=false [focusable] | K23 | N |
| 462 | sidebar-right | Kaleidoscope | #mandalaFill > label:nth-of-type(3) | LabelText | Full (f) |  | K03 | N |
| 463 | sidebar-right | Kaleidoscope | #mandalaFill > label:nth-of-type(3) > input | radio | Full (f) | checked=false [focusable] | K23 | N |
| 464 | sidebar-right | Kaleidoscope | #zoomModeToggle | checkbox | Zoom Mode (Z) (f) | checked=false [focusable] | K21 | N |
| 465 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(5) > label | LabelText | Zoom Mode (Z) (f) |  | K03 | N |
| 466 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(7) > label | LabelText | Density Sustain 0.9900 (f) |  | K03 | N |
| 467 | sidebar-right | Kaleidoscope | #mandalaDensity | slider | Density Sustain 0.9900 (f) |  [focusable] | K20 | N |
| 468 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(8) > label | LabelText | Motion Isolation 2.000 (f) |  | K03 | N |
| 469 | sidebar-right | Kaleidoscope | #mandalaIsolation | slider | Motion Isolation 2.000 (f) |  [focusable] | K20 | N |
| 470 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(9) > label | LabelText | Drying 1.00 (f) |  | K03 | N |
| 471 | sidebar-right | Kaleidoscope | #mandalaWet | slider | Drying 1.00 (f) |  [focusable] | K20 | N |
| 472 | sidebar-right | Kaleidoscope | #mandalaPanel > div.control-group:nth-of-type(10) > label | LabelText | Dry Time 0.5s (f) |  | K03 | N |
| 473 | sidebar-right | Kaleidoscope | #mandalaDryTime | slider | Dry Time 0.5s (f) |  [focusable] | K20 | N |
| 474 | sidebar-right | Kaleidoscope | #mandalaCaptureBtn | button | Save picture (f) |  [focusable] | K10 | N |
| 475 | sidebar-right | Kaleidoscope | #kaleidoToggle | switch [r] | Kaleido (c) | checked=false [focusable] | K21 | Y |
| 476 | sidebar-right | Kaleidoscope | #sidebar-right > div.sidebar-section:nth-of-type(10) > div.section-bo… | LabelText | Kaleido (f) |  | K03 | Y |
| 477 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(1) > label | LabelText | Facets 12 (f) |  | K03 | N |
| 478 | sidebar-right | Kaleidoscope | #kaleidoSegments | slider | Facets 12 (f) |  [focusable] | K20 | N |
| 479 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(2) > label | LabelText | Kaleidoscope Mode (f) |  | K03 | N |
| 480 | sidebar-right | Kaleidoscope | #kaleidoMode | combobox | Kaleidoscope Mode (f) |  [focusable] | K28 | N |
| 481 | sidebar-right | Kaleidoscope | #kaleidoShowGuides | checkbox | Show Guides (f) | checked=false [focusable] | K21 | N |
| 482 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(3) > label | LabelText | Show Guides (f) |  | K03 | N |
| 483 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(4) > label | LabelText | Angle 0° (f) |  | K03 | N |
| 484 | sidebar-right | Kaleidoscope | #kAngle | slider | Angle 0° (f) |  [focusable] | K20 | N |
| 485 | sidebar-right | Kaleidoscope | #kAnimateRot | checkbox | Animate Rotation (f) | checked=false [focusable] | K21 | N |
| 486 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(5) > label | LabelText | Animate Rotation (f) |  | K03 | N |
| 487 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(6) > label | LabelText | Spin Speed 30°/s (f) |  | K03 | N |
| 488 | sidebar-right | Kaleidoscope | #kSpinSpeed | slider |  (f) |  [focusable] | K20 | N |
| 489 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(7) > label | LabelText | Twist 0.0 (f) |  | K03 | N |
| 490 | sidebar-right | Kaleidoscope | #kTwist | slider | Twist 0.0 (f) |  [focusable] | K20 | N |
| 491 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(8) > label | LabelText | Zoom 1.00 (f) |  | K03 | N |
| 492 | sidebar-right | Kaleidoscope | #kZoom | slider | Zoom 1.00 (f) |  [focusable] | K20 | N |
| 493 | sidebar-right | Kaleidoscope | #kaleidoPanel > div.control-group:nth-of-type(9) > label | LabelText | Opacity 1.00 (f) |  | K03 | N |
| 494 | sidebar-right | Kaleidoscope | #kBlend | slider | Opacity 1.00 (f) |  [focusable] | K20 | N |
| 495 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) | generic | Text (f) |  | K01 | Y |
| 496 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-he… | button [r] | TEXT (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 497 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | + Add Text (c) |  [focusable] | K10 | Y |
| 498 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Arrange on Canvas (c) |  [focusable] | K10 | Y |
| 499 | sidebar-right | Text | #textOverlayContent | textbox | Your text here, enter starts a new line (f) |  [focusable] | K25 | N |
| 500 | sidebar-right | Text | #textOverlayFont | combobox |  (f) |  [focusable] | K28 | N |
| 501 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | + Fonts installed on this computer (f) |  [focusable] | K10 | N |
| 502 | sidebar-right | Text | #textOverlaySize | spinbutton | Font size in pixels (f) |  [focusable] | K24 | N |
| 503 | sidebar-right | Text | #textOverlayWeight | combobox | Font weight (f) |  [focusable] | K28 | N |
| 504 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | I (f) |  [focusable] | K10 | N |
| 505 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Align left (f) |  [focusable] | K10 | N |
| 506 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Align center (f) |  [focusable] | K10 | N |
| 507 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Align right (f) |  [focusable] | K10 | N |
| 508 | sidebar-right | Text | #textOverlayCase | combobox | Letter case (f) |  [focusable] | K28 | N |
| 509 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Letter Spacing (f) |  | K03 | N |
| 510 | sidebar-right | Text | #textOverlayTracking | slider | Letter Spacing (f) |  [focusable] | K20 | N |
| 511 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Line Height (f) |  | K03 | N |
| 512 | sidebar-right | Text | #textOverlayLeading | slider | Line Height (f) |  [focusable] | K20 | N |
| 513 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Opacity (f) |  | K03 | N |
| 514 | sidebar-right | Text | #textOverlayOpacity | slider | Opacity (f) |  [focusable] | K20 | N |
| 515 | sidebar-right | Text | #textOverlayColor | ColorWell | Text colour (f) |  [focusable] | K26 | N |
| 516 | sidebar-right | Text | #textOverlayBgToggle | checkbox | Draw a filled box behind the text (f) | checked=false [focusable] | K21 | N |
| 517 | sidebar-right | Text | #textOverlayBgColor | ColorWell | Background colour (f) |  [focusable] | K26 | N |
| 518 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Background Opacity (f) |  | K03 | N |
| 519 | sidebar-right | Text | #textOverlayBgOpacity | slider | Background Opacity (f) |  [focusable] | K20 | N |
| 520 | sidebar-right | Text | #textOverlayPadding | spinbutton | Space between the text and the box edge (f) |  [focusable] | K24 | N |
| 521 | sidebar-right | Text | #textOverlayRadius | spinbutton | Corner radius of the box (f) |  [focusable] | K24 | N |
| 522 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Drop shadow (f) |  | K03 | N |
| 523 | sidebar-right | Text | #textOverlayShadow | checkbox | Drop shadow (f) | checked=false [focusable] | K21 | N |
| 524 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Fluid collides with this text (f) |  | K03 | N |
| 525 | sidebar-right | Text | #textOverlayCollider | checkbox | Fluid collides with this text (f) | checked=false [focusable] | K21 | N |
| 526 | sidebar-right | Text | #textOverlayColliderMode | combobox | Block: swirls pile up against and go around. De… (f) |  [focusable] | K28 | N |
| 527 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Wall Strength (f) |  | K03 | N |
| 528 | sidebar-right | Text | #textOverlayColliderStrength | slider | Wall Strength (f) |  [focusable] | K20 | N |
| 529 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Set key (f) | pressed=false [focusable] | K11 | N |
| 530 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Remove this hotkey (f) | hidden=true [focusable] | K10 | N |
| 531 | sidebar-right | Text | #textOverlayHotkeyAction | combobox | Pour into Fluid: Hotkey turns the brush tip int… (f) |  [focusable] | K28 | N |
| 532 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | LabelText | Pour at the brush location (f) |  | K03 | N |
| 533 | sidebar-right | Text | #textOverlayHotkeyAtBrush | checkbox | Pour at the brush location (f) | checked=false [focusable] | K21 | N |
| 534 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Duplicate (f) |  [focusable] | K10 | N |
| 535 | sidebar-right | Text | #textOverlayFluidize | button | Fluidize (f) |  [focusable] | K10 | N |
| 536 | sidebar-right | Text | #sidebar-right > div.sidebar-section:nth-of-type(11) > div.section-bo… | button | Delete (f) |  [focusable] | K10 | N |
| 537 | sidebar-right | Text | #textOverlayMakeBrush | button | Convert to brush (f) |  [focusable] | K10 | N |
| 538 | sidebar-right | Text | #textOverlayClearAll | button | Clear All (c) | expanded=false [focusable] | K10 | Y |
| 539 | sidebar-right | Text | #textOverlayClearAsk | group [r] | Clear all text? (f) |  | K01 | N |
| 540 | sidebar-right | Text | #textOverlayClearAsk > div:nth-of-type(2) > button:nth-of-type(1) | button | Cancel (f) |  [focusable] | K10 | N |
| 541 | sidebar-right | Text | #textOverlayClearConfirm | button | Yes, clear all (f) |  [focusable] | K10 | N |
| 542 | sidebar-right | Focus | #sidebar-right > div.sidebar-section:nth-of-type(12) | generic | Focus (f) |  | K01 | Y |
| 543 | sidebar-right | Focus | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-he… | button [r] | FOCUS (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 544 | sidebar-right | Focus | #focusModeToggle | checkbox | Focus Mode (F) (c) | checked=false [focusable] | K21 | Y |
| 545 | sidebar-right | Focus | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | LabelText | Focus Mode (F) (f) |  | K03 | Y |
| 546 | sidebar-right | Focus | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 547 | sidebar-right | Focus | div.stream-format-grid > button:nth-of-type(1) | button | 9:16 TikTok (c) |  [focusable] | K10 | Y |
| 548 | sidebar-right | Focus | div.stream-format-grid > button:nth-of-type(2) | button | 1:1 Square (c) |  [focusable] | K10 | Y |
| 549 | sidebar-right | Focus | div.stream-format-grid > button:nth-of-type(3) | button | 16:9 YouTube (c) |  [focusable] | K10 | Y |
| 550 | sidebar-right | Focus | div.stream-format-grid > button:nth-of-type(4) | button | 21:9 Ultra (c) |  [focusable] | K10 | Y |
| 551 | sidebar-right | Focus | #streamFormatLock | checkbox | Lock Format (c) | checked=false [focusable] | K21 | Y |
| 552 | sidebar-right | Focus | #sidebar-right > div.sidebar-section:nth-of-type(12) > div.section-bo… | LabelText | Lock Format (f) |  | K03 | Y |
| 553 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) | generic | Display (f) |  | K01 | Y |
| 554 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-he… | button [r] | DISPLAY (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 555 | sidebar-right | Display | #photoSafeToggle | checkbox | Reduce flashing and rapid brightness changes (c) | checked=true [focusable] | K21 | Y |
| 556 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Photosensitivity protection: reduces rapid flas… (c) |  | K03 | Y |
| 557 | sidebar-right | Display | #photoWarnShowBtn | button | Show photosensitivity warning (c) |  [focusable] | K10 | Y |
| 558 | sidebar-right | Display | a.photo-warn-learn | link | Learn more about photosensitivity (Epilepsy Fou… (c) |  [focusable] | K29 | Y |
| 559 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 560 | sidebar-right | Display | #windowMode | combobox | WINDOW MODE F11 (c) |  [focusable] | K28 | Y |
| 561 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 562 | sidebar-right | Display | #penWindowBtn | button | PEN INPUT WINDOW (c) |  [focusable] | K10 | Y |
| 563 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Select the visual mode to show in the stylus wi… (c) |  | K03 | Y |
| 564 | sidebar-right | Display | #penWindowMirror | combobox | PEN WINDOW MIRROR (c) |  [focusable] | K28 | Y |
| 565 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Select screen the pen window opens on. (c) |  | K03 | Y |
| 566 | sidebar-right | Display | #penWindowScreens > button | button | Find Screens (c) |  [focusable] | K10 | Y |
| 567 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 568 | sidebar-right | Display | #backgroundColorPicker | ColorWell | BACKGROUND COLOR (c) |  [focusable] | K26 | Y |
| 569 | sidebar-right | Display | #transparentMode | checkbox | Transparent Background (c) | checked=false [focusable] | K21 | Y |
| 570 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Transparent Background (f) |  | K03 | Y |
| 571 | sidebar-right | Display | #transparentRestartBtn | button | Restart now (f) |  [focusable] | K10 | N |
| 572 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 573 | sidebar-right | Display | #canvasOpacity | slider | CANVAS OPACITY (SIM VISIBILITY) 100% (c) |  [focusable] | K20 | Y |
| 574 | sidebar-right | Display | #preserveFluidOpacity | checkbox | Empty Alpha Locked (c) | checked=true [focusable] | K21 | Y |
| 575 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Empty Alpha Locked (f) |  | K03 | Y |
| 576 | sidebar-right | Display | div.bg-transparency-group > label | LabelText | Background Transparency 80% (f) |  | K03 | N |
| 577 | sidebar-right | Display | #captureDimming | slider | Background Transparency 80% (f) |  [focusable] | K20 | N |
| 578 | sidebar-right | Display | #showCanvasHandles | checkbox | Show Canvas Border & Handles (c) | checked=true [focusable] | K21 | Y |
| 579 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Show Canvas Border & Handles (f) |  | K03 | Y |
| 580 | sidebar-right | Display | #lockCanvasBorders | checkbox | Lock Canvas Borders (c) | checked=false [focusable] | K21 | Y |
| 581 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Lock Canvas Borders (f) |  | K03 | Y |
| 582 | sidebar-right | Display | #statsToggle | checkbox | Debug Info (c) | checked=false [focusable] | K21 | Y |
| 583 | sidebar-right | Display | #sidebar-right > div.sidebar-section:nth-of-type(13) > div.section-bo… | LabelText | Debug Info (f) |  | K03 | Y |
| 584 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) | generic | Export (f) |  | K01 | Y |
| 585 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-he… | button [r] | EXPORT (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 586 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 587 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | button | Save Project (c) |  [focusable] | K10 | Y |
| 588 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | button | Load Project (c) |  [focusable] | K10 | Y |
| 589 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | button |  (f) |  [focusable] | K27 | N |
| 590 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 591 | sidebar-right | Export | #exportVideoBtn | button | Video (c) |  [focusable] | K10 | Y |
| 592 | sidebar-right | Export | #exportGifBtn | button | GIF (c) |  [focusable] | K10 | Y |
| 593 | sidebar-right | Export | #exportStillBtn | button | Save picture (c) |  [focusable] | K10 | Y |
| 594 | sidebar-right | Export | #exportSequenceBtn | button | Sequence (c) |  [focusable] | K10 | Y |
| 595 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 596 | sidebar-right | Export | #exportGround | combobox | Background (c) |  [focusable] | K28 | Y |
| 597 | sidebar-right | Export | #exportStopBtn | button | Cancel export (f) |  [focusable] | K10 | N |
| 598 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 599 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 600 | sidebar-right | Export | #exportVideoDuration | spinbutton |  (c) |  [focusable] | K24 | Y |
| 601 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 602 | sidebar-right | Export | #exportVideoFPS | combobox |  (c) |  [focusable] | K28 | Y |
| 603 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 604 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 605 | sidebar-right | Export | #exportGifDuration | spinbutton |  (c) |  [focusable] | K24 | Y |
| 606 | sidebar-right | Export | #sidebar-right > div.sidebar-section:nth-of-type(14) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 607 | sidebar-right | Export | #exportGifFPS | combobox |  (c) |  [focusable] | K28 | Y |
| 608 | sidebar-right | Settings | #sidebar-right > div.sidebar-section:nth-of-type(15) | generic | Settings (f) |  | K01 | Y |
| 609 | sidebar-right | Settings | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-he… | button [r] | SETTINGS (c) | expanded=true tabindex=0 [focusable] | K30 | Y |
| 610 | sidebar-right | Settings | div.ui-vis-block > label.brush-section-label | LabelText |  (c) |  | K03 | Y |
| 611 | sidebar-right | Settings | div.ui-vis-presets > button.ch-text-toggle:nth-of-type(1) | button | Simple (c) |  [focusable] | K10 | Y |
| 612 | sidebar-right | Settings | div.ui-vis-presets > button.ch-text-toggle:nth-of-type(2) | button | Everything (c) |  [focusable] | K10 | Y |
| 613 | sidebar-right | Settings | button.ui-vis-trigger | button | Visible sections 28 / 28 ▾ (c) | expanded=false [focusable] | K10 | Y |
| 614 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(1) | LabelText | Material Type (f) |  | K03 | N |
| 615 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(1) > input | checkbox | Material Type (f) | checked=true [focusable] | K21 | N |
| 616 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(2) | LabelText | Viscosity (f) |  | K03 | N |
| 617 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(2) > input | checkbox | Viscosity (f) | checked=true [focusable] | K21 | N |
| 618 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(3) | LabelText | Isolation (f) |  | K03 | N |
| 619 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(3) > input | checkbox | Isolation (f) | checked=true [focusable] | K21 | N |
| 620 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(4) | LabelText | Laminar / Blend (f) |  | K03 | N |
| 621 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(4) > input | checkbox | Laminar / Blend (f) | checked=true [focusable] | K21 | N |
| 622 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(5) | LabelText | Time (f) |  | K03 | N |
| 623 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(5) > input | checkbox | Time (f) | checked=true [focusable] | K21 | N |
| 624 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(6) | LabelText | Density (f) |  | K03 | N |
| 625 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(6) > input | checkbox | Density (f) | checked=true [focusable] | K21 | N |
| 626 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(7) | LabelText | Velocity (f) |  | K03 | N |
| 627 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(7) > input | checkbox | Velocity (f) | checked=true [focusable] | K21 | N |
| 628 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(8) | LabelText | Color (f) |  | K03 | N |
| 629 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(8) > input | checkbox | Color (f) | checked=true [focusable] | K21 | N |
| 630 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(9) | LabelText | Presets (f) |  | K03 | N |
| 631 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(9) > input | checkbox | Presets (f) | checked=true [focusable] | K21 | N |
| 632 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(10) | LabelText | Transport (f) |  | K03 | N |
| 633 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(10) > input | checkbox | Transport (f) | checked=true [focusable] | K21 | N |
| 634 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(11) | LabelText | Swirl Together (f) |  | K03 | N |
| 635 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(11) > input | checkbox | Swirl Together (f) | checked=true [focusable] | K21 | N |
| 636 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(12) | LabelText | Simulation (f) |  | K03 | N |
| 637 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(12) > input | checkbox | Simulation (f) | checked=true [focusable] | K21 | N |
| 638 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(13) | LabelText | Colors and palettes (f) |  | K03 | N |
| 639 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(13) > input | checkbox | Colors and palettes (f) | checked=true [focusable] | K21 | N |
| 640 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(14) | LabelText | Layers (f) |  | K03 | N |
| 641 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(14) > input | checkbox | Layers (f) | checked=true [focusable] | K21 | N |
| 642 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(15) | LabelText | Mutate shader (f) |  | K03 | N |
| 643 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(15) > input | checkbox | Mutate shader (f) | checked=true [focusable] | K21 | N |
| 644 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(16) | LabelText | Effects (f) |  | K03 | N |
| 645 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(16) > input | checkbox | Effects (f) | checked=true [focusable] | K21 | N |
| 646 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(17) | LabelText | Animations (f) |  | K03 | N |
| 647 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(17) > input | checkbox | Animations (f) | checked=true [focusable] | K21 | N |
| 648 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(18) | LabelText | Audio (f) |  | K03 | N |
| 649 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(18) > input | checkbox | Audio (f) | checked=true [focusable] | K21 | N |
| 650 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(19) | LabelText | Kaleidoscope (f) |  | K03 | N |
| 651 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(19) > input | checkbox | Kaleidoscope (f) | checked=true [focusable] | K21 | N |
| 652 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(20) | LabelText | Text (f) |  | K03 | N |
| 653 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(20) > input | checkbox | Text (f) | checked=true [focusable] | K21 | N |
| 654 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(21) | LabelText | Focus (f) |  | K03 | N |
| 655 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(21) > input | checkbox | Focus (f) | checked=true [focusable] | K21 | N |
| 656 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(22) | LabelText | Display (f) |  | K03 | N |
| 657 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(22) > input | checkbox | Display (f) | checked=true [focusable] | K21 | N |
| 658 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(23) | LabelText | Export (f) |  | K03 | N |
| 659 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(23) > input | checkbox | Export (f) | checked=true [focusable] | K21 | N |
| 660 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(24) | LabelText | Settingsalways shown (f) |  | K03 | N |
| 661 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(24) > input | checkbox | Settingsalways shown (f) | checked=true disabled=true | K21 | N |
| 662 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(25) | LabelText | Brush (f) |  | K03 | N |
| 663 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(25) > input | checkbox | Brush (f) | checked=true [focusable] | K21 | N |
| 664 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(26) | LabelText | Multi-Brush (f) |  | K03 | N |
| 665 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(26) > input | checkbox | Multi-Brush (f) | checked=true [focusable] | K21 | N |
| 666 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(27) | LabelText | Stroke and replay (f) |  | K03 | N |
| 667 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(27) > input | checkbox | Stroke and replay (f) | checked=true [focusable] | K21 | N |
| 668 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(28) | LabelText | Quality bar (f) |  | K03 | N |
| 669 | sidebar-right | Settings | div.ui-vis-list > label.ui-vis-row:nth-of-type(28) > input | checkbox | Quality bar (f) | checked=true [focusable] | K21 | N |
| 670 | sidebar-right | Settings | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 671 | sidebar-right | Settings | button.hk-bind-btn | button | + Bind a control Ctrl+Shift+H (c) |  [focusable] | K10 | Y |
| 672 | sidebar-right | Settings | button.hk-list-trigger | button | Your hotkeys ▾ (c) | expanded=false [focusable] | K10 | Y |
| 673 | sidebar-right | Settings | div.radial-block > label.brush-section-label | LabelText |  (c) |  | K03 | Y |
| 674 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(1) > button.hk-row-del | button | Take “Brush Size” off the menu (c) |  [focusable] | K10 | Y |
| 675 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(2) > button.hk-row-del | button | Take “Material Type - Fluid” off the menu (c) |  [focusable] | K10 | Y |
| 676 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(3) > button.hk-row-del | button | Take “Viscosity” off the menu (c) |  [focusable] | K10 | Y |
| 677 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(4) > button.hk-row-del | button | Take “Isolation” off the menu (c) |  [focusable] | K10 | Y |
| 678 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(5) > button.hk-row-del | button | Take “Laminar / Blend” off the menu (c) |  [focusable] | K10 | Y |
| 679 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(6) > button.hk-row-del | button | Take “Multi-Brush” off the menu (c) |  [focusable] | K10 | Y |
| 680 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(7) > button.hk-row-del | button | Take “Time” off the menu (c) |  [focusable] | K10 | Y |
| 681 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(8) > button.hk-row-del | button | Take “Density” off the menu (c) |  [focusable] | K10 | Y |
| 682 | sidebar-right | Settings | div.radial-list > div.hk-row:nth-of-type(9) > button.hk-row-del | button | Take “Velocity” off the menu (c) |  [focusable] | K10 | Y |
| 683 | sidebar-right | Settings | button.radial-pick-btn | button | + Add from the interface (c) |  [focusable] | K10 | Y |
| 684 | sidebar-right | Settings | input.radial-add-label | textbox | Label for a new key item (c) |  [focusable] | K25 | Y |
| 685 | sidebar-right | Settings | div.radial-add > div.hk-picker > div.hk-picker-row > button.hk-picker… | button | Its key (c) | pressed=false [focusable] | K11 | Y |
| 686 | sidebar-right | Settings | div.radial-add > div.hk-picker > div.hk-picker-row > button.hk-picker… | button | Remove this hotkey (f) | hidden=true [focusable] | K10 | N |
| 687 | sidebar-right | Settings | button.radial-add-btn | button | Add (c) |  [focusable] | K10 | Y |
| 688 | sidebar-right | Settings | button.radial-reset | button | Back to the starting items (f) | hidden=true [focusable] | K10 | N |
| 689 | sidebar-right | Settings | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 690 | sidebar-right | Settings | #saveSettingsBtn | button | Save settings (c) |  [focusable] | K10 | Y |
| 691 | sidebar-right | Settings | #loadSettingsBtn | button | Load (c) |  [focusable] | K10 | Y |
| 692 | sidebar-right | Settings | #clearSettingsBtn | button | Clear (c) |  [focusable] | K10 | Y |
| 693 | sidebar-right | Settings | #autoloadSettings | checkbox | Load saved on start (c) | checked=true [focusable] | K21 | Y |
| 694 | sidebar-right | Settings | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | LabelText | Load saved on start (f) |  | K03 | Y |
| 695 | sidebar-right | Settings | #sidebar-right > div.sidebar-section:nth-of-type(15) > div.section-bo… | LabelText |  (c) |  | K03 | Y |
| 696 | sidebar-right | Settings | #exportAllPresetsBtn | button | ⤓ Export Presets (c) |  [focusable] | K10 | Y |
| 697 | sidebar-right | Settings | #importPresetsBtn | button | ⤒ Import Presets (c) |  [focusable] | K10 | Y |
| 698 | sidebar-right | Settings | #importPresetsInput | button |  (f) |  [focusable] | K27 | N |
| 699 | sidebar-right | Settings | #openPresetsFolderBtn | button | Open Presets Folder (f) |  [focusable] | K10 | N |
| 700 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(1) > label | LabelText | Brush Size (f) |  | K00 | N |
| 701 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(2) > label | LabelText | Fluid Color (f) |  | K00 | N |
| 702 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(2) > div.control-group:n… | LabelText | Random Colors (f) |  | K00 | N |
| 703 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(2) > div.control-group:n… | LabelText | Limit (f) |  | K00 | N |
| 704 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(3) > label | LabelText | Palette mode (new colour each stroke) (f) |  | K00 | N |
| 705 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(4) > label | LabelText | Image Sharpness (f) |  | K00 | N |
| 706 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(5) > label | LabelText | Motion Detail (f) |  | K00 | N |
| 707 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(6) > label | LabelText | Shading Detail (f) |  | K00 | N |
| 708 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(7) > label | LabelText | Density Sustain (f) |  | K00 | N |
| 709 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(8) > label | LabelText | Velocity Sustain (f) |  | K00 | N |
| 710 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(9) > label | LabelText | Motion Isolation (f) |  | K00 | N |
| 711 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(10) > label | LabelText |  (f) |  | K00 | N |
| 712 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(11) > label | LabelText | Viscosity (f) |  | K00 | N |
| 713 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(12) > label | LabelText | Laminar / Blend (f) |  | K00 | N |
| 714 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(13) > label | LabelText | Multiplier (f) |  | K00 | N |
| 715 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(14) > label | LabelText | ⏱️ Time (f) |  | K00 | N |
| 716 | overlay:.controls |  | #presetsGroup > label | LabelText | Presets (f) |  | K00 | N |
| 717 | overlay:.controls |  | #saveAsPresetBtn | button | + Save Current as Preset (f) |  [focusable] | K00 | N |
| 718 | overlay:.controls |  | #userPresetNameInput | textbox | Preset name... (f) |  [focusable] | K00 | N |
| 719 | overlay:.controls |  | #userPresetConfirmBtn | button | Save (f) |  [focusable] | K00 | N |
| 720 | overlay:.controls |  | #userPresetCancelBtn | button | Cancel (f) |  [focusable] | K00 | N |
| 721 | overlay:.controls |  | #jellyfishBtn | button | Jellyfish (f) |  [focusable] | K00 | N |
| 722 | overlay:.controls |  | div.controls > button:nth-of-type(2) | button | Portrait (f) |  [focusable] | K00 | N |
| 723 | overlay:.controls |  | #portalBtn | button | Portal (f) |  [focusable] | K00 | N |
| 724 | overlay:.controls |  | #chimeraBtn | button | Chimera Three sine strokes × 8 arms (f) |  [focusable] | K00 | N |
| 725 | overlay:.controls |  | label.anim-switch | LabelText |  (f) |  | K00 | N |
| 726 | overlay:.controls |  | #shootingStarToggle | checkbox |  (f) | checked=false [focusable] | K00 | N |
| 727 | overlay:.controls |  | div.anim-settings-inner > div.control-group:nth-of-type(1) > label | LabelText | Frequency 2.0/s (f) |  | K00 | N |
| 728 | overlay:.controls |  | #ssFrequency | slider | Frequency 2.0/s (f) |  [focusable] | K00 | N |
| 729 | overlay:.controls |  | div.anim-settings-inner > div.control-group:nth-of-type(2) > label | LabelText | Angle 120° (f) |  | K00 | N |
| 730 | overlay:.controls |  | #ssAngle | slider | Angle 120° (f) |  [focusable] | K00 | N |
| 731 | overlay:.controls |  | div.anim-settings-inner > div.control-group:nth-of-type(3) > label | LabelText | Length 0.4s (f) |  | K00 | N |
| 732 | overlay:.controls |  | #ssLength | slider | Length 0.4s (f) |  [focusable] | K00 | N |
| 733 | overlay:.controls |  | div.anim-settings-inner > div.control-group:nth-of-type(4) > label | LabelText | Size 0.5x (f) |  | K00 | N |
| 734 | overlay:.controls |  | #ssSize | slider | Size 0.5x (f) |  [focusable] | K00 | N |
| 735 | overlay:.controls |  | div.anim-settings-inner > label | LabelText | Origin (f) |  | K00 | N |
| 736 | overlay:.controls |  | div.anim-settings-inner > div.control-group:nth-of-type(6) > label | LabelText | Variance 15% (f) |  | K00 | N |
| 737 | overlay:.controls |  | #ssVariance | slider | Variance 15% (f) |  [focusable] | K00 | N |
| 738 | overlay:.controls |  | div.anim-settings-inner > div.control-group:nth-of-type(7) > label | LabelText | Gravity 0.10 (f) |  | K00 | N |
| 739 | overlay:.controls |  | #ssGravity | slider | Gravity 0.10 (f) |  [focusable] | K00 | N |
| 740 | overlay:.controls |  | div.controls > div.control-group:nth-of-type(17) > label | LabelText | Layers (f) |  | K00 | N |
| 741 | overlay:recDrawer |  | button.studio-tab | button | Audio (f) |  [focusable] | K10 | N |
| 742 | overlay:recDrawer |  | #studioCloseBtn | button | ✕ (f) |  [focusable] | K10 | N |
| 743 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(1) | button | − (f) |  [focusable] | K10 | N |
| 744 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(2) | button | + (f) |  [focusable] | K10 | N |
| 745 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(3) | button | Fit (f) |  [focusable] | K10 | N |
| 746 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(4) | button | Follow (f) |  [focusable] | K10 | N |
| 747 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(5) | button | Re-detect (f) |  [focusable] | K10 | N |
| 748 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(6) | button | Undo (f) |  [focusable] | K10 | N |
| 749 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(7) | button | Redo (f) |  [focusable] | K10 | N |
| 750 | overlay:recDrawer |  | div.ace-bar > button.ace-btn:nth-of-type(8) | button | Set up this song (f) |  [focusable] | K10 | N |
| 751 | overlay:recDrawer |  | div.ace-match > button.ace-btn:nth-of-type(1) | button | Texture (f) |  [focusable] | K10 | N |
| 752 | overlay:recDrawer |  | div.ace-match > button.ace-btn:nth-of-type(2) | button | Attacks (f) |  [focusable] | K10 | N |
| 753 | overlay:recDrawer |  | label.ace-sim | LabelText | Similarity (f) |  | K03 | N |
| 754 | overlay:recDrawer |  | label.ace-sim > input | slider | Similarity (f) |  [focusable] | K20 | N |
| 755 | overlay:recDrawer |  | div.ace-match > button.ace-btn:nth-of-type(3) | button | Make a lane (f) |  [focusable] | K10 | N |
| 756 | overlay:recDrawer |  | div.ace-match > button.ace-btn:nth-of-type(4) | button | Cancel (f) |  [focusable] | K10 | N |
| 757 | overlay:recDrawer |  | canvas.ace-canvas | generic |  (f) | tabindex=0 [focusable] | K3F | N |
| 758 | overlay:recDrawer |  | div.audio-gates-row > label | LabelText | Lanes (f) |  | K03 | N |
| 759 | overlay:recDrawer |  | button.audio-gate-clear | button | Clear (f) |  [focusable] | K10 | N |
| 760 | overlay:recDrawer |  | button.atv-auto | button | ✨ Auto (f) |  [focusable] | K10 | N |
| 761 | overlay:recDrawer |  | button.atv-fit | button | ⟳ Fit (f) |  [focusable] | K10 | N |
| 762 | overlay:recDrawer |  | #audioDrawerLanes > div.control-group:nth-of-type(3) > label | LabelText | Lead 2.2s (f) |  | K03 | N |
| 763 | overlay:recDrawer |  | #audioDrawerLanes > div.control-group:nth-of-type(3) > input | slider |  (f) |  [focusable] | K20 | N |
| 764 | overlay:recDrawer |  | #audioDrawerLanes > div.control-group:nth-of-type(4) > label | LabelText | Nudge 0ms (f) |  | K03 | N |
| 765 | overlay:recDrawer |  | #audioDrawerLanes > div.control-group:nth-of-type(4) > input | slider |  (f) |  [focusable] | K20 | N |
| 766 | overlay:recDrawer |  | #audioDrawerLanes > div.atv-foot:nth-of-type(5) > button.atv-reread | button | Re-read (f) |  [focusable] | K10 | N |
| 767 | overlay:recDrawer |  | div.atv-cue-files > button.atv-reread:nth-of-type(1) | button | Save this track's lanes and what they do as a .… (f) |  [focusable] | K10 | N |
| 768 | overlay:recDrawer |  | div.atv-cue-files > button.atv-reread:nth-of-type(2) | button | Load lanes from a .swirlcues file onto this tra… (f) |  [focusable] | K10 | N |
| 769 | overlay:recDrawer |  | div.atv-cue-files > input | button |  (f) |  [focusable] | K27 | N |
| 770 | overlay:recDrawer |  | details.audio-live-block > summary | DisclosureTriangle | Live reactions (f) |  [focusable] | K2A | N |
| 771 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(2) > label | LabelText | Sensitivity 1.5 (f) |  | K03 | N |
| 772 | overlay:recDrawer |  | #audioSensitivity | slider | Sensitivity 1.5 (f) |  [focusable] | K20 | N |
| 773 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(3) > label | LabelText | Beat Threshold 0.65 (f) |  | K03 | N |
| 774 | overlay:recDrawer |  | #audioBeatThreshold | slider | Beat Threshold 0.65 (f) |  [focusable] | K20 | N |
| 775 | overlay:recDrawer |  | details.audio-live-block > label.brush-section-label | LabelText | Mappings (f) |  | K03 | N |
| 776 | overlay:recDrawer |  | #arMapAutoSplat | checkbox | Bass → Auto Splat (f) | checked=true [focusable] | K21 | N |
| 777 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(4) > label | LabelText | Bass → Auto Splat (f) |  | K03 | N |
| 778 | overlay:recDrawer |  | #arMapSize | checkbox | Energy → Brush Size (f) | checked=false [focusable] | K21 | N |
| 779 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(5) > label | LabelText | Energy → Brush Size (f) |  | K03 | N |
| 780 | overlay:recDrawer |  | #arMapKaleido | checkbox | Mid → Kaleido Rotation (f) | checked=true [focusable] | K21 | N |
| 781 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(6) > label | LabelText | Mid → Kaleido Rotation (f) |  | K03 | N |
| 782 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(7) > label | LabelText | Spin speed 45°/s (f) |  | K03 | N |
| 783 | overlay:recDrawer |  | #audioKaleidoSpin | slider | Spin speed 45°/s (f) |  [focusable] | K20 | N |
| 784 | overlay:recDrawer |  | #arMapColor | checkbox | Beats → Color Cycle (f) | checked=false [focusable] | K21 | N |
| 785 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(8) > label | LabelText | Beats → Color Cycle (f) |  | K03 | N |
| 786 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(9) > label | LabelText | Change colour every (f) |  | K03 | N |
| 787 | overlay:recDrawer |  | #audioColorEvery | combobox | Change colour every (f) |  [focusable] | K28 | N |
| 788 | overlay:recDrawer |  | details.audio-live-block > div.control-group:nth-of-type(10) > label | LabelText | Auto-Splat Pattern (f) |  | K03 | N |
| 789 | overlay:recDrawer |  | div.ar-pattern-grid > button.ar-pattern-btn:nth-of-type(1) | button | ◉Center (f) |  [focusable] | K10 | N |
| 790 | overlay:recDrawer |  | div.ar-pattern-grid > button.ar-pattern-btn:nth-of-type(2) | button | ✦Scatter (f) |  [focusable] | K10 | N |
| 791 | overlay:recDrawer |  | div.ar-pattern-grid > button.ar-pattern-btn:nth-of-type(3) | button | ◯Orbit (f) |  [focusable] | K10 | N |
| 792 | overlay:recDrawer |  | div.ar-pattern-grid > button.ar-pattern-btn:nth-of-type(4) | button | ▦Grid (f) |  [focusable] | K10 | N |
| 793 | overlay:recDrawer |  | div.ar-pattern-grid > button.ar-pattern-btn:nth-of-type(5) | button | 🌀Spiral (f) |  [focusable] | K10 | N |
| 794 | overlay:recDrawer |  | div.ar-pattern-grid > button.ar-pattern-btn:nth-of-type(6) | button | ✺Burst (f) |  [focusable] | K10 | N |
| 795 | overlay:recDrawer |  | div.ar-pattern-grid > button.ar-pattern-btn:nth-of-type(7) | button | ∿Freq (f) |  [focusable] | K10 | N |
| 796 | overlay:hotkeyOverlay |  | #hotkeyClose | button | Close (f) |  [focusable] | K10 | N |
| 797 | overlay:hotkeyOverlay |  | span.hotkey-credits > a:nth-of-type(1) | link | Pavel Dobryakov (f) |  [focusable] | K29 | N |
| 798 | overlay:hotkeyOverlay |  | span.hotkey-credits > a:nth-of-type(2) | link | Mark Harris (f) |  [focusable] | K29 | N |
| 799 | overlay:hotkeyOverlay |  | span.hotkey-credits > a:nth-of-type(3) | link | Mattias Harrysson (f) |  [focusable] | K29 | N |
| 800 | overlay:hotkeyOverlay |  | span.hotkey-credits > a:nth-of-type(4) | link | George Corney (f) |  [focusable] | K29 | N |
| 801 | overlay:deletePaletteModal |  | button.delete-modal-cancel | button | Cancel (f) |  [focusable] | K10 | N |
| 802 | overlay:deletePaletteModal |  | button.delete-modal-confirm | button | Delete (f) |  [focusable] | K10 | N |
| 803 | overlay:focus-mode-hint |  | #focus-mode-hint | status [r] | Press F or Esc to leave Focus (f) |  | K02 | N |
| 804 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(1) | button | Liquid opal (f) |  [focusable] | K56 | N |
| 805 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(2) | button | Electric bloom (f) |  [focusable] | K56 | N |
| 806 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(3) | button | Two currents (f) |  [focusable] | K56 | N |
| 807 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(4) | button | Gel pen (f) |  [focusable] | K56 | N |
| 808 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(5) | button | Endless silk swirl (f) |  [focusable] | K56 | N |
| 809 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(6) | button | Thick paint, still (f) |  [focusable] | K56 | N |
| 810 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(7) | button | Smoke wisps (f) |  [focusable] | K56 | N |
| 811 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(8) | button | Quick-fading brush tracer (f) |  [focusable] | K56 | N |
| 812 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(9) | button | Drifting mist (f) |  [focusable] | K56 | N |
| 813 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(10) | button | Gusty, fades fast (f) |  [focusable] | K56 | N |
| 814 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(11) | button | Slow marbling (f) |  [focusable] | K56 | N |
| 815 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(12) | button | Electric threads (f) |  [focusable] | K56 | N |
| 816 | overlay:.arm-colors-panel |  | #mixerPresetNameInput | textbox | Name… (f) |  [focusable] | K25 | N |
| 817 | overlay:.arm-colors-panel |  | #mixerPresetGroupSel | combobox | Which group to save it in (f) |  [focusable] | K28 | N |
| 818 | overlay:.arm-colors-panel |  | div.mixer-preset-save-form > input.mixer-preset-name-input:nth-of-typ… | textbox | New group… (f) |  [focusable] | K25 | N |
| 819 | overlay:.arm-colors-panel |  | div.mixer-presets-footer > button.mixer-preset-save:nth-of-type(1) | button | + New Preset (f) |  [focusable] | K10 | N |
| 820 | overlay:.arm-colors-panel |  | button.mixer-preset-new-group | button | + Group (f) |  [focusable] | K10 | N |
| 821 | overlay:.arm-colors-panel |  | button.look-link-copy | button | Link to current settings (f) |  [focusable] | K10 | N |
| 822 | overlay:quality-underbar |  | #quality-underbar > div.qub-dd:nth-of-type(1) > button.qub-dd-btn | button | IMAGE SHARPNESS 2048 (c) | expanded=false haspopup=listbox [focusable] | K13 | Y |
| 823 | overlay:quality-underbar |  | #visualResolutionDdList | listbox [r] | Image Sharpness (f) |  | K3A | N |
| 824 | overlay:quality-underbar |  | #visualResolution | combobox | Image Sharpness (f) | hidden=true tabindex=-1 | K22 | Y |
| 825 | overlay:quality-underbar |  | #quality-underbar > div.qub-dd:nth-of-type(2) > button.qub-dd-btn | button | MOTION DETAIL 1024 (c) | expanded=false haspopup=listbox [focusable] | K13 | Y |
| 826 | overlay:quality-underbar |  | #physicsResolutionDdList | listbox [r] | Motion Detail (f) |  | K3A | N |
| 827 | overlay:quality-underbar |  | #physicsResolution | combobox | Motion Detail (f) | hidden=true tabindex=-1 | K22 | Y |
| 828 | overlay:quality-underbar |  | div.qub-dd-shade > button.qub-dd-btn | button | Shading Detail 256 (f) | expanded=false haspopup=listbox [focusable] | K13 | N |
| 829 | overlay:quality-underbar |  | #shadeFormResolutionDdList | listbox [r] | Shading Detail (f) |  | K3A | N |
| 830 | overlay:quality-underbar |  | #shadeFormResolution | combobox | Shading Detail (f) | hidden=true tabindex=-1 | K22 | N |
| 831 | overlay:quality-underbar |  | #resetAppBtn | button | Reset app (c) |  [focusable] | K10 | Y |
| 832 | overlay:mixer-more-panel |  | #mixer-more-panel | group [r] | More faders (f) |  | K01 | N |
| 833 | overlay:mpInvitePop |  | #mpInvitePop | dialog [r] | Invite (f) | hidden=true | K3D | N |
| 834 | overlay:mpInvitePop |  | div.mp-share-modes | group [r] | How to share this room (f) |  | K01 | N |
| 835 | overlay:mpInvitePop |  | #shareModeCode | button | Code (f) | pressed=true [focusable] | K11 | N |
| 836 | overlay:mpInvitePop |  | #shareModeQr | button | QR (f) | pressed=false [focusable] | K11 | N |
| 837 | overlay:mpInvitePop |  | #shareModeHidden | button | Hide (f) | pressed=false [focusable] | K11 | N |
| 838 | overlay:mpInvitePop |  | #copyRoomBtn | button | Copy link (f) |  [focusable] | K10 | N |
| 839 | overlay:mpInvitePop |  | #copyRoomCodeBtn | button | Copy code (f) |  [focusable] | K10 | N |
| 840 | overlay:mpInvitePop |  | #copyRoomLookBtn | button | Room link + current settings (f) |  [focusable] | K10 | N |
| 841 | overlay:mpInvitePop |  | #phonePadRoomBtn | button | Sync phone (f) |  [focusable] | K10 | N |
| 842 | overlay:mpRoomMenu |  | #mpRoomMenu | menu [r] | Room options (f) | hidden=true | K3D | N |
| 843 | overlay:mpRoomMenu |  | #lockRoomBtn | menuitemcheckbox [r] | Lock room (f) | checked=false [focusable] | K39 | N |
| 844 | overlay:mpRoomMenu |  | #roomReportBtn | menuitem [r] | Copy room report (f) |  [focusable] | K39 | N |

## Lazily built UI

### radial-menu (`#radialMenu`, 10 controls; pointer over the canvas centre, tap E)

| # | Surface | Section | Selector | Role | Name | State | Keys | R |
|---|---|---|---|---|---|---|---|---|
| 0 | overlay:radialMenu |  | #radialMenu | menu [r] | Radial menu (c) |  | K50 | Y |
| 1 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(2) | menuitem [r] | Brush Size 41 px (c) |  | K51 | Y |
| 2 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(3) | menuitem [r] | Material Type - Fluid 0 (c) |  | K51 | Y |
| 3 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(4) | menuitem [r] | Viscosity 0.30 (c) |  | K51 | Y |
| 4 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(5) | menuitem [r] | Isolation 2.000 (c) |  | K51 | Y |
| 5 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(6) | menuitem [r] | Laminar / Blend 0.00 (c) |  | K51 | Y |
| 6 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(7) | menuitem [r] | Multi-Brush 1x (c) |  | K51 | Y |
| 7 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(8) | menuitem [r] | Time 1.00x (c) |  | K51 | Y |
| 8 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(9) | menuitem [r] | Density 0.9900 (c) |  | K51 | Y |
| 9 | overlay:radialMenu |  | div.radial-wheel > div.radial-label:nth-of-type(10) | menuitem [r] | Velocity 1.0009 (c) |  | K51 | Y |

### colour-picker (`.cp-pop`, 18 controls; trusted click on the top bar colour well #colorPicker)

| # | Surface | Section | Selector | Role | Name | State | Keys | R |
|---|---|---|---|---|---|---|---|---|
| 0 | overlay:.cp-pop |  | div.cp-pop | dialog [r] | Brush color (c) |  | K3D | Y |
| 1 | overlay:.cp-pop |  | button.cp-pop-close | button | Close (c) |  [focusable] | K10 | Y |
| 2 | overlay:.cp-pop |  | input.cp-hex | textbox | Hex code (c) |  [focusable] | K25 | Y |
| 3 | overlay:.cp-pop |  | button.cp-copy | button | Copy (c) |  [focusable] | K10 | Y |
| 4 | overlay:.cp-pop |  | select.cp-space | combobox | Color space (c) |  [focusable] | K28 | Y |
| 5 | overlay:.cp-pop |  | button.cp-drop | button | Pick a color from the canvas (c) |  [focusable] | K10 | Y |
| 6 | overlay:.cp-pop |  | div.cp-sliders > div.cp-row:nth-of-type(1) > div.cp-track | slider [r] | Lightness (c) | tabindex=0 [focusable] | K52 | Y |
| 7 | overlay:.cp-pop |  | div.cp-sliders > div.cp-row:nth-of-type(1) > input.cp-num | textbox | Lightness (c) |  [focusable] | K53 | Y |
| 8 | overlay:.cp-pop |  | div.cp-sliders > div.cp-row:nth-of-type(2) > div.cp-track | slider [r] | Chroma: how vivid (c) | tabindex=0 [focusable] | K52 | Y |
| 9 | overlay:.cp-pop |  | div.cp-sliders > div.cp-row:nth-of-type(2) > input.cp-num | textbox | Chroma: how vivid (c) |  [focusable] | K53 | Y |
| 10 | overlay:.cp-pop |  | div.cp-sliders > div.cp-row:nth-of-type(3) > div.cp-track | slider [r] | Hue (c) | tabindex=0 [focusable] | K52 | Y |
| 11 | overlay:.cp-pop |  | div.cp-sliders > div.cp-row:nth-of-type(3) > input.cp-num | textbox | Hue (c) |  [focusable] | K53 | Y |
| 12 | overlay:.cp-pop |  | select.cp-pal-select | combobox | Palette (c) |  [focusable] | K28 | Y |
| 13 | overlay:.cp-pop |  | div.cp-pal-row > div.cp-chip:nth-of-type(1) | button [r] | #2C5F2D. Click to paint with it. (c) | tabindex=0 [focusable] | K54 | Y |
| 14 | overlay:.cp-pop |  | div.cp-pal-row > div.cp-chip:nth-of-type(2) | button [r] | #4A7856. Click to paint with it. (c) | tabindex=0 [focusable] | K54 | Y |
| 15 | overlay:.cp-pop |  | div.cp-pal-row > div.cp-chip:nth-of-type(3) | button [r] | #8B4513. Click to paint with it. (c) | tabindex=0 [focusable] | K54 | Y |
| 16 | overlay:.cp-pop |  | div.cp-pal-row > div.cp-chip:nth-of-type(4) | button [r] | #FFD700. Click to paint with it. (c) | tabindex=0 [focusable] | K54 | Y |
| 17 | overlay:.cp-pop |  | div.cp-pal-row > div.cp-chip:nth-of-type(5) | button [r] | #F0EAD6. Click to paint with it. (c) | tabindex=0 [focusable] | K54 | Y |

### presets-popup (`.mixer-presets-panel`, 18 controls; trusted click on #mixerPresetsTrigger)

| # | Surface | Section | Selector | Role | Name | State | Keys | R |
|---|---|---|---|---|---|---|---|---|
| 0 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(1) | button | Liquid opal (c) |  [focusable] | K56 | Y |
| 1 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(2) | button | Electric bloom (c) |  [focusable] | K56 | Y |
| 2 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(3) | button | Two currents (c) |  [focusable] | K56 | Y |
| 3 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(4) | button | Gel pen (c) |  [focusable] | K56 | Y |
| 4 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(5) | button | Endless silk swirl (c) |  [focusable] | K56 | Y |
| 5 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(6) | button | Thick paint, still (c) |  [focusable] | K56 | Y |
| 6 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(7) | button | Smoke wisps (c) |  [focusable] | K56 | Y |
| 7 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(8) | button | Quick-fading brush tracer (c) |  [focusable] | K56 | Y |
| 8 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(9) | button | Drifting mist (c) |  [focusable] | K56 | Y |
| 9 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(10) | button | Gusty, fades fast (c) |  [focusable] | K56 | Y |
| 10 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(11) | button | Slow marbling (c) |  [focusable] | K56 | Y |
| 11 | overlay:.arm-colors-panel |  | div.preset-group-body > button.mixer-preset-btn:nth-of-type(12) | button | Electric threads (c) |  [focusable] | K56 | Y |
| 12 | overlay:.arm-colors-panel |  | #mixerPresetNameInput | textbox | Name… (f) |  [focusable] | K25 | N |
| 13 | overlay:.arm-colors-panel |  | #mixerPresetGroupSel | combobox | Which group to save it in (f) |  [focusable] | K28 | N |
| 14 | overlay:.arm-colors-panel |  | div.mixer-preset-save-form > input.mixer-preset-name-input:nth-of-typ… | textbox | New group… (f) |  [focusable] | K25 | N |
| 15 | overlay:.arm-colors-panel |  | div.mixer-presets-footer > button.mixer-preset-save:nth-of-type(1) | button | + New Preset (c) |  [focusable] | K10 | Y |
| 16 | overlay:.arm-colors-panel |  | button.mixer-preset-new-group | button | + Group (c) |  [focusable] | K10 | Y |
| 17 | overlay:.arm-colors-panel |  | button.look-link-copy | button | Link to current settings (c) |  [focusable] | K10 | Y |

### arm-tip-menu (`.arm-tip-menu`, 7 controls; trusted click on the first .arm-tip-btn in the Multi-Brush section)

| # | Surface | Section | Selector | Role | Name | State | Keys | R |
|---|---|---|---|---|---|---|---|---|
| 0 | overlay:.brush-shape-menu |  | div.arm-tip-menu | menu [r] |  (c) |  | K55 | Y |
| 1 | overlay:.brush-shape-menu |  | button.arm-tip-same | button | ◌ Same as the brush (c) |  [focusable] | K10 | Y |
| 2 | overlay:.brush-shape-menu |  | div.arm-tip-grid > button.arm-tip-opt:nth-of-type(1) | button | ◌ Soft (c) |  [focusable] | K10 | Y |
| 3 | overlay:.brush-shape-menu |  | div.arm-tip-grid > button.arm-tip-opt:nth-of-type(2) | button | ⬤ Blob (c) |  [focusable] | K10 | Y |
| 4 | overlay:.brush-shape-menu |  | div.arm-tip-grid > button.arm-tip-opt:nth-of-type(3) | button | ■ Chisel (c) |  [focusable] | K10 | Y |
| 5 | overlay:.brush-shape-menu |  | div.arm-tip-grid > button.arm-tip-opt:nth-of-type(4) | button | ▬ Streak (c) |  [focusable] | K10 | Y |
| 6 | overlay:.brush-shape-menu |  | div.arm-tip-grid > button.arm-tip-opt:nth-of-type(5) | button | ◯ Ring (c) |  [focusable] | K10 | Y |
