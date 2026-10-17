# DOM dump (F0) — notes

Capture of every interactive element in the shipping UI, as the app boots today, for the Walnut & Copper prep. Written by `prep/scripts/dom-dump.js`; consumed by workstream A (inventory), F3 (accessibility) and F4 (keyboard order). Captured 2026-10-17 at HEAD `c4796da` with Chrome 155.0.8059.80 (headless), viewport 1584×805 CSS px, DPR 1, `--ui-scale` 1.

## Files

| File | What |
|---|---|
| `controls.json` | The record: `env`, `counts`, `sections`, `sectionOpenLog`, `overlaysAtBoot`, `scrollReset`, `controls[]` (845 records), `lazy[]` (index of the four lazy dumps), `problems`, `pageExceptions` |
| `controls.md` | Human copy: environment, counts per surface / role / element / section, the sections table, overlays at boot, lazy UI index, and all 845 controls as one compact table |
| `lazy-radial-menu.json` | The E-key radial menu (`#radialMenu`, 10 controls) |
| `lazy-colour-picker.json` | The shared colour picker popover (`.cp-pop`, 18 controls), opened from the top bar's `#colorPicker` well |
| `lazy-presets-popup.json` | The Presets panel (`.mixer-presets-panel`, 18 controls) |
| `lazy-arm-tip-menu.json` | The per-arm tip menu (`.arm-tip-menu`, 7 controls), opened from the first `.arm-tip-btn` in Multi-Brush |
| `NOTES.md` | This file |

## How to run

```bash
node prep/scripts/dom-dump.js            # capture -> prep/baseline/dom/ (about 60 s)
node prep/scripts/dom-dump.js --check    # re-capture into prep/work/dom-check/ and diff; exit 1 on any difference
```

No dev server, no Electron, no `npm install`: the script boots its own headless Chrome through `scripts/test/radial-menu/driver.js` (`boot()`: own static server on the repo root, scratch profile in the OS temp dir with PhotoSafe, the startup fork and the first-run hint already answered, trusted input over CDP) and closes it in a `finally`. `CHROME=` overrides the browser. It never attaches to port 9333.

## What it does, in order

1. `boot({ seed: { 'swirlResetHint.v1': '1' } })`, then waits until `document.getAnimations().length === 0` (the `.ui-enter` entrance animations) plus 300 ms. The driver has already hidden `#photoWarn` and waited for `#splash-screen` to go.
2. Records the environment (`Browser.getVersion`, viewport, DPR, `--ui-scale`, `ui.layoutChoice`, hidden `data-ui-key` cells, whether `#custom-titlebar` is present/visible, body classes, fold state of both bars, HEAD commit).
3. Installs a page-side library (`window.__dd`) and snapshots **visibility at boot** for every element matching the selector (a `WeakMap`, no DOM mutation), lists the sections (`#sidebar-left .sidebar-section` then `#sidebar-right .sidebar-section`) and the overlays / dialogs / live regions present in the DOM.
4. Opens the left bar if `window.Sidebars.left.isCollapsed()` (a trusted click on `.lsb-rail-label`; not needed at 1600 px wide, where it boots open).
5. For every collapsed section: `scrollIntoView` on its `.section-title`, then a **trusted Shift-click** (`Input.dispatchMouseEvent` with `modifiers: 8`) at the title's centre, so `toggleSection(sec, additive=true)` (js/20-mixer-layout.js:9226) keeps the others open; verifies `aria-expanded="true"`, with a synthetic `MouseEvent('click', { shiftKey: true })` on `.section-header` as fallback (not needed in this run). Result: 17/17 open, all by the trusted click (`sectionOpenLog`).
6. Scrolls both bars back to the top **instantly** (see nondeterminism below), then enumerates the selector from the brief, verbatim plus the three containers: `button, input, select, textarea, a[href], [role], [tabindex], [contenteditable], summary, label, .section-title, .mixer-channel, .sidebar-section`.
7. Roles and names: `DOM.getDocument({ depth: -1, pierce: true })` + `DOM.querySelectorAll` (same selector, same document order as the page-side list; the two lists are checked index by index on tag and id) give each element's `backendNodeId`; `Accessibility.getFullAXTree` is joined on `backendDOMNodeId`. A node the AX tree does not have or marks `ignored` gets a page-side role (explicit `role` or the HTML implicit role) and name (aria-labelledby → aria-label → `label[for]` → wrapping label → text → title); `nameSource` says which (`cdp`, `fallback:ignored`, `fallback:no-ax-node`). `axProps` keeps the AX property bag (`expanded`, `pressed`, `checked`, `focusable`, …) when there is one.
8. Lazy UI, each opened with trusted input, dumped with the same mapping scoped to its root, closed with Escape and verified closed: radial menu (pointer over the canvas centre, tap E), colour picker (click `#colorPicker`), presets popup (click `#mixerPresetsTrigger`), arm-tip menu (click the first `#sidebar-left .arm-tip-btn`). Each file also lists `newOutsideRoot` (elements that appeared with the popup but outside its root; none in this run) and `rootInDomAfterClose` (`#radialMenu` and `.mixer-presets-panel` stay in the DOM hidden; `.cp-pop` and `.arm-tip-menu` are removed).

