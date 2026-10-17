# UI map: how the Swirl Together UI is built

Orientation for every later prep agent, so nobody re-derives it from 9,400 lines of `js/20-mixer-layout.js`. Written 2026-10-17 at HEAD `c4796da` against the DOM dump `prep/baseline/dom/controls.json` (web build, headless Chrome 155, 1584×805, `--ui-scale` 1). Companion to `prep/inventory.md` (every control) and `prep/baseline/dom/NOTES.md` (how the dump was taken). Line numbers are for HEAD `c4796da`.

## 1. Build order (what happens, in order, from the first byte to a settled UI)

| Step | What | Where |
|---|---|---|
| 1 | `index.html` is parsed. `js/00a-boot.js` runs **before the stylesheets** (desktop build only: puts boot classes on `<html>`, raises the boot cursor through an injected `<style id="boot-cursor-style">`). | index.html:225–230; js/00a-boot.js:366–370 |
| 2 | 12 stylesheets load in order (section 3), then the inline `#photoWarn` `<style>` (index.html:249–301). | index.html:231–242, 249 |
| 3 | Static `<body>` markup: `#splash-screen` (519), `#custom-titlebar` (528), 8 window-resize edges / corners (540–547), `#canvas-area` > `#canvas-wrapper` (553–554: size readout, 8 `.resize-handle`s, `#layers-container` with `#layer0…9`, `#customCursor`) and `#statsPanel` (581), the **static `.controls` panel** (633, the whole old sidebar: every slider, checkbox, select and panel the app ships, in its original order), `#recDrawer` (1599), `#hotkeyOverlay` (1609), `#deletePaletteModal` (1991). `#photoWarn` (302) is a dialog with its own synchronous inline script (328–420) so it exists in the first painted frame. | index.html |
| 4 | Scripts at the end of `<body>` (index.html:1727–1989): `00b-dialog-focus`, `00-window-controls`, `01-config` (canvas fit, palette UI), `01a-param-registry` (SLIDERS / CHECKBOXES / SELECTS), `02…`, `09-settings-manager`, `11-settings-interface`, `12-save-load`, bindings `05*`, feature modules `13…56`, then **`js/20-mixer-layout.js`** (1879), then the modules that mount into the built layout: `31-brush-cursor`, `32-file-drop`, `33-brush-shapes`, `34-mandala-mode`, `63-kaleido-guides`, `35-zoom-view`, `36-display-mode`, `47-pen-window`, `37-nav-idle-glow`, `38-button-audit`, `42-perf-tiers`, `43-ui-visibility`, `46-strip-more`, `45-breathing`, `49-hotkey-binds`, `58-radial-menu`, `59`, `66-skip-menu`, `67`, `50-look-links`, `51`, `52-demo-clock`, `53`, `54-phone-pads`, `55`, `60-reset-app`, `61-room-report`, `62-canvas-readout`, `64a`, `64-colour-picker`, `65-palette-from-image`, `68-dither`. | index.html:1727–1989 |
| 5 | On `DOMContentLoaded`, js/20 schedules `initMixerLayout` on a rAF, **800 ms later on the web** (after the splash title animation) and at once on the desktop build (`Boot.usesWindowFade`). | js/20:14–33 |
| 6 | `initMixerLayout` (js/20:35–157): guard on `#mixer-strip` (build once); `buildMixerStrip(controls)` (46) then `buildSidebar(controls)` (47) **re-parent live nodes by id out of `.controls`** (`moveControlGroup` / `moveCheckboxGroup` / `moveEl`, 9359–9387, which also wipe the moved group's inline `style`); `.ui-enter` on strip / sidebar / canvas-area on the web (54–58); `#main-area` is created (61–62); the strip is inserted before `#canvas-area` (65), `#main-area` before it (68), `#canvas-area` moved inside (71), `#sidebar-right` appended (74); `buildLeftSidebar(strip)` (79) is inserted before `#canvas-area` with its `.lsb-edge` fold tab (81–83); `buildRightFold(sidebar)` inserts `.rsb-edge` before the right bar (87); `.controls` is hidden (90, and `body > .controls { display:none !important }` css/20-mixer-strip.css:221); Brush Size readout sync (93–133); `initResponsiveScale()` (136, section 4); `initSidebarResize(sidebar)` (139); `orchestrateEntrance` (142, 239–318: `.ui-ready` staggered 100 / 180 / 260 / 320 ms, then `.ui-settled`, splash removed 800 ms after `ui-ready`); `fitCanvasIntoArea` (153–156). | js/20:35–157 |
| 7 | `buildSidebar` ends with `stampGroupRows(sidebar)` (2645; right bar only, section 6) and `buildQualityUnderbar(sidebar)` (2646 → 2675–2743, appends `#quality-underbar` to `<body>` at 2719). | js/20:2611–2649 |
| 8 | After js/20 the mount-ins run: js/43 inserts the Interface block into Settings and runs `apply()` (hides, re-stamps both bars' `--rows` / `--i`, fixes dividers); js/46 builds `#mixer-more` + `#mixer-more-panel` from a body `MutationObserver`; js/49 / js/58 insert the Hotkeys / Radial Menu blocks into Settings (found **by title text**); js/62 / js/08a / js/60 / js/52 add `.qub-size`, `#slowdownCell`, `#resetAppBtn`, `#demoClock` / `#playtestLabel` to the underbar; js/17 appends `.hk-cap` key caps; js/54 / js/61 add buttons into the Swirl Together panel; js/06e moves `#mpInvitePop` / `#mpRoomMenu` onto `<body>` on first use; js/50 mounts `.look-link-foot` into the Presets panel. | A8 header, A1 §1.10, A3 |
| 9 | The startup fork `#uiForkModal` (js/43:485–615) waits for PhotoSafe, the build and the splash, then asks Simple / Everything once (`fluidui.uiFork.ack.v1`). | js/43 |

Compact windows (js/13-compact-mode.js): `body.compact-ui` folds both bars and moves `#mixer-strip` **whole** into `#sidebar-right` after `.rsb-rail` (js/13:56–62); css/21-sidebar.css:775–850 re-grids it. Focus mode (`body.focus-mode`, js/21) hides both bars, the strip, the underbar and the titlebar (css/22-overlays.css:8–73).

## 2. DOM tree of the shipping layout (depth 3 from `<body>`, with the builder for each node)

Static = authored in `index.html` (line); moved = authored in `index.html` and re-parented by js/20; built = created by the named function. Dump surfaces in brackets.

```
<html data-? none; .boot-fade/.booting/.boot-cursor during boot (js/00a); --ui-scale, --sidebar-width, --app-height written inline (section 4)>
<body class="web-mode|electron-mode photosafe-on [compact-ui] [focus-mode] [rec-*] [export-capturing] [text-arrange-active] [layer-transform-active] [cp-sampling] [transparent-mode] [display-*] [zoom-mode]">
├ nav#skipMenu.skip-menu[data-group=system]            built js/66-skip-menu.js:85–151, body's FIRST child       [overlay:skipMenu]
│  ├ #skipMenuTitle, .skip-menu-map > .skip-menu-canvas + 4 × button.skip-menu-option[data-region]
│  └ #skipMenuFoot.skip-menu-foot > .hk-cap
├ #photoWarn[role=dialog]                                static index.html:302 (+ own <style> 249–301, own script 328–420) [overlay:photoWarn]
│  └ .pw-card > h1#pwTitle, p#pwDesc, label.pw-check > #pwProtect, .pw-unprotected[aria-live], .pw-buttons > #pwExit, #pwContinue
├ #splash-screen                                        static index.html:519; web only, removed after boot (js/20:21–33, 306–318)
├ #custom-titlebar.ui-enter                             static index.html:528; shown only under body.electron-mode (js/00-window-controls.js) [titlebar]
│  ├ .titlebar-drag-region > .titlebar-title
│  └ #min-button, #max-button, #close-button (.titlebar-button)
├ .window-resize-edge ×4, .window-resize-corner ×4      static index.html:540–547 (Electron only)
├ #mixer-strip[data-group=core] (.ui-enter)             buildMixerStrip js/20:805–879, inserted before #canvas-area (js/20:65)   [mixer-strip]
│  ├ .mixer-channel[data-ui-key=Fluid].ch-material      faderChannel js/20:1127 (the label IS select#materialMode, moved from .controls)
│  │   ├ .ch-header > .ch-label (> #materialMode) + .ch-value#curlValue
│  │   └ .ch-fader > .fader-stack.fader-stack-inline > .fader-scale + input#curl
│  ├ .mixer-channel[data-ui-key=Viscosity|Isolation|Velocity]   faderChannel (plain faders: #viscosity, #velocityInfluence, #velocityDissipation)
│  ├ .mixer-channel[data-ui-key="Color Blend"|Time|Density]      faderChannel + attachPerceptualProxy js/20:1053 (curved faders)
│  │   └ .ch-fader > .ch-canonical (display:none, holds input#colorBlend|#timeScale|#densityDissipation) + input.ch-perceptual#<id>Perceptual
│  ├ #mixer-more.mixer-more > button#mixerMoreBtn       js/46-strip-more.js:247–268, inserted after the last fader; hidden until a fader parks
│  ├ .mixer-divider                                     divider() js/20:9389
│  ├ .mixer-channel.ch-wide[data-ui-key=Color]          buildColorChannel js/20:1203–1360
│  │   ├ .ch-toggle-row > .ch-seg-switch[role=group] (One / Random / Palette) + .ch-gate-toggle (Limit); hidden mirrors #randomColor #stepPalette #colorGate
│  │   └ .ch-toggle-row.ch-nudge-row > input#colorPicker.ch-color-input + .ch-nudge-btn (Ignite) + .ch-ignite-lock[role=button]
│  ├ .mixer-divider
│  └ .mixer-stack                                       js/20:869–876
│      ├ .mixer-stack-top > .mixer-presets-channel[data-ui-key=Presets] > #mixerPresetsTrigger     buildPresetsChannel js/20:1733–2363
│      └ .mixer-actions[data-ui-key=Transport] > button.btn--destructive (Clear, moved) + .transport-row > #pauseBtn, #freezeBtn   buildActionsChannel js/20:1517–1558
├ #main-area                                            js/20:61–62, 68
│  ├ #sidebar-left[aria-label=Brush] (.collapsed when folded)        buildLeftSidebar js/20:2384–2530          [sidebar-left]
│  │   ├ .lsb-head > .mixer-channel[data-ui-key="Brush Size"] (moved from the strip, 2391–2394) + .lsb-steady[data-ui-key=Stabilization] (moved from the Brush panel, 2422–2431)
│  │   ├ .lsb-body > .sidebar-section ×3: Brush (makeSection js/20:819 + buildBrushPanel 5399), Multi-Brush (847 + faderChannel 837 + buildArmColorsDropdown 8610), Stroke and replay (buildBrushSection 5023, pushed at 2633)
│  │   └ .lsb-rail > .lsb-rail-size + button.lsb-rail-label + 3 × button.lsb-rail-section[data-group]     js/20:2433–2462 (shown only folded)
│  ├ .lsb-edge > button.lsb-toggle.btn--icon            js/20:2402–2408, inserted 83 (zero-width sibling; the fold tab)     [main-area]
│  ├ #canvas-area (.ui-enter; [data-rec-count], [data-export-clock])   static index.html:553, moved in at js/20:71          [canvas-area]
│  │   ├ #canvas-wrapper > #canvas-size-display, 8 × .resize-handle, #layers-container > #layer0…9, #customCursor, canvas#canvas (static 554–578);
│  │   │   + svg#kaleidoGuides (js/63:271), svg#mandalaGuides (js/34:242), svg#strokeLockGuide (js/56:517)   (lazy)
│  │   ├ #statsPanel.stats-panel                       static index.html:581 (Debug Info; Draggable js/10)
│  │   └ lazy: #text-overlay-container, canvas#text-arrange-canvas (js/23:193–207, 776–783), #zoomBadge, #zoomModeFrame (js/35:136–157), #captureArea (js/04g:19–60), #recTakePrompt (js/03:305), .remote-cursor (js/06e:180)
│  ├ .rsb-edge > button.rsb-toggle.btn--icon            buildRightFold js/20:2540–2609, inserted 87 (shown only in compact windows)   [main-area]
│  └ #sidebar-right (.collapsed in compact windows)     buildSidebar js/20:2611–2649                                 [sidebar-right]
│      ├ .rsb-rail > 4 × button.rsb-rail-label (Controls, Color, Presets, Together)    buildRightFold js/20:2554–2584 (first child; shown only folded)
│      ├ .sidebar-section[data-group=core] ×5          Swirl Together (buildMultiArtistSection 8361), Simulation (4156), Colors and palettes (4524), Layers .section-layers (3617), Mutate shader #mutation-section (2915)
│      ├ .sidebar-section[data-group=expressive] ×5    Effects (4455), Animations (3786), Audio (7205), Kaleidoscope (4133), Text (6315)
│      ├ .sidebar-section[data-group=system] ×4        Focus (7935), Display (4541), Export (8022), Settings (8390)
│      │   (each: makeSection 9302 → .section-header[title] > span.section-title[role=button][tabindex=0][aria-expanded] + span.section-chevron; .section-body; inline --rows/--i)
│      └ .sidebar-resize-handle                        initSidebarResize js/20:207–235 (appended last; writes --sidebar-width)
├ .controls (display:none)                              static index.html:633; the orphaned old sidebar, 41 dump records        [overlay:.controls]
├ #quality-underbar (position:fixed; .qub-shading)      buildQualityUnderbar js/20:2675–2743, body.appendChild 2719             [overlay:quality-underbar]
│  ├ .qub-dd ×3 (> .qub-dd-cap, button.qub-dd-btn[aria-haspopup=listbox], div.qub-dd-list[role=listbox], select.qub-native-hidden)   makeQubDropdown js/20:2745+
│  ├ .qub-size (js/62), #slowdownCell (js/08a:484–513, on demand), #resetAppBtn (js/60:331), #demoClock / #playtestLabel (js/52)
├ #recDrawer.rec-drawer.studio-drawer[data-group=expressive]   static index.html:1599; filled by buildAudioDrawerControls js/20:7652   [overlay:recDrawer]
│  ├ #recResizeHandle > .rec-grabber; .studio-tabbar > .studio-tabs + #studioCloseBtn
│  └ #audioDrawerPanel > .audio-construction-note, #audioDrawerEnableHost, #audioCueEditorHost (js/40b), #audioDrawerLanes (js/40), details.audio-live-block
├ #hotkeyOverlay > .hotkey-modal                        static index.html:1609 (role added by DialogFocus.hold at first open)      [overlay:hotkeyOverlay]
├ #deletePaletteModal.delete-modal                      static index.html:1991                                                    [overlay:deletePaletteModal]
├ .arm-colors-panel.mixer-presets-panel[data-group=core]       buildPresetsChannel js/20:1775–1780 (built at boot, hidden)          [overlay:.arm-colors-panel]
├ #mixer-more-panel.arm-colors-panel[role=group][data-group=core]   js/46:270–290 (built at boot, hidden)                           [overlay:mixer-more-panel]
├ #mpInvitePop[role=dialog], #mpRoomMenu[role=menu]      static index.html:1445, 1477 inside #multiArtistPanel; moved to <body> by js/06e:771–776   [overlay:mpInvitePop / mpRoomMenu]
├ #focus-mode-hint[role=status]                         js/21-focus-mode.js:50–55                                                 [overlay:focus-mode-hint]
└ lazy body children: see section 7
```

The three surfaces the user meets, in reading order: `#mixer-strip` (top), `#sidebar-left` (left), `#canvas-area` (centre), `#sidebar-right` (right), `#quality-underbar` (bottom, fixed, trimmed to `#canvas-area`'s width by `place()` js/20:2724–2742). The skip menu's four regions are exactly those: Left sidebar, Top nav, Right sidebar, Bottom nav (js/66:33).

## 3. Stylesheets, in load order, and the style nodes JavaScript injects

| # | File | Bytes | What it holds (one line) |
|---|---|---|---|
| 1 | `css/00-tokens.css` | 3,582 | `:root` tokens: `--accent #ec3013` (single accent), `--ground-950…500`, `--ink-100/300/500`, `--heat-*`; note at the top says `--ui-scale` and the responsive font / space scales live in `init-responsive.css` |
| 2 | `css/01-buttons.css` | 17,514 | the button system: `[data-group]` → `--sec-h` / `--sec-c` (43–45); `button, .btn` element selector (56+); states `.active` / `[aria-pressed="true"]` (148–155), `.btn--emphasis`, `:disabled` / `[aria-disabled]`, `.btn--ghost`, `.btn--icon`, `.btn--destructive` (339–357), `.btn--record`, `.btn--slow-*`; `prefers-reduced-motion` block (418) |
| 3 | `css/styles.css` | 51,916 | legacy base: titlebar, canvas area and handles, colour wells, layers panel, delete-modal family, hotkey overlay, stats panel, rec drawer (light + dark variants 942–977), rec badges, `prefers-reduced-motion` global block (1391), `body.photosafe-on` transitions (1381) |
| 4 | `css/slider-styles.css` | 8,266 | range inputs: `--pos` from `--min/--max/--val` (17–28), heat fill, focus ring (76–87) |
| 5 | `css/mask-editor.css` | 17,713 | `#maskEditorOverlay` and its wizard, tabs, tools |
| 6 | `css/light-source.css` | 552 | light-source grid bits |
| 7 | `css/20-mixer-strip.css` | 51,707 | `#quality-underbar` (13–44, 46–53 hidden natives), `body > .controls { display:none !important }` (221), `#mixer-strip` and cells (226–602), Presets cell / panel (608–839, 1405–1500), `.brush-shape-menu` skin (1354–1399), More cell / panel (1544–1603), brush tip rows, arm rows |
| 8 | `css/21-sidebar.css` | 84,632 | `#sidebar-right` (40–48), `.sidebar-section` grid collapse (51–65), header / title / chevron / body (67–140), group gradients `--row-h`, `--row-pad`, `--g-core/expressive/system` (164–168), title colours and slices (173–190), `.snap-collapse` (197), compact-ui strip grid (775–850), Swirl Together panel (1121–1513), remote cursors (1520–1570), `.mp-peer-touch` (1472–1484), Kaleido feature heads (1590–1668), Effects fx rows (2274–2296), Display rows (2168–2222), `#sidebar-left` (2311–2458), right fold (2475) |
| 9 | `css/22-overlays.css` | 86,115 | focus mode (8–73), `#focus-mode-hint` (75), collider menus (124–185), Mutate (195–470), layer rows (737–891), layer transform (991–1085), text arrange (1016, 1682–1716), hotkey picker / bind bar / wheel / toast (1114–1437), radial menu (1488–1627), `.ui-hidden` (1940), Interface block (1953–1963), startup fork (2012–2040), skip menu (2047–2114), `.fx-tip` (2127–2155), reduced-motion block (2119), underbar extras (2413–2568); 48 of the 77 `!important`s |
| 10 | `css/23-colour-picker.css` | 15,491 | `.cp` / `.cp-pop` / loupe / toast / palette row (`#palettePreview`, chips, `#paletteSelect`, `.palette-list`) |
| 11 | `css/24-palette-from-image.css` | 4,143 | `.palette-extract-host`, `.pfi` |
| 12 | `css/init-responsive.css` | 20,966 | `--ui-scale: 1` default and the `--font-*` / `--space-*` scales (8–19), splash (23–57, 181–192), entrance classes (198–202), the **zoom list** (260–305), layers panel sizing, `max-height … / var(--ui-scale)` notes (616–628) |
| — | inline `<style>` in `index.html:249–301` | — | `#photoWarn` and `.pw-*` only; exempt from `auditButtons()` |

Total linked CSS ≈ 367 KB (12 files). `js/00a-boot.js` is the only script above the stylesheets (index.html:230).

**Style nodes written from JavaScript** (unlayered: once app CSS moves into `@layer legacy`, each of these beats it; cascade-layer step 1 must list them):

| Node | Where | Content | Lifetime |
|---|---|---|---|
| `<style id="boot-cursor-style">` | js/00a-boot.js:366–370 (desktop build) | `html.boot-cursor, html.boot-cursor * { cursor: url(…) …, progress !important }` | removed when the title card dissolves (`stopCursor`) |
| anonymous `<style>` | js/32-file-drop.js:75–81 | `.file-drop-hover { outline: 2px dashed rgba(110,200,255,.85) !important; outline-offset: -2px; background-color: rgba(110,200,255,.08) !important }` | permanent |
| `<style id="samModalStyles">` | js/16-sam-integration.js:265–279 | `@keyframes fadeIn` / `fadeOut` for `#samDownloadModal` / `#depthDownloadModal` (whose own styles are inline `cssText`) | permanent once a model download starts |
| (separate document) `<style>` inside the pen window | js/47-pen-window.js:275+ (`popupHtml`) | the whole pen-input window's CSS, in its own `window.open` document | lives with that window; not in the app document |

Inline `style=""` attributes and `style.cssText` strings are the other unlayered source (see inventory open question X4): Text section, Export / Settings blocks, the two light panels, `#brushCursor` and the canvas guides, `#zoomBadge`, the SAM / depth modals, five toasts, `#reconnectBtn`, two Simulation labels.

## 4. `--ui-scale` and the other `:root` writes

| Property | Written by | When | Read by |
|---|---|---|---|
| `--ui-scale` | `initResponsiveScale` js/20:159–205 (`computeScale` 165–183: 1.0 up to 1600 CSS px, then `min(1.8, 1 + (w − 1600) × 0.00036)` rounded to 0.01; 1.15 when DPR ≥ 2 at ≥ 1200 px) on `document.documentElement` | at build (184), on `resize` (185), on DPR change via a re-binding `matchMedia('(resolution: Ndppx)')` (188–196). **Never per frame.** `window.UIScale.get()` / `fromVisual(px)` (199–202) for fixed-position math | `zoom: var(--ui-scale)` on `#sidebar-right`, `#sidebar-left`, `#mixer-strip`, `#colorBar`, `.stats-panel`, `.rec-drawer`, `#hotkeyOverlay`, `.delete-modal`, `#settingsToggleBtn`, `#settingsPanel`, `.mask-editor-overlay`, `.fps-notification`, `.arm-colors-panel`, `.fx-tip`, `#recipePill` (css/init-responsive.css:260–305); `--font-xs…xl`, `--space-xs…lg` (8–19) and a few `calc(Npx * var(--ui-scale))` font sizes (453–604); `max-height: … / var(--ui-scale)` for the layers panel (628). Five of the fifteen zoom selectors match nothing in the dump (`#colorBar`, `#settingsToggleBtn`, `#settingsPanel`, `.fps-notification`, `#recipePill`); C's unmatched-rule audit should confirm. |
| `--sidebar-width` | `initSidebarResize` js/20:207–235 (pointer drag on `.sidebar-resize-handle`, 220–420 px divided by the zoom) | during a drag only | right-bar width (css/21-sidebar.css) |
| `--app-height` | js/01-config.js:1557 | on viewport resize | the mobile / focus `#canvas-area` sizing (comment 1551) |

Because the bars and strip are **zoomed**, baselines at 1920 and 2560 px wide render at `--ui-scale` 1.12 and 1.35; anything positioned in screen px over a zoomed element divides by the scale (Presets panel `positionPanel` js/20:2212–2230, More panel `position()` js/46:193–204, `.fx-tip` / `.mutation-tip` placement js/20:4396, 3448, the radial menu js/58:415–425). The preset ⋯ menu and the arm-tip menu are **not** in the zoom list and compute their own zoom (js/20:1919–1929). Nothing writes `:root` properties per frame today (js/37-nav-idle-glow.js was measured and kept off `#sidebar-right`); the per-frame DOM writes that do exist are inside features (light dot js/13:200–214, `#breathCue` js/45:270, the Multi-Brush `watchTick` js/20:9084–9140 that writes only on a change).

## 5. Surfaces and what builds them

| Surface | Root | Builder | Children / slice |
|---|---|---|---|
| Top bar | `#mixer-strip[data-group=core]` | `buildMixerStrip` js/20:805–879; cells by `faderChannel` 1127 (+ `attachPerceptualProxy` 1053 for brushSize / colorBlend / timeScale / densityDissipation), `buildColorChannel` 1203, `buildPresetsChannel` 1733, `buildActionsChannel` 1517; `#mixer-more` by js/46 | 7 fader cells at boot (Brush Size and Multi-Brush are built here and re-parented into the left bar), Color, Presets over Transport (`.mixer-stack`), More. Inventory A1. |
| Left sidebar | `#sidebar-left[aria-label=Brush]` | `buildLeftSidebar` js/20:2384–2530 (head, body from `pendingLeftSections`, rail, fold `set()` / `restore()`, `window.Sidebars.left`) | `.lsb-head` (Brush Size fader + `.lsb-steady`), Brush (`buildBrushPanel` 5399–6306), Multi-Brush (`buildArmColorsDropdown` 8610–9165), Stroke and replay (`buildBrushSection` 5023–5340: `buildButtonRolesBlock` 4611, `buildStrokeLockBlock` 4663). Folds below 1280 px when nothing is saved (2494–2498). Inventory A2. |
| Canvas | `#canvas-area` > `#canvas-wrapper` | static; `fitCanvasIntoArea` (js/01); overlays by js/02 (handles), 03, 04g, 23, 26, 31, 34, 35, 56, 63, 06e | Inventory A9 §7–§16. |
| Right sidebar | `#sidebar-right` | `buildSidebar` js/20:2611–2649 (14 `build*Section` calls in three contiguous colour runs), `buildRightFold` 2540 (rail + tab), `initSidebarResize` 207 | Inventory A3–A8 and the merge's right-shell table. |
| Quality underbar | `#quality-underbar` (body child, `position:fixed; bottom:0`, no background, `pointer-events:none`) | `buildQualityUnderbar` js/20:2675–2743, `makeQubDropdown` 2745+ (hidden native `<select>` + custom listbox); js/62, js/08a, js/60, js/52 add cells | Inventory A8. Settings → Interface key `chrome:Quality bar`. |
| Everything else | body children | see section 7 | Inventory A9. |

## 6. Section groups, hues and the title gradient

Three contiguous colour runs in the right bar, and the same groups on the left (comment js/20:2615–2624: core = what you paint with, expressive = what it performs, system = the app around it; colour is the only grouping signal, no headings or icons). `data-group` is set on the section by `makeSection` (9305), on `#mixer-strip` (808), and copied onto body-mounted popups / dialogs so their buttons tint (`.mixer-presets-panel`, `#mixer-more-panel`, `.cp-pop`, `.arm-tip-menu`, `.preset-menu`, `.palette-list`, `#mpInvitePop` = core; `#recMini`, `#recDrawer`, `#audioTimingPanel`, `#recTakePrompt`, `#text-arrange-bar` = expressive; `#skipMenu`, `#radialMenu`, `#uiForkModal`, `#resetAppModal`, `#hkBindBar`, `#slowdownCell`, `#openDesktopModal`, `#demoWishlistModal`, `#photoSafeOffModal` = system). `#appCloseModal` has none (A9 open question).

| Group | `--sec-h` / `--sec-c` (css/01-buttons.css:43–45) | Title solid fallback (css/21-sidebar.css:173–175) | Title gradient `--g` (css/21-sidebar.css:166–168) | Right-bar sections (`--rows`; `--i`) | Left-bar sections |
|---|---|---|---|---|---|
| core | 242 / 0.16 | `rgba(88,166,255,.78)` | `--g-core: linear-gradient(in oklch 180deg, oklch(84% .160 242) 0%, oklch(60% .131 294) 100%)` | Swirl Together (5; 0), Simulation (1), Colors and palettes (2), Layers (3), Mutate shader (4) | Brush, Multi-Brush |
| expressive | 190 / 0.15 | `rgba(86,214,205,.82)` | `--g-expressive: … oklch(84% .150 190) → oklch(60% .123 155)` | Effects (5; 0), Animations (1), Audio (2), Kaleidoscope (3), Text (4) | Stroke and replay |
| system | 250 / 0.08 | `rgba(255,255,255,.45)` | `--g-system: … oklch(84% .080 250) → oklch(60% .066 268)` | Focus (4; 0), Display (1), Export (2), Settings (3) | — |

How the slice works (css/21-sidebar.css:148–190): each group paints ONE gradient across all its labels; `background-size: 100% calc(var(--rows) * var(--row-h))` with `--row-h: 34px` (33 px header + 1 px border) and `background-position: 0 calc(var(--i) * var(--row-h) * -1 - var(--row-pad))` with `--row-pad: 9px`, clipped to text (`background-clip: text`, gated behind `@supports (background-image: linear-gradient(in oklch, red, blue))`, otherwise the solid fallback). `--rows` and `--i` are stamped inline: `stampGroupRows(sidebar)` js/20:2657–2669 at build for the **right bar only** (2645), then js/43 `restampGroups` (43:280–296, from `apply()` 43:181) for **both bars over visible sections only**, so hiding a section re-slices the ramp and the left bar's three sections get their values from js/43. **`--i` on `.sidebar-section` is inherited by every control inside it** (inventory open question X1).

Buttons: `button, .btn` take `oklch(14% calc(var(--sec-c) * .38) var(--sec-h))` fill, +18 % border and a 95 % label in the section hue (css/01-buttons.css:56+), so every control inherits its section's tint from the nearest `[data-group]`; the underbar's ghost buttons read `--sec-h` from `:root` (system). `window.auditButtons()` (js/38-button-audit.js) is the gate: any rule outside `css/01-buttons.css` that colours a button fails it, except `.btn--destructive`, `.btn--record`, `#photoWarn`. `data-accent` on the fader cells (orange / blue / purple / green / yellow / pink / cyan, js/20:1130) is set but **nothing styles it** (css/20-mixer-strip.css:268–271).

Other hue carriers worth knowing: the single `--accent #ec3013` (selection, record, focus, `.qub-dd-opt.sel`, `#zoomBadge`, Kaleido feature-head toggles); the warm collider tint `rgba(255,120,80,…)` in `.collision-controls` / `.collision-source-menu` (css/22-overlays.css:124–185, the only warm accent in the right bar); the pink `rgba(255,130,170,…)` for the selected text line and arrange chrome (js/20:6534, js/23:509); Mutate's purple `rgba(180,100,255,…)` (css/22-overlays.css:299–470); `--mp-peer` / `--peer` per-player colours (js/06e:146–171, 373–384).

## 7. Where lazy UI is created (not in the static markup, not in the main dump unless noted)

| UI | Root | Created by | When | Mount | In the dump? |
|---|---|---|---|---|---|
| Presets panel | `.arm-colors-panel.mixer-presets-panel[data-group=core]` | `buildPresetsChannel` js/20:1775–1780 | at build, hidden | `<body>` | yes (`overlay:.arm-colors-panel`, 18) + `lazy-presets-popup.json` |
| Preset ⋯ menu | `.brush-shape-menu.preset-menu` | `openPresetMenu` js/20:1902–1938 | on ⋯ click; removed on close | `<body>` (own zoom) | no |
| First-open fork, back row, `#presetPathToast` | `.preset-fork`, `.preset-path-back-row` | js/20:1942–1965, 2083–2107, 1682–1693 | on panel render by `presetPath` | inside the panel / `<body>` | no (scratch profile waived) |
| More panel | `#mixer-more-panel[role=group]` | js/46:270–290 | at init, hidden; filled when faders park (<~900 px) | `<body>` | yes (1 record, empty) |
| Colour picker popover | `.cp-pop[role=dialog]` | `openFor` js/64-colour-picker.js:611–685 | capture-phase click on any `input[type=color]`; removed on close | `<body>` | `lazy-colour-picker.json` (18) |
| Inline colour picker | `#palettePickerHost > .cp[data-variant=inline]` | `openInline` js/64:805–838 | from `#paletteAddChip` / chip dblclick | Colors section (host static index.html) | no |
| Eyedropper veil + loupe | `.cp-veil`, `.cp-loupe` | js/64:916–953 | while sampling (`body.cp-sampling`) | `<body>` | no |
| Palette list | `.palette-list[role=listbox][data-group=core]` | `openPaletteList` js/01-config.js:463–486 | on `#paletteSelect` click | `<body>` | no |
| Palette / chip context menu | `.brush-shape-menu.palette-menu` | `openPalMenu` js/01:236–268 | right-click | `<body>` | no |
| Palette from image | `#paletteExtractHost > .pfi[role=group]` | `build` js/65:438–517 | from the palette "+ New" menu or a file drop | Colors section (host static) | no |
| Arm-tip menu | `.brush-shape-menu.arm-tip-menu[role=menu]` | `openArmTipMenu` js/20:703–790 | on `.arm-tip-btn` click; removed on close | `<body>` | `lazy-arm-tip-menu.json` (7) |
| Arm rows | `.arm-row` ×N | `rebuildRows` js/20:8830–9078 | when Multi-Brush opens / count changes | Multi-Brush body | yes for arm 1 (created after boot) |
| Brush shape menu | `.brush-shape-menu` (Edit shape / Delete) | `openShapeMenu` js/20:458–507 | right-click a shape tile | `<body>` | no |
| Brush preset chips, shape tiles | `.brush-preset-btn`, `.brush-shape-btn` | js/20:5627–5658, 560–590 | with saved presets / shapes | Brush panel | no (scratch profile has none) |
| Radial menu | `#radialMenu[role=menu][data-group=system]` | `build` / `open` js/58:466–672 | E key or a mouse button set to Radial menu; emptied when closed, stays in the DOM | `<body>` | `lazy-radial-menu.json` (10) |
| Startup fork | `#uiForkModal.delete-modal.ui-fork-modal[role=dialog]` | `buildFork` js/43:485–515 | once, after PhotoSafe / build / splash | `<body>` | no |
| Interface / Hotkeys / Radial blocks in Settings | `.ui-vis-block`, `.hk-block`, `.hk-block.radial-block` | js/43:361–406, js/49:1373–1434, js/58:861–931 | at init, by `findSection('Settings')` | Settings body | yes (dump 610–688) |
| Hotkey bind bar, wheel HUD, toast | `#hkBindBar[role=dialog]`, `#hkWheel[role=status]`, `#hkToast` | js/49:735–760, 556–573, 1558–1569 | Ctrl+Shift+H / bound-key hold | `<body>` | no |
| App confirm / alert | `#appConfirmModal.delete-modal.app-confirm-modal` | `appConfirm` js/20:362–432 | first confirm | `<body>` | no |
| Close ask (Electron) | `#appCloseModal.delete-modal.app-close-modal` | js/04f:647–720 | IPC `app-ask` | `<body>` | no |
| Reset app modal + hint | `#resetAppModal[role=dialog]`, `#resetAppHint[role=note]` | js/60:250–288, 363–387 | `#resetAppBtn` click / quiet first run | `<body>` | no (hint seeded away) |
| Open in Desktop | `#openDesktopModal[role=dialog]` | js/51:79–107 | web only, once per session | `<body>` | no |
| Demo wishlist | `#demoWishlistModal[role=dialog]` | js/52:188–230 | demo edition only | `<body>` | no |
| PhotoSafe off confirm | `#photoSafeOffModal[role=alertdialog]` | js/05e:235–280 | human untick of `#photoSafeToggle` | `<body>` | no |
| Phone dialog | `#phonePadModal.delete-modal.phone-pad-modal[role=dialog]` | js/54:329–361 | Sync phone buttons | `<body>` | no (not inventoried: merge item M7) |
| Mask editor | `#maskEditorOverlay.mask-editor-overlay` | `showMaskEditor` js/15:95–120 (template 144–350) | mask / collider / shape-import flows | `<body>` | no |
| SAM / depth download modals | `#samDownloadModal`, `#depthDownloadModal` | js/16:245–342, js/23-depth-collision.js:203–227 | first model download | `<body>` | no |
| Layer transform overlay | `#layerTransformOverlay` | `LayerTransform.open` js/26:373–475 | Transform button on a layer row | `<body>` | no |
| Text arrange | `#text-arrange-canvas`, `#text-arrange-bar[data-group=expressive]` | `openArrange` js/23:764–815 | Arrange on Canvas | `#canvas-area` / `<body>` | no |
| Text list rows, room rows | `#textOverlayList > div` | `refreshList` js/20:6516–6603 | every text change | Text body | no (no lines in the scratch profile) |
| Take prompt | `#recTakePrompt.rec-take-prompt` | js/03:305–333 | after a take when the strip is off screen | `#canvas-area` | no |
| Anim slots / library rows | `.anim-slot > button`, `.anim-lib-row` | `renderSlots` js/20:3864–3914, `renderLib` 3939+ | on library / playback events | Animations body | slots empty in the dump |
| Timing chart | `#audioTimingPanel.atv-panel[data-group=expressive]` | `ensurePanel` js/40:838–857 | Visualize Audio Timing | `<body>` | no |
| Tunnel scene controls | `#audioSceneControls .audio-scene-ctl` | `buildControls` js/30:887–976 | Audio Mode = Tunnel | Audio body | no |
| Lane rows | `.atv-lane` | `buildLaneRows` js/40:1788–1900 | on extraction | drawer / sidebar lanes host | no |
| Mutate grid / cards / tip / diff / crumbs | `#mutationGrid`, `.mutation-card`, `.fx-tip.mutation-tip`, `#mutationDiff`, `#mutationChain` | js/20:3160–3265, 3397–3450, 3508–3558 | on Mutate / card pick | Mutate body; tip on `<body>` | no |
| Effects hover card | `.fx-tip` | `fxTipBuild` js/20:4352–4366 | first thumb hover / focus | `<body>` | no |
| Guides over the canvas | `svg#kaleidoGuides`, `svg#mandalaGuides`, `svg#strokeLockGuide` | js/63:271–279, js/34:242–248, js/56:517–530 | first use | `#canvas-wrapper` | no |
| Brush cursor family | `#brushCursor`, `#brushSteadyString/Hand`, `#brushCursorArms`, `#brushCursorGhostClip` | js/31:38–78, 193–213 | at init | `<body>` | no (no role) |
| Zoom badge / frame | `#zoomBadge`, `#zoomModeFrame` | `ensureBadge` js/35:136–157 | first zoom / Zoom Mode | `#canvas-area` | no |
| Capture area | `#captureArea` | js/04g:19–60 | Enable Capture on Hover / Detach | `#canvas-area` | no |
| Remote cursors | `.remote-cursor` | `makeCursorTag` js/06e:180–195 | per peer | `#canvas-area` | no |
| Toasts | `.cp-toast`, `#hkToast`, `#radialNote`, `#mpRoomToast`, `#look-toast`, `#export-toast`, `#gestureIndicator`, `#pasteIndicator`, the first-run hint | js/64:60–72, 49, 58, 06e:451–464, 50:819–833, 24:1908–1925, 05d:1934–1947, 32:239–252, 05n:712–740 | on use | `<body>` | no |
| Layer rows, path rows | `.layer-item`, `.path-layer-item` | `renderLayers` js/05k:254–680, `renderPathLayersUI` js/24:575–663 | on every layer change | `#layersPanel`, `#pathLayersList` | Sim row only |
| Underbar option lists | `.qub-dd-opt[role=option]` | `rebuild` js/20:2827–2843 | on each pill open | `.qub-dd-list` | no (lists empty in the dump) |
| Slowdown cell, demo clock, reset hint | `#slowdownCell`, `#demoClock`, `#resetAppHint` | js/08a:484–513, js/52:146–186, js/60:363 | on a measured slowdown / demo edition / quiet first run | `#quality-underbar` (re-parented to `<body>` with `.floating` when the bar is hidden) | no |
| Pen input window | its own `window.open` document | js/47:275+ | Pop Out Pen Input | separate window | no |

## 8. Contracts to keep in mind while restyling

- **Script hooks** (do-not-rename): every id above, `data-ui-key` / `data-ui-label` on strip cells and `.lsb-steady` (read by js/43 / 46 / 49 / 44), `data-group`, `data-no-scale`, `data-brush-mode`, `data-tip`, `data-mode`, `data-fx`, `data-format-id`, `data-preset`, `data-collision*` / `data-cinv` / `data-cref`, `data-pop-close` / `data-stay`, `data-owns-keys`, `.collapsed`, `.ui-hidden`, `.active`, `.mp-peer-touch`, `.open`, `.show`, `.hidden`, section **title text**. Workstream B's `prep/selector-contract.md` is the authoritative list; CSS prep's `data-ui` attribute must stay a different name from `data-ui-key`.
- **Zoomed containers**: anything positioned in screen px over `#mixer-strip`, the bars, `.arm-colors-panel`, `.delete-modal`, `.fx-tip` must divide by `--ui-scale` (section 4).
- **Chrome that must stay dimensionless**: `#quality-underbar` has no background and `pointer-events:none` (css/20-mixer-strip.css:28–35) and js/01-config.js:1402–1411 measures its band for the canvas fit; a themed plate must not grow it.
- **No new per-frame writes, no transitions over the canvas**: the overlays avoid CSS transitions for the Electron compositor (js/58:71–72, js/21:49, js/32:236–237, js/49:764–768); `.sidebar-section` collapse is a one-layout snap, not an animated grid (css/21-sidebar.css:51–65); `#mpRoomToast`'s opacity fade is the one exception today.
- **`body.photosafe-on`** (js/05e:197, 221) is the class PhotoSafe expects to gate canvas transitions with; css/styles.css:1381–1383 is its only rule.