## What a record holds

`order` (document-order index), `surface`, `section`, `tag`, `type`, `id`, `classes`, `role`, `name`, `nameSource`, `roleAttr`, `aria` (every `aria-*`), `dataAttrs` (every `data-*`), `tabIndex` / `tabIndexAttr`, `labelFor` (text of `label[for=id]`), `labelledBy` (text of the `aria-labelledby` targets), `wrappingLabel`, `title`, `text` (first 80 chars, not for containers), `visibleAtBoot` (`null` = created after boot), `presentAtBoot`, `visibleNow`, `hiddenAttr`, `inAriaHidden`, `rect` (CSS px, both bars scrolled to the top), `parentChain` (`tag#id.classes` from the parent up to the surface root); for form controls also `value`, `checked`, `min/max/step`, `disabled`, `readOnly`, `nameAttr`, `placeholder`, `options`, `selectedText`; `href` for links, `htmlFor` for labels; `sectionMeta` on `.sidebar-section` records and `channelMeta` on `.mixer-channel` records.

`surface` rules: nearest of `#mixer-strip`, `#sidebar-left`, `#sidebar-right`, `#canvas-area`, `#custom-titlebar` (→ `titlebar`); otherwise the element's top-level ancestor under `<body>`: `overlay:<id>` when it has an id, `overlay:.<first-class>` when it only has classes, `main-area` for the fold tabs that sit in `#main-area` beside the bars, `body` for direct children.

`section`: the nearest `.sidebar-section`'s title text, or the nearest `.mixer-channel`'s label (`data-ui-label` first, then `.ch-label` text unless that label is the material `<select>`, then `data-ui-key`).

## What it found (headline numbers; the tables are in controls.md)

- **845 controls, 17 sections** (3 left: Brush, Multi-Brush, Stroke and replay; 14 right: Swirl Together … Settings). Only Brush is open at boot; the other 16 are collapsed.
- Per surface: sidebar-right 491, sidebar-left 149, mixer-strip 35, canvas-area 9, titlebar 3 (present in the web build, hidden), main-area 2 (the two fold tabs), quality-underbar 10 (a body child, so it reads `overlay:quality-underbar`), skipMenu 4, photoWarn 7, hotkeyOverlay 5, recDrawer 55, deletePaletteModal 2, focus-mode-hint 1, mixer-more-panel 1, mpInvitePop 9, mpRoomMenu 3, `.arm-colors-panel` 18, and **`overlay:.controls` 41**: the original static `.controls` panel from index.html that js/20 did not re-parent, still in the DOM with `display: none` (41 labels/inputs the user never meets; the inventory should know they are orphans, not controls).
- Per role: button 284, LabelText 239, checkbox 95, slider 94, combobox 36, generic 28, radio 10, textbox 8, image 8, group 6, link 6, spinbutton 6, ColorWell 5, listbox 3, status 3, dialog 2, radiogroup 2, switch 2, and one each of heading, alert, application, DisclosureTriangle, menu, menuitem, menuitemcheckbox, img.
- Visible at boot 112; hidden at boot 725; created by opening a section 8 (the Multi-Brush arm row: `.arm-picker`, the four `.arm-mode-btn` radios, `.arm-push-btn`, `.arm-tip-btn`, built when the section opens).
- **Role/name source: 316 from the CDP AX tree, 529 from the page-side fallback.** 478 of the 529 are elements that are not rendered even with every section open (`visibleNow: false`: conditional sub-blocks such as Effects 70, Settings 60, Kaleidoscope 42, Text 42, the recDrawer 55, the orphan `.controls` 41, modals and popups); Chrome builds no AX node for `display: none` content, so a fallback is the only option there. The 51 rendered fallbacks are: the 17 `.sidebar-section` and 10 `.mixer-channel` containers (generic, ignored), labels the AX tree folds into their control's name (ignored), and 6 `aria-hidden="true"` canonical inputs behind proxies (`#randomColor`, `#stepPalette`, `#colorGate`, `#mutationScope`, `#visualResolution`, `#physicsResolution`; `inAriaHidden` is true for 7 records).
- AX names follow CSS `text-transform`: section titles come back as "BRUSH", "SWIRL TOGETHER" (the `section` field uses the DOM text, "Brush"). F3 should expect the uppercase form from any AX-based tool.
- `data-ui-key` is **not** on `.sidebar-section` elements (the sections table's `uiKey` column is empty by design); it is on the `.mixer-channel` cells (`Fluid`, `Viscosity`, `Isolation`, `Color Blend`, `Time`, `Density`, `Velocity`, `Color`, `Brush Size`, `Multi-Brush`) and on the Settings → Interface checkboxes as `strip:<key>` / `section:<title>` / `chrome:Quality bar` (js/43-ui-visibility.js:442). Sections are keyed by title.
- 24 overlays / dialogs / live regions in the DOM at boot, none visible: `#photoWarn` (dialog, hidden by the driver), `#hotkeyOverlay`, `#deletePaletteModal`, `#recDrawer`, `#mixer-more-panel` (group), `#mpInvitePop` (dialog), `#mpRoomMenu` (menu), `#focus-mode-hint` (status), and the live regions `#mpError` (alert), `#multiplayerStatus` (status), `#mpActivity`, `#paletteNote` (status), `#recStripStatus`, three `.hk-picker-note`, `.pw-unprotected`. `#radialMenu` does not exist until E is first pressed.
- No page exceptions during the run; `problems` is empty.

## Nondeterminism found and how it was pinned

| What moved between two runs | Cause | Pin |
|---|---|---|
| Every `sidebar-right` rect by 46 px | After opening Settings the bar is scrolled ~3990 px down; `#sidebar-right` has `scroll-behavior: smooth` (css/21-sidebar.css:43), so a plain `scrollTop = 0` animates and the dump measured mid-flight | `style.scrollBehavior = 'auto'` around the reset (js/20 does the same at 9278–9281), then a 400 ms settle and a verification that nothing is still scrolled (`scrollReset` in controls.json). Rects were identical across the next two runs. |
| `#resetAppHint` (role note) and its "Got it" button present in one run | The one-time Reset-app note (js/60-reset-app.js:363) appears ~4 s after a quiet boot and lives 30 s | Seeded `swirlResetHint.v1 = '1'` into the scratch profile, the same mechanism the driver uses for the other first-run hints |
| `#fpsCap` value "72" ↔ "60", options "28.8 fps … Native (144 Hz)" ↔ "30 fps … Native (120 Hz)" | The FPS Limit options are built from the display refresh rate the app measures at boot (js/05i-sim-stats.js:1231–1309, options at js/05d-input-replay.js:724); headless Chrome reported 144 Hz in one run and 120 Hz in the next | Not pinnable without an app setter; `--check` excludes `value`, `text` and `selectedText` of `#fpsCap` only. Reported, not decided. |

`--check` also excludes `env`, `axProps` and the `value` of `input[type=color]` wells (the brush colour may start Random; it did not differ in these runs). Everything else, rects included, is compared.

## Observed `--check` result

`node prep/scripts/dom-dump.js --check` → `CHECK PASS: 845 controls, 17 sections, 4 lazy dumps identical to the baseline`, exit 0 (2026-10-17, third run after the two pins above; the log is `prep/work/dom-check/check-run.log`).

## Caveats

- **Web build in headless Chrome, not Electron.** `#custom-titlebar` is in the DOM but hidden (`body.web-mode`); its three controls are recorded with `visibleNow: false`. Electron adds the titlebar and a window fade, nothing else in the DOM.
- **Viewport 1584×805 at DPR 1, `--ui-scale` 1** (the driver's 1600×900 window minus browser chrome). Rects are in CSS px with both bars scrolled to the top; with every section open most of the right bar lies below the viewport, so large `y` values are expected. Elements with `display: none` have a 0×0 rect at 0,0.
- **`visibleNow` means rendered** (has a client rect and `visibility` is not `hidden`). Zero-size and `aria-hidden` elements still count as rendered; use `rect`, `inAriaHidden` and `aria` to tell them apart.
- **Scratch profile = app defaults**: layout "full" (nothing hidden by js/43; `hiddenUiKeys` is empty), left bar open, Brush section open, `fpsCap` as measured. A user's profile would differ in collapse state (persisted by section title) and hidden cells.
- **Not opened / not dumped:** the F1 hotkey overlay is in the main dump (static markup, hidden); the preset `⋯` menu inside the Presets panel, the Swirl Together `⋯` room menu and Invite popover (both in the DOM hidden, so in the main dump, but not shown as a room would show them), the More panel (`#mixer-more-panel`, only appears below ~900 px wide), the Settings delete-palette modal, the close-ask dialog, the pen window (a separate window), and the SAM / palette-from-image panels were not opened. Trusted Shift-click opened every section, so the synthetic fallback was never exercised.
- **Multi-Brush at one arm:** the arm row (and the arm-tip menu) is dumped for arm 1 only; more arms repeat the same controls per arm.
- The page-side fallback role vocabulary is Chrome's (`LabelText`, `ColorWell`, `DisclosureTriangle`, `generic`) so it lines up with what the AX tree returns for rendered siblings.
- `controls.md` is ~100 KB (one row per control); `controls.json` is ~800 KB with 1-space indentation.

## Open questions

- `overlay:.controls` (41 orphaned labels/inputs from the static `.controls` panel, `display: none`): should the inventory list them as dead markup to prune, or do any still back a control through their id? (Report only; F0 does not decide.)
- `#fpsCap` options depend on the measured refresh rate, so any screenshot or a11y gate that includes the Simulation section's FPS Limit row will see run-to-run text changes in headless Chrome. F1/F3 should exclude or pin that control the same way.
