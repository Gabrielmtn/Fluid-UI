# Selector contract (do-not-rename list)

Generated 2026-10-17 by `prep/scripts/merge-selectors.js` from 16 slice files in `prep/work/selectors/` (workstream B). Full data, every reference with its context, is in `prep/selector-contract.json` (one object per selector, `refs[]` per file:line). This file is the readable half.

**Revision 2026-10-17** (critic pass: `prep/work/selector-critique.json` applied to the slices). **Added 66** rows / 29 selectors through the new part file `prep/work/selectors/critique-additions.json`: 8 `layer-resize-{nw,n,ne,e,se,s,sw,w}` classes (object `class:` keys at `js/05l-layers-transform.js:449-456`, applied at 460, cursor rules `css/styles.css:402-409`; the `layer-resize-<dir>` pattern row stays) and 21 `role="…"` value rows (58 refs across `index.html` and 24 `js/*.js` files, including the two `[role=…]` reads at `js/49-hotkey-binds.js:637` and `js/66-skip-menu.js:305`), alongside the bare `role` row and the `role="img"`/`"listbox"`/`"option"` rows that were already here. **Removed 1** row: `#collisionThreshold` (`scripts/test/inventory/params.json:1049`, from `B14-tier2-tests.json`), an inventory id for a per-layer range that has no DOM id (`js/05k-layers-render.js:456,533` mount it into `.layer-row-cthresh .layer-slider-host`); no tier-1 or tier-2 code names it, and `scripts/test/run-sweep.js:200-201` would skip it as "no such slider". Totals 2214 → 2242 selectors, 5039 → 5104 rows. This paragraph is hand-added after the merge: `merge-selectors.js` rewrites the whole file, so re-add it after any re-run.

Every id, class, data attribute, ARIA attribute, custom property, string-built selector pattern and text key that JavaScript depends on. The later CSS steps may add hooks beside these; they may never rename or repurpose one. **Tier 1** is shipped renderer code (`index.html`, `js/*.js`); **Tier 2** is tests and bake scripts under `scripts/` (not shipped, but renaming breaks the gates). A selector seen in both tiers is listed in tier 1 with its test references counted.

## Counts

| Kind | Tier 1 | Tier 2 only | Total | Tier 1 read | Tier 1 write | Tier 1 both |
|---|---:|---:|---:|---:|---:|---:|
| Ids (`id`) | 741 | 71 | 812 | 15 | 120 | 606 |
| Classes (`class`) | 1046 | 29 | 1075 | 3 | 687 | 356 |
| Data attributes (`data-attr`) | 69 | 0 | 69 | 2 | 13 | 54 |
| ARIA / state attributes (`aria-attr`) | 44 | 0 | 44 | 2 | 21 | 21 |
| Custom properties (`custom-prop`) | 14 | 0 | 14 | 3 | 8 | 3 |
| Tag and attribute selectors (`tag-attr`) | 65 | 8 | 73 | 36 | 23 | 6 |
| String-built patterns (`pattern`) | 71 | 23 | 94 | 49 | 12 | 10 |
| Text keys (`text-key`) | 47 | 14 | 61 | 8 | 31 | 8 |
| **All** | **2097** | **145** | **2242** | 118 | 915 | 1064 |

Source rows: 5104 kept, 0 skipped as malformed, from 16 slices. Files with rows: 96 tier 1 (`index.html` + 95 of 106 `js/*.js`), 73 tier 2 under `scripts/`.

**Mode:** `read` = script queries it (querySelector, getElementById, closest, matches, dataset read, classList.contains, label for=, aria-* id references); `write` = script or static markup creates or toggles it (classList.add/remove/toggle, className =, id =, setAttribute, innerHTML templates, html attributes); `both` = union. Static `index.html` markup declaring a hook counts as `write` (it is what CSS and other scripts depend on).

**Columns:** selector · mode · files (first line in each file; tier-1 files capped at 6, test/bake files counted) · purpose (the most descriptive context a slice recorded; the JSON has all of them). Classes carry a `.` here but not in the JSON; ids carry `#` in both.

**Bucketing notes:** `hidden` and `role` writes are filed under ARIA (the brief lists `hidden` there); the ARIA section is split into *state* attributes (what CSS prep step 4 styles through) and *names, relationships and roles*. `tag-attr` rows (role selectors, `input[type=range]`, `label[for]`, focusable-element lists, inline `onclick` handlers the markup depends on) have their own section because the brief does not name one. Generic classes (`active`, `open`, `collapsed`, `dragging`…) dedupe into one row each; their refs tell which component each use belongs to.

## Ids

741 selectors.

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `#addCollisionLayerBtn` | both | `js/20-mixer-layout.js:3664`, `js/44-recipes.js:305` | Collider button; tours and hotkeys find it by id; toggles .collision-source-menu inline display none/flex (3694) |
| `#altSizeOn_left` | write | `js/20-mixer-layout.js:4835` | resolved from #altSizeOn_<side>; Left Click alternate brush Own size checkbox |
| `#altSizeOn_middle` | write | `js/20-mixer-layout.js:4835` | resolved from #altSizeOn_<side>; Middle Click alternate brush Own size checkbox |
| `#altSizeOn_right` | write | `js/20-mixer-layout.js:4835` | resolved from #altSizeOn_<side>; Right Click alternate brush Own size checkbox |
| `#app-gpu-info` | both | `index.html:217` | span "detecting…"; static markup; css rules: 0 \|\| polled every 500ms until window.__gpuRenderer exists (static at 1716) |
| `#app-version` | both | `index.html:212` | span; static markup; css rules: 0 \|\| DOMContentLoaded: version label into the hotkey footer (static at 1716) |
| `#appCloseKeep` | both | `js/04f-canvas-actions.js:658` | 'Keep painting'; DialogFocus initial focus 715 |
| `#appCloseMessage` | both | `js/04f-canvas-actions.js:654` | textContent 634, 643, 710 |
| `#appCloseModal` | both | `js/04f-canvas-actions.js:649`; +1 test/bake file | Electron close / reload / restart / clear-all-data confirm, built lazily and appended to body; shown by class show; no id rule in css/ |
| `#appCloseQuit` | both | `js/04f-canvas-actions.js:660` | textContent per ask kind (636, 712); class app-close-safe toggled 637, 713; .focus() 638 |
| `#appCloseSave` | both | `js/04f-canvas-actions.js:659` | style.display '' / none per ask kind (635, 711) |
| `#appCloseTitle` | both | `js/04f-canvas-actions.js:653` | textContent per ask kind (709) and after a save (633) |
| `#appConfirmCancel` | both | `js/20-mixer-layout.js:375` | template L375, read L384 (.delete-modal-cancel); inline display:none for alerts |
| `#appConfirmMessage` | both | `js/20-mixer-layout.js:373` | template L373, read L382 (.delete-modal-message); hidden via inline display when empty |
| `#appConfirmModal` | both | `js/20-mixer-layout.js:365`; +3 test/bake files | styled confirm/alert (window.appConfirm, appAlert), created once L368 as .delete-modal.app-confirm-modal, opened with .show |
| `#appConfirmOk` | both | `js/20-mixer-layout.js:376`; +1 test/bake file | template L376, read L383 (.delete-modal-confirm); .btn--destructive toggled per call L398 |
| `#appConfirmTitle` | both | `js/20-mixer-layout.js:372`; +1 test/bake file | written in the modal template L372, read L381 (.delete-modal-title) |
| `#arMapAutoSplat` | both | `js/01a-param-registry.js:183`, `js/20-mixer-layout.js:7826`; +1 test/bake file | mapping checkbox (Bass -> Auto Splat); id resolved from the mappings array 7758; label for= 7829; read via setCb 7915 |
| `#arMapColor` | both | `js/01a-param-registry.js:183`, `js/20-mixer-layout.js:7826`; +1 test/bake file | mapping checkbox (Beats -> Color Cycle), array 7766; the Every row follows it (7836); read via setCb 7918 |
| `#arMapKaleido` | both | `js/01a-param-registry.js:183`, `js/20-mixer-layout.js:7826`; +1 test/bake file | mapping checkbox (Mid -> Kaleido Rotation), array 7763; the Spin row is appended after it (m.id === 'arMapKaleido' 7835); read via setCb 7917 |
| `#arMapSize` | both | `js/01a-param-registry.js:183`, `js/20-mixer-layout.js:7826`; +1 test/bake file | mapping checkbox (Energy -> Brush Size), array 7762; read via setCb 7916 |
| `#audioAutoSplatMode` | read | `js/01a-param-registry.js:374`; +1 test/bake file | dynamically built <select>: a value is validated against the live element's options |
| `#audioBeatThreshold` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:7740`; +1 test/bake file | Beat Threshold range 0.1-1.0; label for= 7736; --val written 7910 |
| `#audioBeatValue` | both | `js/20-mixer-layout.js:7737` | span.value-display inside the Beat Threshold label; read 7888 and 7911 |
| `#audioChooseTrack` | both | `js/20-mixer-layout.js:7250` | Audio File button (class audio-choose-track) in the enable row; read 7328 |
| `#audioClock` | both | `js/20-mixer-layout.js:7262` | clock readout span (class audio-clock); read 7423 |
| `#audioColorEvery` | write | `js/20-mixer-layout.js:7803` | Change colour every <select> (1/2/4/8/16 beats) in a .control-group.ar-sub-control under the Beats -> Color mapping; label for= 7799 |
| `#audioCueEditorHost` | both | `js/20-mixer-layout.js:7673` | AudioCueEditor.mount host (class audio-cue-editor-host); written 7673, read 7624 for the drawer scroll |
| `#audioDrawerEnableHost` | both | `js/20-mixer-layout.js:7665`, `js/44-recipes.js:498` | drawer host for the shared enable row (class audio-drawer-enable); written 7665, read 7563 in applyAudioMode |
| `#audioDrawerLanes` | both | `js/20-mixer-layout.js:7686`; +1 test/bake file | AudioTiming.mountControls(host, {always:true}) host in the drawer (classes atv-controls audio-drawer-lanes) |
| `#audioDrawerPanel` | both | `index.html:1607`, `js/20-mixer-layout.js:7624` | div; static markup; css rules: 7 |
| `#audioFileName` | both | `js/20-mixer-layout.js:7268` | file name span (class audio-filename); read 7424 |
| `#audioKaleidoSpin` | write | `js/20-mixer-layout.js:7780` | Spin speed range 0-180 (data-no-scale=1 at 7783) in a .control-group.ar-sub-control under the Mid -> Kaleido mapping; label for= 7775; --val written 7925 |
| `#audioKaleidoSpinValue` | both | `js/20-mixer-layout.js:7776` | span.value-display inside the Spin speed label; read 7787 and 7926 |
| `#audioLoopBtn` | both | `js/20-mixer-layout.js:7261` | loop toggle, created with class 'audio-play-btn active'; .active toggled by syncPlayRow 7476; read 7421 |
| `#audioMini` | both | `js/20-mixer-layout.js:7241`, `js/44-recipes.js:498` | minimized audio widget (class audio-mini); inline display toggled by applyAudioMode; its innerHTML template 7244-7271 creates the audio* ids below |
| `#audioMode` | both | `js/01a-param-registry.js:259`, `js/20-mixer-layout.js:7216`, `js/28-studio-drawer.js:20`, `js/44-recipes.js:495`; +6 test/bake files | Audio Mode <select> (off/tunnel/timing/min/full) created in buildAudioSection; label for= at 7213; the script keeps a variable handle (modeSel), never re-queries the id |
| `#audioMuteBtn` | both | `js/20-mixer-layout.js:7266` | mute (class audio-play-btn); .muted toggled 7473; read 7418 |
| `#audioOpenFullBtn` | both | `js/20-mixer-layout.js:7271` | Full Audio button (class audio-mini-full); read 7534, flips Audio Mode to full |
| `#audioPlayBtn` | both | `js/20-mixer-layout.js:7259` | play/pause (class audio-play-btn); read 7417; textContent/title rewritten by syncPlayhead |
| `#audioPlayRow` | both | `js/20-mixer-layout.js:7257` | file transport block (class audio-transport), starts display:none inline; display toggled by syncPlayRow 7466; re-parented to follow the enable row 7571-7573; read 7416 |
| `#audioReactFile` | write | `js/20-mixer-layout.js:7279` | hidden <input type=file accept=audio/*> (inline display:none); clicked by the enable/source paths |
| `#audioReactSource` | both | `js/01a-param-registry.js:374`, `js/20-mixer-layout.js:7247`; +1 test/bake file | source <select> (mic/system/file) in the enable row (class audio-mini-src); read 7324 |
| `#audioReactToggle` | both | `js/01a-param-registry.js:183`, `js/20-mixer-layout.js:7246`; +1 test/bake file | Enable checkbox inside the shared enable row; written in #audioMini template, read mini.querySelector 7323; row is re-parented between #audioMini, #audioSceneBox and… |
| `#audioReactViz` | write | `js/20-mixer-layout.js:7710` | visualizer <canvas> (inline cssText 100% x 160px) registered with audioReactive.registerViz 7894; sits inside <details.audio-live-block> |
| `#audioRestartBtn` | both | `js/20-mixer-layout.js:7260` | restart (class audio-play-btn); read 7420 |
| `#audioSceneBox` | write | `js/20-mixer-layout.js:7231` | scene widget host (also class audio-mini); inline display toggled by applyAudioMode 7579/7588; receives the shared enable row in scene modes |
| `#audioSceneControls` | write | `js/20-mixer-layout.js:7235` | inner host that AudioScenes.buildControls(mode, host) fills (7589) |
| `#audioSeek` | both | `js/20-mixer-layout.js:7264` | scrub range 0-1000 (class audio-seek, data-no-scale=1); read 7422; --val written 7443 for the slider fill |
| `#audioSensitivity` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:7723`; +2 test/bake files | Sensitivity range 0.1-3.0; label for= 7719; --val written 7905 on engine sync |
| `#audioSensValue` | both | `js/20-mixer-layout.js:7720` | span.value-display inside the Sensitivity label; written in label innerHTML 7720, read 7882 and 7906 |
| `#audioTimingPanel` | write | `js/40-audio-timing.js:842` | the floating timing-chart panel (div.atv-panel), built once in ensurePanel and portaled to document.body (L857); carries data-group=expressive; shown/hidden by inline… |
| `#audioTimingToggle` | both | `js/20-mixer-layout.js:7293`, `js/40-audio-timing.js:890`, `js/44-recipes.js:499` | Visualize Audio Timing checkbox in a .control-group.checkbox-group; label for= 7295; mounts AudioTiming controls into a .atv-controls host |
| `#audioVolume` | both | `js/20-mixer-layout.js:7267` | volume range 0-1 (class audio-vol, data-no-scale=1); read 7419 |
| `#autoloadSettings` | both | `index.html:1346`, `js/01a-param-registry.js:183`, `js/12-save-load.js:502`; +1 test/bake file | input[type=checkbox] labelled "Load saved on start"; label for= target; x2 in static markup (lines 1346, 1347); css rules: 0 |
| `#backgroundColorPicker` | both | `index.html:1028`, `js/05e-effect-controls.js:298`, `js/12-save-load.js:180`, `js/20-mixer-layout.js:4561`, `js/24-video-export.js:65`, `js/47-pen-window.js:1484`; +1 more; +7 test/bake files | label for= target; input[type=color] labelled "Background Color"; x2 in static markup (lines 1028, 1029); css rules: 0 |
| `#bar` | both | `js/47-pen-window.js:291`; +3 test/bake files | pen window toolbar; class 'idle' toggled (1333 / 1336) -> '#bar.idle' opacity 0 (294) |
| `#blank` | both | `js/47-pen-window.js:319`; +1 test/bake file | pen window: 'Mirror off' surface; hidden toggled (1538, 1570, 1587) |
| `#boot-cursor-style` | both | `js/00a-boot.js:367` | injected UNLAYERED stylesheet appended to <head> (370): 'html.boot-cursor, html.boot-cursor * { cursor: url(assets/boot-cursor.png) 64 64, progress !important }' (368);… |
| `#boot-veil` | read | `js/00a-boot.js:403` | legacy stray removed at stopCursor; nothing creates it today |
| `#box` | both | `js/47-pen-window.js:317`; +5 test/bake files | pen window: the letterboxed canvas box; inline left/top/width/height from fit() (798-801) |
| `#breathColorMode` | both | `index.html:1170`, `js/01a-param-registry.js:259`, `js/45-breathing.js:77`; +1 test/bake file | label for= target; select labelled "Color"; x2 in static markup (lines 1170, 1171); css rules: 0 |
| `#breathCue` | write | `js/45-breathing.js:258` | cue word div created once (L257-259) and appended to body; positioned with style.transform per rAF; css 2 rules |
| `#breathCueToggle` | both | `index.html:1178`, `js/01a-param-registry.js:183`, `js/45-breathing.js:76` | input[type=checkbox] labelled "Cue words"; label for= target; x2 in static markup (lines 1178, 1179); css rules: 0 |
| `#breathingPanel` | both | `index.html:1156`, `js/20-mixer-layout.js:4518`, `js/45-breathing.js:301` | div; static markup; css rules: 0 |
| `#breathingToggle` | both | `index.html:1153`, `js/01a-param-registry.js:183`, `js/20-mixer-layout.js:4517`, `js/44-recipes.js:353`, `js/45-breathing.js:300`; +6 test/bake files | input[type=checkbox] labelled "Breathing"; label for= target; x2 in static markup (lines 1153, 1154); css rules: 0 |
| `#breathPattern` | both | `index.html:1158`, `js/01a-param-registry.js:259`, `js/45-breathing.js:73`; +1 test/bake file | label for= target; select labelled "Pattern"; x2 in static markup (lines 1158, 1159); css rules: 0 |
| `#breathStrength` | both | `index.html:1166`, `js/01a-param-registry.js:461`, `js/45-breathing.js:75`; +1 test/bake file | label for= target; input[type=range] labelled "Swirl strength 50%"; x2 in static markup (lines 1166, 1167); css rules: 0 |
| `#breathStrengthValue` | both | `index.html:1166`, `js/45-breathing.js:310` | span "50%"; static markup; css rules: 0 |
| `#brushAngle` | both | `js/05h-slider-bindings.js:487`, `js/12-save-load.js:1794`, `js/20-mixer-layout.js:6081`; +2 test/bake files | Brush panel > Tip > Angle |
| `#brushAngleValue` | both | `js/05h-slider-bindings.js:492`, `js/20-mixer-layout.js:6081` | readout of #brushAngle |
| `#brushCursor` | both | `js/31-brush-cursor.js:32`; +2 test/bake files | hotspot element on body; style.cssText fixed, 12x12, pointer-events:none, z-index 10050 (38-39); innerHTML = #brushCursorDot svg + #brushCursorP badge (40-50); inline… |
| `#brushCursorArms` | write | `js/31-brush-cursor.js:210` | Multi-Brush arm ghosts host, inserted before the ghost clip (213); per-arm <canvas> children have inline cssText only (666); inline opacity / transform / width / height… |
| `#brushCursorDot` | both | `js/31-brush-cursor.js:41` | the white dot svg; style.display block / none against the P badge (783). Colours hard-coded in the markup (#ffffff, rgba(0,0,0,.6)) |
| `#brushCursorGhost` | both | `js/31-brush-cursor.js:194`; +1 test/bake file | the tip-outline ghost under the dot; inline opacity / display / width / height / transform (219, 566-575); CSS css/23-colour-picker.css:248 only |
| `#brushCursorGhostClip` | write | `js/31-brush-cursor.js:201` | fixed clip box over the canvas rect holding #brushCursorGhost (z-index 10049); inline transform / width / height / display (656-660); CSS css/23-colour-picker.css:249 |
| `#brushCursorP` | both | `js/31-brush-cursor.js:46` | pressure-mode 'P' badge; inline font / colour / text-shadow in the template; display toggled 780 |
| `#brushDabInterval` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:6200`; +1 test/bake file | Brush panel > Stroke > Interval, Spacing's twin for Constant flow; css/21-sidebar.css:2375 styles its readout #brushDabIntervalValue |
| `#brushDabIntervalValue` | both | `js/20-mixer-layout.js:6200` | readout of #brushDabInterval ('N ms · N/s @x'); the only *Value id in this slice a stylesheet names (css/21-sidebar.css:2375) |
| `#brushEraser` | read | `js/01a-param-registry.js:183`; +1 test/bake file | checkbox id used as the persisted preset/snapshot key; 12-save-load and 25-mutation-engine query it by this id |
| `#brushFlow` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:6219`, `js/44-recipes.js:166`; +1 test/bake file | Brush panel > Stroke > Flow; hidden under Pressure (dyeOnlyEls, inline display) |
| `#brushFlowValue` | both | `js/20-mixer-layout.js:6219` | readout of #brushFlow |
| `#brushGhostOpacity` | both | `index.html:1070`, `js/20-mixer-layout.js:5924`, `js/31-brush-cursor.js:216`; +1 test/bake file | input[type=range]; static markup; css rules: 2 |
| `#brushGhostOpacityValue` | both | `index.html:1069`, `js/31-brush-cursor.js:217` | span "100%"; static markup; css rules: 1 |
| `#brushGhostToggle` | both | `index.html:1069`, `js/31-brush-cursor.js:215`; +1 test/bake file | label for= target; input[type=checkbox] labelled "Brush Ghost 100%"; x2 in static markup (lines 1069, 1069); css rules: 0 |
| `#brushHardness` | read | `js/01a-param-registry.js:334`; +1 test/bake file | ParamRegistry.SLIDERS key with ui:null: a control created by JS whose min/max/step/defaultValue are read from the live element on first use; persisted preset/snapshot key |
| `#brushJitter` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:6248`; +1 test/bake file | Brush panel > Stroke > Jitter |
| `#brushJitterValue` | both | `js/20-mixer-layout.js:6248` | readout of #brushJitter |
| `#brushSize` | both | `index.html:635`, `js/01a-param-registry.js:461`, `js/04b-presets.js:134`, `js/05d-input-replay.js:1954`, `js/05h-slider-bindings.js:24`, `js/05n-hotkeys-init.js:108`; +4 more; +14 test/bake files | label for= target; input[type=range] labelled "Brush Size"; x2 in static markup (lines 635, 636); css rules: 0 |
| `#brushSizePerceptual` | both | `js/20-mixer-layout.js:1070`, `js/44-recipes.js:121`; +3 test/bake files | resolved from the pattern for FADER_CURVES.brushSize; the visible 0-1 proxy range (.ch-perceptual, data-no-scale=1) in the Brush Size cell |
| `#brushSpacing` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:6177`; +1 test/bake file | Brush panel > Stroke > Spacing; shown only when not in Constant flow on the fluid target (syncSpacingState 6119, inline display) |
| `#brushSpacingValue` | both | `js/20-mixer-layout.js:6177` | readout of #brushSpacing |
| `#brushStabilizer` | read | `js/01a-param-registry.js:334`; +1 test/bake file | ParamRegistry.SLIDERS key with ui:null: a control created by JS whose min/max/step/defaultValue are read from the live element on first use; persisted preset/snapshot key |
| `#brushSteady` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:2422`, `js/44-recipes.js:171`; +1 test/bake file | Brush panel > Stroke > Stabilization (label renamed 2026-10-07; id, config key and preset key stay 'steady') |
| `#brushSteadyHand` | write | `js/31-brush-cursor.js:73` | Steady brush: the 9px ring at the hand (cssText 74-76, z-index 10049); no css/ rule |
| `#brushSteadyHideGuide` | both | `js/20-mixer-layout.js:2428` | Hide guide checkbox; its row is shown only while Stabilization > 0 (syncGuideRow 6238, inline display) |
| `#brushSteadyString` | write | `js/31-brush-cursor.js:67` | Steady brush: the line from head to hand (cssText 68-70: fixed, 1px, z-index 10049, rgba white); inline width / transform / display per frame (98-105). No css/ rule |
| `#brushSteadyValue` | both | `js/20-mixer-layout.js:6230` | readout of #brushSteady |
| `#brushTipFoldBody` | both | `js/20-mixer-layout.js:5944`; +1 test/bake file | body of the collapsible Tip fold (.brush-fold-body); aria-controls target of the fold's head button (5945) |
| `#brushTipTexture` | both | `js/01a-param-registry.js:334`, `js/20-mixer-layout.js:6062`; +1 test/bake file | Brush panel > Tip > Texture; dimmed + disabled for tips without grain (syncTexState 6064) |
| `#brushTipTextureValue` | both | `js/20-mixer-layout.js:6062` | readout of #brushTipTexture |
| `#brushTypePill` | both | `js/59-brush-type-key.js:65`; +2 test/bake files | role=status pill (66) on body: ~ keycap + Fluid / Pressure / Collider names; hidden attribute toggled (86, 90). CSS css/22-overlays.css:1386, [hidden] 1404 |
| `#brushVelStrength` | write | `js/20-mixer-layout.js:5798` | Brush panel > Pressure > Strength; greyed (opacity + disabled) under Smudge by setGroupEnabled (6110) |
| `#brushVelStrengthValue` | both | `js/20-mixer-layout.js:5798` | readout of #brushVelStrength |
| `#buttonMode_left` | read | `js/44-recipes.js:195` | parked 44: also #buttonMode_right (198), #buttonMode_middle (199) - Stroke and replay mouse buttons |
| `#buttonMode_middle` | read | `js/44-recipes.js:199`; +1 test/bake file | parked 44 |
| `#buttonMode_right` | read | `js/44-recipes.js:198` | parked 44 |
| `#canvas` | both | `index.html:577`, `js/01-config.js:41`, `js/04f-canvas-actions.js:400`, `js/05d-input-replay.js:1762`, `js/05d0-brush-engine.js:163`, `js/05g-arm-colors.js:752`; +33 more; +37 test/bake files | the paint surface; inline style.cursor = 'none' while the brush cursor shows and no remote owner (802-803, 814, 866-867). Inline cursor beats stylesheet; .hide-cursor… |
| `#canvas-area` | both | `index.html:553`, `js/00a-boot.js:120`, `js/01-config.js:42`, `js/03-recording.js:311`, `js/04g-hover-capture.js:43`, `js/05g-arm-colors.js:750`; +15 more; +7 test/bake files | div "800 × 600"; static markup; css rules: 26 |
| `#canvas-size-display` | both | `index.html:555`, `js/01-config.js:45`, `js/05g-arm-colors.js:753`; +1 test/bake file | div "800 × 600"; static markup; css rules: 4 |
| `#canvas-wrapper` | both | `index.html:554`, `js/00a-boot.js:120`, `js/01-config.js:43`, `js/04f-canvas-actions.js:358`, `js/05g-arm-colors.js:751`, `js/05m-layer-masks.js:328`; +22 more; +16 test/bake files | div "800 × 600"; static markup; css rules: 10 |
| `#canvasOpacity` | both | `index.html:1041`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:324`, `js/20-mixer-layout.js:4568`; +2 test/bake files | label for= target; input[type=range] labelled "Canvas Opacity (Sim Visibility) 100%"; x2 in static markup (lines 1041, 1042); css rules: 0 |
| `#captureArea` | both | `js/04g-hover-capture.js:41` | detached capture region; not in index.html, so always created and appended to #canvas-area (fallback body); style.position fixed 85, left/top/width/height px 287-293,… |
| `#captureBtn` | both | `index.html:1540`, `js/04f-canvas-actions.js:283`, `js/04g-hover-capture.js:325`, `js/20-mixer-layout.js:3638`, `js/44-recipes.js:285` | button "Capture Layer"; static markup; css rules: 1 |
| `#captureDimming` | both | `index.html:1049`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:396`, `js/20-mixer-layout.js:4574`; +1 test/bake file | label for= target; input[type=range] labelled "Background Transparency 80%"; x2 in static markup (lines 1049, 1050); css rules: 0 |
| `#chimeraBtn` | write | `index.html:1494` | button "Chimera Three sine strokes × 8 arms"; static markup; css rules: 0 |
| `#clearLightShiftPath` | both | `index.html:1330`, `js/14-light-shift.js:119` | button "Clear Path"; static markup; css rules: 0 |
| `#clearSettingsBtn` | both | `index.html:1343`, `js/12-save-load.js:501` | button "Clear"; static markup; css rules: 0 |
| `#close-button` | both | `index.html:539`, `js/00-window-controls.js:109` | button; static markup; css rules: 0 |
| `#closeBtn` | both | `js/47-pen-window.js:337` | pen window: Close |
| `#colliderDrawBtn` | both | `js/15-layer-masking.js:188` | Draw tool; read 363; class active toggled with the tool (367) |
| `#colliderEraseBtn` | both | `js/15-layer-masking.js:189` | Erase tool; read 364; class active toggled (368) |
| `#colliderRedoBtn` | both | `js/15-layer-masking.js:196` | ↷; read 396 |
| `#colliderSize` | both | `js/15-layer-masking.js:192` | collider brush size range (data-no-scale); read 374 |
| `#colliderSizeVal` | both | `js/15-layer-masking.js:193` | readout; textContent 378 |
| `#colliderTools` | both | `js/15-layer-masking.js:186` | collider paint toolbar (class mask-collider-tools, inline display:none); shown / hidden 3299 |
| `#colliderUndoBtn` | both | `js/15-layer-masking.js:195` | ↶; read 395 |
| `#colliderViewArt` | both | `js/15-layer-masking.js:198` | View on canvas checkbox; read 389, 3283 |
| `#colorBlend` | both | `index.html:800`, `js/01a-param-registry.js:461`, `js/05h-slider-bindings.js:535`, `js/20-mixer-layout.js:1135`, `js/44-recipes.js:257`; +5 test/bake files | label for= target; input[type=range] labelled "Laminar / Blend 0.00"; x2 in static markup (lines 800, 801); css rules: 1 |
| `#colorBlendPerceptual` | both | `js/20-mixer-layout.js:1070`, `js/44-recipes.js:256`; +2 test/bake files | resolved from the pattern for FADER_CURVES.colorBlend; visible proxy range of the Color Blend cell |
| `#colorBlendValue` | both | `index.html:800`, `js/05h-slider-bindings.js:549`, `js/20-mixer-layout.js:1173`; +1 test/bake file | span "0.00"; static markup; css rules: 0 |
| `#colorGate` | both | `index.html:646`, `js/01a-param-registry.js:183`, `js/04b-presets.js:35`, `js/05h-slider-bindings.js:219`, `js/20-mixer-layout.js:1318`; +5 test/bake files | input[type=checkbox] labelled "Limit"; label for= target; x2 in static markup (lines 646, 647); css rules: 0 |
| `#colorPicker` | both | `index.html:639`, `js/01-config.js:144`, `js/05g-arm-colors.js:803`, `js/05n-hotkeys-init.js:107`, `js/12-save-load.js:181`, `js/20-mixer-layout.js:1212`; +8 more; +16 test/bake files | label for= target; input[type=color] labelled "Fluid Color"; x2 in static markup (lines 639, 640); css rules: 0 |
| `#comfyui-toast` | both | `js/comfyui-bridge.js:124` | ComfyUI bridge toast appended to body; inline style.cssText only (125-128); style.borderColor per type from JS literals #58a6ff / #3fb950 / #d29922 / #f85149 (132-135);… |
| `#comfyuiFolderPath` | both | `js/20-mixer-layout.js:8441`, `js/comfyui-bridge.js:165` | ComfyUI folder text input, inline cssText; whole block appended only when window.comfyuiBridge exists (Electron) 8520 |
| `#connectionDot` | both | `index.html:1417`, `js/06e-mp-panel.js:311`; +1 test/bake file | div; static markup; css rules: 0 |
| `#copyRoomBtn` | both | `index.html:1465`, `js/06e-mp-panel.js:717`, `js/44-recipes.js:517`; +2 test/bake files | button "Copy link"; static markup; css rules: 0 |
| `#copyRoomCodeBtn` | both | `index.html:1466`, `js/06e-mp-panel.js:717`; +1 test/bake file | button "Copy code"; static markup; css rules: 0 |
| `#copyRoomLookBtn` | both | `index.html:1471`, `js/06e-mp-panel.js:914`, `js/44-recipes.js:531`; +1 test/bake file | button[type=button] "Room link + current settings"; static markup; css rules: 0 |
| `#copyRoomRow` | both | `index.html:1464`, `js/06e-mp-panel.js:466` | div "Copy link Copy code"; static markup; css rules: 0 |
| `#createRoomBtn` | both | `index.html:1397`, `js/06e-mp-panel.js:892`, `js/44-recipes.js:514`; +1 test/bake file | button "Start a room"; static markup; css rules: 0 |
| `#curl` | both | `index.html:793`, `js/01a-param-registry.js:461`, `js/04b-presets.js:104`, `js/05h-slider-bindings.js:386`, `js/20-mixer-layout.js:1135`, `js/29-material-modes.js:311`; +7 test/bake files | input[type=range]; static markup; css rules: 0 |
| `#curlValue` | both | `index.html:791`, `js/05h-slider-bindings.js:387`, `js/20-mixer-layout.js:1173`, `js/29-material-modes.js:312`; +1 test/bake file | span "0"; static markup; css rules: 0 |
| `#cursorBox` | both | `js/47-pen-window.js:333`; +2 test/bake files | pen window: 'Always show cursor' checkbox |
| `#cursorToggle` | both | `index.html:1061`, `js/01a-param-registry.js:183`, `js/05g-arm-colors.js:742`, `js/05n-hotkeys-init.js:111`, `js/17-hotkey-reminder.js:116`, `js/20-mixer-layout.js:5923`; +3 more; +12 test/bake files | input[type=checkbox] labelled "Show Cursor"; label for= target; x2 in static markup (lines 1061, 1062); css rules: 0 |
| `#custom-titlebar` | both | `index.html:528`, `js/20-mixer-layout.js:241`, `js/66-skip-menu.js:190` | div "Swirl Together"; static markup; css rules: 10 |
| `#customCursor` | both | `index.html:578`, `js/01-config.js:44`, `js/05d-input-replay.js:1643` | inline style.opacity = '0' when a right-click replay ends |
| `#deleteModalMessage` | both | `index.html:1994`, `js/01-config.js:1074` | div; static markup; css rules: 0 |
| `#deletePaletteModal` | both | `index.html:1991`, `js/01-config.js:1073`; +3 test/bake files | div "Delete Palette?"; static markup; css rules: 0 |
| `#demoClock` | write | `js/52-demo-clock.js:127` | the Steam demo's 5:00 clock (edition 'demo' only): div.demo-clock > .demo-clock-cap + button.btn--ghost.demo-clock-btn; parented into #quality-underbar when the bar… |
| `#demoWishlistBack` | both | `js/52-demo-clock.js:204` | 'Keep painting, N minutes' / 'Back to painting' (247) |
| `#demoWishlistGo` | both | `js/52-demo-clock.js:205` | 'Wishlist on Steam' (btn--emphasis), initial focus (269) |
| `#demoWishlistModal` | write | `js/52-demo-clock.js:191` | the wishlist ask: div.delete-modal.demo-wishlist-modal[data-group=system][role=dialog][aria-modal][aria-labelledby=demoWishlistTitle][aria-describedby=demoWishlistMsg],… |
| `#demoWishlistMsg` | both | `js/52-demo-clock.js:201` | pitch text (245-246, 307); aria-describedby target |
| `#demoWishlistQuiet` | both | `js/52-demo-clock.js:203` | 'Leave me alone', hidden until the fifth keep (248) and after a wishlist (313) |
| `#demoWishlistTitle` | both | `js/52-demo-clock.js:200` | title text per ask kind (237-239); aria-labelledby target |
| `#densityDissipation` | both | `index.html:731`, `js/01a-param-registry.js:461`, `js/04b-presets.js:100`, `js/05h-slider-bindings.js:137`, `js/20-mixer-layout.js:1135`, `js/34-mandala-mode.js:114`; +7 test/bake files | label for= target; input[type=range] labelled "Density Sustain 0.9900"; x2 in static markup (lines 731, 732); css rules: 0 |
| `#densityDissipationPerceptual` | write | `js/20-mixer-layout.js:1070` | resolved from the pattern for FADER_CURVES.densityDissipation; visible proxy range of the Density cell |
| `#densityValue` | both | `index.html:731`, `js/05h-slider-bindings.js:436`, `js/20-mixer-layout.js:1173`; +1 test/bake file | span "0.9900"; static markup; css rules: 0 |
| `#depthDownloadBar` | both | `js/23-depth-collision.js:211` | style.width = percent %; inline gradient #e85d26 -> #ff8850 |
| `#depthDownloadMessage` | both | `js/23-depth-collision.js:209` | textContent; inline style only |
| `#depthDownloadModal` | both | `js/23-depth-collision.js:204` | lazily built depth-model download modal appended to body; the whole look is style.cssText (205) plus inline style= attributes in the innerHTML (206-214), no CSS hooks;… |
| `#depthDownloadPercent` | both | `js/23-depth-collision.js:212` | textContent; inline style only |
| `#detachCaptureToggle` | both | `index.html:1546`, `js/01a-param-registry.js:183`, `js/04g-hover-capture.js:19`, `js/20-mixer-layout.js:3759`; +1 test/bake file | input[type=checkbox] labelled "Detach Capture Area"; label for= target; x2 in static markup (lines 1546, 1547); css rules: 0 |
| `#dimmingValue` | both | `index.html:1049`, `js/05e-effect-controls.js:397` | span "80%"; static markup; css rules: 0 |
| `#disconnectBtn` | both | `index.html:1435`, `js/06e-mp-panel.js:937`; +1 test/bake file | button "Leave"; static markup; css rules: 0 |
| `#displayShadingToggle` | both | `index.html:812`, `js/01a-param-registry.js:183`, `js/04b-presets.js:35`, `js/05e-effect-controls.js:346`, `js/08b-jank-monitor.js:448`, `js/20-mixer-layout.js:2708`; +2 more; +5 test/bake files | input[type=checkbox] labelled "Surface Shading"; label for= target; x2 in static markup (lines 812, 813); css rules: 0 |
| `#ditherDrawGroup` | both | `index.html:1202`, `js/68-dither.js:355` | div; static markup; css rules: 0 |
| `#ditherLevels` | both | `index.html:1216`, `js/01a-param-registry.js:461`, `js/68-dither.js:354`; +1 test/bake file | label for= target; input[type=range] labelled "Levels 4"; x2 in static markup (lines 1216, 1217); css rules: 0 |
| `#ditherLevelsValue` | both | `index.html:1216`, `js/68-dither.js:372` | span "4"; static markup; css rules: 0 |
| `#ditherPad` | both | `index.html:1204`, `js/68-dither.js:355` | canvas; static markup; css rules: 0 |
| `#ditherPadClear` | both | `index.html:1212`, `js/68-dither.js:356` | button[type=button] "Clear"; static markup; css rules: 0 |
| `#ditherPadInvert` | both | `index.html:1211`, `js/68-dither.js:356` | button[type=button] "Invert"; static markup; css rules: 0 |
| `#ditherPanel` | both | `index.html:1189`, `js/20-mixer-layout.js:4496`, `js/68-dither.js:353` | div; static markup; css rules: 0 |
| `#ditherPattern` | both | `index.html:1191`, `js/01a-param-registry.js:259`, `js/68-dither.js:353`; +1 test/bake file | label for= target; select labelled "Pattern"; x2 in static markup (lines 1191, 1192); css rules: 0 |
| `#ditherPulse` | both | `index.html:1232`, `js/01a-param-registry.js:461`, `js/68-dither.js:354` | label for= target; input[type=range] labelled "Beat pulse 0%"; x2 in static markup (lines 1232, 1233); css rules: 0 |
| `#ditherPulseValue` | both | `index.html:1232`, `js/68-dither.js:374` | span "0%"; static markup; css rules: 0 |
| `#ditherRamp` | both | `index.html:1207`, `js/68-dither.js:355` | canvas; static markup; css rules: 0 |
| `#ditherSize` | both | `index.html:1220`, `js/01a-param-registry.js:461`, `js/68-dither.js:354`; +1 test/bake file | label for= target; input[type=range] labelled "Size 2 px"; x2 in static markup (lines 1220, 1221); css rules: 0 |
| `#ditherSizeValue` | both | `index.html:1220`, `js/68-dither.js:373` | span "2 px"; static markup; css rules: 0 |
| `#ditherToggle` | both | `index.html:1186`, `js/01a-param-registry.js:183`, `js/20-mixer-layout.js:4495`, `js/68-dither.js:353`; +1 test/bake file | input[type=checkbox] labelled "Dither"; label for= target; x2 in static markup (lines 1186, 1187); css rules: 0 |
| `#ditherTone` | both | `index.html:1224`, `js/01a-param-registry.js:259`, `js/68-dither.js:354`; +1 test/bake file | label for= target; select labelled "Color"; x2 in static markup (lines 1224, 1225); css rules: 0 |
| `#enableLighting` | both | `index.html:1237`, `js/01a-param-registry.js:183`, `js/13-light-source.js:52`, `js/20-mixer-layout.js:4464`, `js/44-recipes.js:363`; +4 test/bake files | input[type=checkbox] labelled "Light Source"; label for= target; x2 in static markup (lines 1237, 1238); css rules: 0 |
| `#enableLightShift` | both | `index.html:1280`, `js/01a-param-registry.js:183`, `js/14-light-shift.js:41`, `js/20-mixer-layout.js:4467`, `js/44-recipes.js:372`; +3 test/bake files | input[type=checkbox] labelled "Light Shift"; label for= target; x2 in static markup (lines 1280, 1281); css rules: 0 |
| `#export-toast` | both | `js/22-audio-reactive.js:332`, `js/24-video-export.js:1909` | the app's toast, owned here: read L1909, created L1911-1917 with inline cssText and hard-coded colours (L1913-1916, per-type border L1919);… |
| `#exportAllPresetsBtn` | both | `index.html:1383`, `js/12-save-load.js:2546` | button "⤓ Export Presets"; static markup; css rules: 0 |
| `#exportFolderPath` | both | `js/20-mixer-layout.js:8274`, `js/24-video-export.js:1936` | Electron only (typeof require guard 8262): read-only text input showing the output folder, inline cssText |
| `#exportGifBtn` | both | `js/20-mixer-layout.js:8109`, `js/24-video-export.js:1837` | Quick Export > GIF |
| `#exportGifDuration` | write | `js/20-mixer-layout.js:8233` | number input 1-10 s, inline cssText |
| `#exportGifFPS` | write | `js/20-mixer-layout.js:8248` | gif fps <select> 10/15/24/30, inline cssText |
| `#exportGround` | both | `js/20-mixer-layout.js:8156`, `js/62-canvas-readout.js:91` | Background <select> (seen/transparent); label.htmlFor 8151 |
| `#exportProgress` | both | `js/20-mixer-layout.js:8070`, `js/24-video-export.js:1885` | progress track, inline cssText, display:none until an export runs |
| `#exportProgressBar` | both | `js/20-mixer-layout.js:8073`, `js/24-video-export.js:1886` | progress fill, inline cssText; js/24-video-export writes its width per captured frame (comment 8074-8076: no transition on purpose) |
| `#exportSequenceBtn` | both | `js/20-mixer-layout.js:8134`, `js/24-video-export.js:1837` | Quick Export > Sequence |
| `#exportStatus` | both | `js/20-mixer-layout.js:8027`, `js/24-video-export.js:1884`, `js/44-recipes.js:544` | export status line, all styling inline (cssText, display:none); js/24 shows text here |
| `#exportStillBtn` | both | `js/20-mixer-layout.js:8124`, `js/24-video-export.js:1837` | Quick Export > Save picture |
| `#exportStopBtn` | both | `js/20-mixer-layout.js:8169`, `js/24-video-export.js:1887`, `js/44-recipes.js:544` | Cancel export, inline display:none until an export starts (js/24 shows it) |
| `#exportVideoBtn` | both | `js/20-mixer-layout.js:8094`, `js/24-video-export.js:1837` | Quick Export > Video; js/24 rewrites its words while capturing; ids given so Ctrl+Shift+H binds survive tooltip changes (8090-8092) |
| `#exportVideoDuration` | write | `js/20-mixer-layout.js:8191` | number input 1-300 s, all styling inline cssText |
| `#exportVideoFPS` | write | `js/20-mixer-layout.js:8206` | video fps <select> 30/60/120, inline cssText |
| `#featherStep` | both | `js/15-layer-masking.js:301` | step-3 block (mask-feather-step); display toggled 2953, 2998 |
| `#filterAutoBtn` | both | `js/15-layer-masking.js:245` | Auto; read 463 |
| `#filterBgColor` | both | `js/15-layer-masking.js:243` | background colour well; read 442, 2385 (value synced from maskState) |
| `#filterInvert` | both | `js/15-layer-masking.js:247` | Invert checkbox; read 486, 2391 (.checked synced) |
| `#filterPanel` | both | `js/15-layer-masking.js:237`; +1 test/bake file | Filter panel (mask-filter-panel mask-tool-panel); display toggled 2550, 2950, 2999, 3300 |
| `#filterPickBtn` | both | `js/15-layer-masking.js:244` | Pick; read 453, 2393; class active toggled with filterPicking (2394) |
| `#filterThreshold` | both | `js/15-layer-masking.js:254`, `js/44-recipes.js:309` | Cut amount range (data-no-scale); read 476, 2387; setRangeValue writes .value and --val |
| `#filterThresholdValue` | both | `js/15-layer-masking.js:255` | readout (class mask-filter-value); textContent 480, 2389 |
| `#filterToolBtn` | write | `js/15-layer-masking.js:210` | Filter tab; never queried by id (driven through .mask-tool-tab[data-tool=filter]); inline onclick setMaskTool('filter') |
| `#flattenLayersBtn` | both | `js/20-mixer-layout.js:3648`, `js/44-recipes.js:293` | Flatten button in the Layers toolbar; .disabled while window.flattenLayers runs (3654-3655) |
| `#focus-mode-hint` | write | `js/21-focus-mode.js:52` | role=status (53) hint appended to body; class 'visible' for 2.5 s on entering focus mode (61-62, 152). CSS css/22-overlays.css:75, '.visible' 96 |
| `#focusModeToggle` | both | `js/01a-param-registry.js:183`, `js/17-hotkey-reminder.js:119`, `js/20-mixer-layout.js:7943`, `js/21-focus-mode.js:155`, `js/44-recipes.js:563`; +5 test/bake files | Focus Mode (F) checkbox in a .control-group.checkbox-group; label for= 7945; toggles window.focusMode |
| `#fpsCap` | both | `index.html:718`, `js/01a-param-registry.js:259`, `js/05d-input-replay.js:759`, `js/20-mixer-layout.js:4161`; +4 test/bake files | label for= target; select labelled "FPS Limit"; x2 in static markup (lines 718, 719); css rules: 0 |
| `#freezeBtn` | both | `index.html:1484`, `js/04b-presets.js:256`, `js/20-mixer-layout.js:1546`, `js/44-recipes.js:431`, `js/60-reset-app.js:231`; +1 test/bake file | button "Stop"; static markup; css rules: 1 |
| `#fsBtn` | both | `js/47-pen-window.js:336`; +1 test/bake file | pen window: Fullscreen / Exit fullscreen (textContent 782) |
| `#gestureIndicator` | write | `js/05d-input-replay.js:1937` | two-finger gesture toast on body; style.cssText (1938-1941: fixed, z-index 10001, rgba(15,20,27,.9) ground, rgba(100,200,255,.4) border, #fff text, hard-coded in JS);… |
| `#ghost` | both | `js/47-pen-window.js:287`; +2 test/bake files | pen window: ghost <canvas> under the pen, painted by js/31; inline opacity (1282) |
| `#ghostArms` | both | `js/47-pen-window.js:289`; +1 test/bake file | pen window: Multi-Brush arm ghosts host, painted by js/31's ghostSet (1280); inline opacity (1283) |
| `#glowIntensity` | both | `index.html:847`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:134`; +2 test/bake files | label for= target; input[type=range] labelled "Intensity 0.800"; x2 in static markup (lines 847, 848); css rules: 0 |
| `#glowIntensityValue` | both | `index.html:847`, `js/05e-effect-controls.js:138` | span "0.800"; static markup; css rules: 0 |
| `#glowPanel` | both | `index.html:845`, `js/05e-effect-controls.js:49`, `js/20-mixer-layout.js:4471` | div "Intensity 0.800"; static markup; css rules: 0 |
| `#glowThreshold` | both | `index.html:851`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:143`, `js/44-recipes.js:347`; +2 test/bake files | label for= target; input[type=range] labelled "Threshold 0.60"; x2 in static markup (lines 851, 852); css rules: 0 |
| `#glowThresholdValue` | both | `index.html:851`, `js/05e-effect-controls.js:147` | span "0.60"; static markup; css rules: 0 |
| `#glowToggle` | both | `index.html:842`, `js/01a-param-registry.js:183`, `js/04b-presets.js:35`, `js/05e-effect-controls.js:48`, `js/20-mixer-layout.js:4470`, `js/44-recipes.js:343`; +4 test/bake files | input[type=checkbox] labelled "Glow"; label for= target; x2 in static markup (lines 842, 843); css rules: 0 |
| `#governorAllowFx` | both | `index.html:596`, `js/08a-quality-governor.js:89` | label for= target; input[type=checkbox] labelled "&nbsp;&nbsp;Effect Shedding:"; x2 in static markup (lines 596, 596); css rules: 0 |
| `#governorAllowRes` | both | `index.html:595`, `js/08a-quality-governor.js:88` | label for= target; input[type=checkbox] labelled "&nbsp;&nbsp;Resolution Tiers:"; x2 in static markup (lines 595, 595); css rules: 0 |
| `#governorToggle` | both | `index.html:594`, `js/08a-quality-governor.js:87`; +3 test/bake files | label for= target; input[type=checkbox] labelled "Adaptive Quality:"; x2 in static markup (lines 594, 594); css rules: 0 |
| `#grainCleanup` | both | `index.html:747`, `js/01a-param-registry.js:461`, `js/05h-slider-bindings.js:535`, `js/20-mixer-layout.js:4171` | label for= target; input[type=range] labelled "Grain Cleanup 0.75"; x2 in static markup (lines 747, 748); css rules: 0 |
| `#grainCleanupValue` | both | `index.html:747`, `js/05h-slider-bindings.js:549` | span "0.75"; static markup; css rules: 0 |
| `#guidesBtn` | both | `js/47-pen-window.js:331`; +1 test/bake file | pen window: Guides menu button; aria-haspopup=true in markup, aria-expanded written true/false (1457) |
| `#guidesMenu` | both | `js/47-pen-window.js:308`; +1 test/bake file | pen window: role=group aria-label='Guides' checkbox list, rebuilt by buildGuidesMenu (1413-1444); hidden toggled (1456); inline left/top (1453-1454) |
| `#hkBindBar` | both | `js/49-hotkey-binds.js:608`; +2 test/bake files | NOT_BINDABLE list (608); the bind-mode bar itself (737), role=dialog, data-group=system, data-step 1..3 |
| `#hkToast` | both | `js/49-hotkey-binds.js:1561`, `js/59-brush-type-key.js:87`; +1 test/bake file | 'isn't on screen right now' toast; role=status; hidden toggled |
| `#hkWheel` | both | `js/49-hotkey-binds.js:560`; +1 test/bake file | scroll-to-fine-tune pill under the canvas; role=status; hidden toggled (571, 574) |
| `#hotkeyClose` | both | `index.html:1613`, `js/05n-hotkeys-init.js:11`; +1 test/bake file | button[type=button] "×"; static markup; css rules: 0 |
| `#hotkeyOverlay` | both | `index.html:1609`, `js/05n-hotkeys-init.js:10`, `js/49-hotkey-binds.js:608`; +5 test/bake files | div "Hotkeys ×"; static markup; css rules: 2 |
| `#hoverCaptureToggle` | both | `index.html:1542`, `js/01a-param-registry.js:183`, `js/04f-canvas-actions.js:285`, `js/20-mixer-layout.js:3758`; +1 test/bake file | input[type=checkbox] labelled "Enable Capture on Hover"; label for= target; x2 in static markup (lines 1542, 1543); css rules: 0 |
| `#idleVramToggle` | both | `index.html:598`, `js/53-idle-vram.js:175` | label for= target; input[type=checkbox] labelled "Release VRAM When Hidden:"; x2 in static markup (lines 598, 598); css rules: 0 |
| `#imageUpload` | both | `index.html:1549`, `js/04f-canvas-actions.js:323`, `js/20-mixer-layout.js:3760` | input[type=file]; static markup; css rules: 0 |
| `#importPresetsBtn` | both | `index.html:1384`, `js/12-save-load.js:2547` | button "⤒ Import Presets"; static markup; css rules: 0 |
| `#importPresetsInput` | both | `index.html:1385`, `js/12-save-load.js:2548` | input[type=file]; static markup; css rules: 0 |
| `#iterationValue` | both | `index.html:743`, `js/05h-slider-bindings.js:549`, `js/29-material-modes.js:119` | span "25"; static markup; css rules: 0 |
| `#jellyfishBtn` | both | `index.html:1485`, `js/04c-anim-burst.js:295` | button "Jellyfish"; static markup; css rules: 0 |
| `#joinRoomBtn` | both | `index.html:1402`, `js/06e-mp-panel.js:895`; +1 test/bake file | button "Join"; static markup; css rules: 0 |
| `#joinRoomInput` | both | `index.html:1401`, `js/06e-mp-panel.js:896`, `js/20-mixer-layout.js:8381`; +1 test/bake file | input[type=text]; static markup; css rules: 0 |
| `#kaleidoGuides` | both | `js/63-kaleido-guides.js:274`; +2 test/bake files | guide SVG overlay; inline cssText (276) + left/top/width/height/zIndex on restyle (288-293); display toggled 297, 305; children built with createElementNS and… |
| `#kaleidoMode` | both | `index.html:985`, `js/01a-param-registry.js:259`, `js/05f-kaleido-controls.js:247`, `js/12-save-load.js:465`, `js/20-mixer-layout.js:3259`, `js/34-mandala-mode.js:56`; +1 more; +7 test/bake files | label for= target; select labelled "Kaleidoscope Mode"; x2 in static markup (lines 985, 986); css rules: 0 |
| `#kaleidoPanel` | both | `index.html:979`, `js/05f-kaleido-controls.js:83`, `js/20-mixer-layout.js:4150` | div "Segments 12"; static markup; css rules: 2 |
| `#kaleidoSegments` | both | `index.html:981`, `js/01a-param-registry.js:461`, `js/05f-kaleido-controls.js:19`, `js/12-save-load.js:466`, `js/34-mandala-mode.js:57`, `js/44-recipes.js:399`; +5 test/bake files | label for= target; input[type=range] labelled "Segments 12"; x2 in static markup (lines 981, 982); css rules: 0 |
| `#kaleidoShowGuides` | both | `index.html:996`, `js/63-kaleido-guides.js:36`; +1 test/bake file | input[type=checkbox] labelled "Show Guides"; label for= target; x2 in static markup (lines 996, 997); css rules: 0 |
| `#kaleidoToggle` | both | `index.html:926`, `js/01a-param-registry.js:183`, `js/04b-presets.js:47`, `js/04f-canvas-actions.js:111`, `js/05f-kaleido-controls.js:18`, `js/05n-hotkeys-init.js:566`; +3 more; +8 test/bake files | input[type=checkbox] labelled "Kaleido"; label for= target; x2 in static markup (lines 926, 927); css rules: 0 |
| `#kaleidoValue` | both | `index.html:981`, `js/05f-kaleido-controls.js:20` | span "12"; static markup; css rules: 0 |
| `#kAngle` | both | `index.html:1000`, `js/01a-param-registry.js:461`, `js/05f-kaleido-controls.js:143`, `js/34-mandala-mode.js:58`; +3 test/bake files | label for= target; input[type=range] labelled "Angle 0°"; x2 in static markup (lines 1000, 1001); css rules: 0 |
| `#kAngleValue` | both | `index.html:1000`, `js/05f-kaleido-controls.js:144`, `js/34-mandala-mode.js:163` | span "0°"; static markup; css rules: 0 |
| `#kAnimateRot` | both | `index.html:1004`, `js/01a-param-registry.js:183`, `js/05f-kaleido-controls.js:242`, `js/34-mandala-mode.js:62`; +4 test/bake files | input[type=checkbox] labelled "Animate Rotation"; label for= target; x2 in static markup (lines 1004, 1005); css rules: 0 |
| `#kBlend` | both | `index.html:1023`, `js/01a-param-registry.js:461`, `js/05f-kaleido-controls.js:190`, `js/34-mandala-mode.js:61`; +3 test/bake files | label for= target; input[type=range] labelled "Opacity 1.00"; x2 in static markup (lines 1023, 1024); css rules: 0 |
| `#kBlendValue` | both | `index.html:1023`, `js/05f-kaleido-controls.js:191` | span "1.00"; static markup; css rules: 0 |
| `#kSpinSpeed` | both | `index.html:1012`, `js/01a-param-registry.js:461`, `js/05f-kaleido-controls.js:157`; +2 test/bake files | input[type=range]; static markup; css rules: 0 |
| `#kSpinSpeedValue` | both | `index.html:1010`, `js/05f-kaleido-controls.js:158` | span "30°/s"; static markup; css rules: 0 |
| `#kTwist` | both | `index.html:1015`, `js/01a-param-registry.js:461`, `js/05f-kaleido-controls.js:172`, `js/34-mandala-mode.js:59`; +4 test/bake files | label for= target; input[type=range] labelled "Twist 0.0"; x2 in static markup (lines 1015, 1016); css rules: 0 |
| `#kTwistValue` | both | `index.html:1015`, `js/05f-kaleido-controls.js:173` | span "0.0"; static markup; css rules: 0 |
| `#kZoom` | both | `index.html:1019`, `js/01a-param-registry.js:461`, `js/05f-kaleido-controls.js:181`, `js/34-mandala-mode.js:60`; +3 test/bake files | label for= target; input[type=range] labelled "Zoom 1.00"; x2 in static markup (lines 1019, 1020); css rules: 0 |
| `#kZoomValue` | both | `index.html:1019`, `js/05f-kaleido-controls.js:182` | span "1.00"; static markup; css rules: 0 |
| `#layer0` | both | `index.html:566`; +1 test/bake file | div; static markup; css rules: 0 |
| `#layer1` | write | `index.html:567` | div; static markup; css rules: 0 |
| `#layer2` | write | `index.html:568` | div; static markup; css rules: 0 |
| `#layer3` | write | `index.html:569` | div; static markup; css rules: 0 |
| `#layer4` | write | `index.html:570` | div; static markup; css rules: 0 |
| `#layer5` | write | `index.html:571` | div; static markup; css rules: 0 |
| `#layer6` | write | `index.html:572` | div; static markup; css rules: 0 |
| `#layer7` | write | `index.html:573` | div; static markup; css rules: 0 |
| `#layer8` | write | `index.html:574` | div; static markup; css rules: 0 |
| `#layer9` | both | `index.html:575`; +1 test/bake file | div; static markup; css rules: 0 |
| `#layers-container` | both | `index.html:565`, `js/04f-canvas-actions.js:357`, `js/05g-arm-colors.js:754`, `js/05l-layers-transform.js:228`, `js/12-save-load.js:1474`, `js/23-depth-collision.js:758` | div; static markup; css rules: 1 |
| `#layersPanel` | both | `index.html:1593`, `js/05k-layers-render.js:248`, `js/20-mixer-layout.js:3726`, `js/32-file-drop.js:59`, `js/44-recipes.js:90` | div; static markup; css rules: 5 |
| `#layerTransformCancel` | both | `js/26-layer-transform.js:413`; +1 test/bake file | Cancel button (btn--lg); read 472 for onclick |
| `#layerTransformCanvas` | both | `js/26-layer-transform.js:407` | 2D canvas the frame + handles are drawn on; read 434; style.cursor set per hit (295) |
| `#layerTransformDone` | both | `js/26-layer-transform.js:412`, `js/44-recipes.js:300` | Done button (btn--emphasis btn--lg); read 471 for onclick |
| `#layerTransformOverlay` | both | `js/26-layer-transform.js:402`, `js/44-recipes.js:752` | full-window transform overlay appended to body on open, removed on close (483); never queried by id |
| `#lightAmbient` | both | `index.html:1276`, `js/01a-param-registry.js:461`, `js/13-light-source.js:100`; +3 test/bake files | input[type=range]; static markup; css rules: 0 |
| `#lightAmbientValue` | both | `index.html:1274`, `js/13-light-source.js:101` | span "0.30"; static markup; css rules: 0 |
| `#lightDot` | both | `index.html:1254`, `js/12-save-load.js:1240`, `js/13-light-source.js:37` | div; static markup; css rules: 0 |
| `#lightGridContainer` | both | `index.html:1249`, `js/12-save-load.js:1241`, `js/13-light-source.js:36`, `js/44-recipes.js:366` | div; static markup; css rules: 0 |
| `#lightIntensity` | both | `index.html:1269`, `js/01a-param-registry.js:461`, `js/13-light-source.js:89`; +3 test/bake files | input[type=range]; static markup; css rules: 0 |
| `#lightIntensityValue` | both | `index.html:1267`, `js/13-light-source.js:90` | span "0.50"; static markup; css rules: 0 |
| `#lightMode` | both | `index.html:1244`, `js/01a-param-registry.js:259`, `js/13-light-source.js:68`, `js/44-recipes.js:366`; +4 test/bake files | select; static markup; css rules: 0 |
| `#lightShiftControls` | both | `index.html:1284`, `js/14-light-shift.js:42`, `js/20-mixer-layout.js:4468` | div "Draw a path through colors"; static markup; css rules: 2 |
| `#lightShiftIntensity` | both | `index.html:1321`, `js/01a-param-registry.js:461`, `js/14-light-shift.js:97`; +2 test/bake files | input[type=range]; static markup; css rules: 0 |
| `#lightShiftIntensityValue` | both | `index.html:1319`, `js/14-light-shift.js:98` | span "0.50"; static markup; css rules: 0 |
| `#lightShiftMode` | both | `index.html:1293`, `js/01a-param-registry.js:259`, `js/14-light-shift.js:57`, `js/44-recipes.js:376`; +2 test/bake files | select; static markup; css rules: 0 |
| `#lightShiftSaturation` | both | `index.html:1328`, `js/01a-param-registry.js:461`, `js/14-light-shift.js:108`; +1 test/bake file | input[type=range]; static markup; css rules: 0 |
| `#lightShiftSaturationValue` | both | `index.html:1326`, `js/14-light-shift.js:109` | span "1.00"; static markup; css rules: 0 |
| `#lightShiftSpeed` | both | `index.html:1307`, `js/01a-param-registry.js:461`, `js/14-light-shift.js:75`; +2 test/bake files | input[type=range]; static markup; css rules: 0 |
| `#lightShiftSpeedValue` | both | `index.html:1305`, `js/14-light-shift.js:76` | span "0.50"; static markup; css rules: 0 |
| `#lightShiftThreshold` | both | `index.html:1314`, `js/01a-param-registry.js:461`, `js/14-light-shift.js:86`; +2 test/bake files | input[type=range]; static markup; css rules: 0 |
| `#lightShiftThresholdValue` | both | `index.html:1312`, `js/14-light-shift.js:87` | span "0.85"; static markup; css rules: 0 |
| `#lightShiftWheel` | both | `index.html:1289`, `js/14-light-shift.js:131`, `js/44-recipes.js:375` | canvas; static markup; css rules: 0 |
| `#lightSourceControls` | both | `index.html:1241`, `js/13-light-source.js:53`, `js/20-mixer-layout.js:4465` | div; static markup; css rules: 0 |
| `#lightSpeed` | both | `index.html:1262`, `js/01a-param-registry.js:461`, `js/13-light-source.js:78`; +1 test/bake file | input[type=range]; static markup; css rules: 0 |
| `#lightSpeedControl` | both | `index.html:1257`, `js/13-light-source.js:127` | div "Speed 0.50"; static markup; css rules: 0 |
| `#lightSpeedValue` | both | `index.html:1260`, `js/13-light-source.js:79` | span "0.50"; static markup; css rules: 0 |
| `#loadSettingsBtn` | both | `index.html:1342`, `js/12-save-load.js:500` | button "Load"; static markup; css rules: 0 |
| `#lockCanvasBorders` | both | `index.html:1333`, `js/01-config.js:47`, `js/01a-param-registry.js:183`, `js/05n-hotkeys-init.js:113`, `js/17-hotkey-reminder.js:118`, `js/20-mixer-layout.js:4582`; +3 test/bake files | input[type=checkbox] labelled "Lock Canvas Borders"; label for= target; x2 in static markup (lines 1333, 1334); css rules: 0 |
| `#lockRoomBtn` | both | `index.html:1478`, `js/06e-mp-panel.js:570`; +1 test/bake file | button[type=button] "Lock room"; static markup; css rules: 0 |
| `#look-toast` | both | `js/50-look-links.js:822`; +1 test/bake file | the look-link toast, created once on body with role=status; ALL its styling is inline cssText (824-827: fixed bottom 64px, colours #e6edf3 / #58a6ff /… |
| `#macCormackToggle` | both | `index.html:751`, `js/01a-param-registry.js:183`, `js/05e-effect-controls.js:11`, `js/20-mixer-layout.js:4172`; +1 test/bake file | input[type=checkbox] labelled "Crisp Advection"; label for= target; x2 in static markup (lines 751, 752); css rules: 0 |
| `#main-area` | write | `js/20-mixer-layout.js:62` | created wrapper holding #sidebar-left, its fold edge, #canvas-area, the right fold tab and #sidebar-right |
| `#mandalaCaptureBtn` | both | `index.html:976`, `js/34-mandala-mode.js:46` | button "Save picture"; static markup; css rules: 0 |
| `#mandalaConstrain` | both | `index.html:939`, `js/34-mandala-mode.js:45`; +1 test/bake file | input[type=checkbox] labelled "Paint Only In Wedge"; label for= target; x2 in static markup (lines 939, 940); css rules: 0 |
| `#mandalaDensity` | both | `index.html:960`, `js/34-mandala-mode.js:118` | label for= target; input[type=range] labelled "Density Sustain 0.9900"; x2 in static markup (lines 960, 961); css rules: 0 |
| `#mandalaDensityValue` | both | `index.html:960`, `js/34-mandala-mode.js:118` | span "0.9900"; static markup; css rules: 0 |
| `#mandalaDryTime` | both | `index.html:972` | label for= target; input[type=range] labelled "Dry Time 0.5s"; x2 in static markup (lines 972, 973); css rules: 0 |
| `#mandalaDryTimeValue` | write | `index.html:972` | span "0.5s"; static markup; css rules: 0 |
| `#mandalaFill` | write | `index.html:948` | div "Off Fit Full"; static markup; css rules: 0 |
| `#mandalaGuides` | both | `js/34-mandala-mode.js:245`; +1 test/bake file | guide SVG overlay appended to #canvas-wrapper; inline cssText position/pointer-events/display (246) + left/top/width/height/zIndex per draw (260-271); display toggled… |
| `#mandalaHideGuides` | both | `index.html:943`, `js/34-mandala-mode.js:44` | input[type=checkbox] labelled "Hide Guides"; label for= target; x2 in static markup (lines 943, 944); css rules: 0 |
| `#mandalaIsolation` | both | `index.html:964`, `js/34-mandala-mode.js:119` | label for= target; input[type=range] labelled "Motion Isolation 2.000"; x2 in static markup (lines 964, 965); css rules: 0 |
| `#mandalaIsolationValue` | both | `index.html:964`, `js/34-mandala-mode.js:119` | span "2.000"; static markup; css rules: 0 |
| `#mandalaPanel` | both | `index.html:933`, `js/20-mixer-layout.js:4141`, `js/34-mandala-mode.js:43` | div "Wedges 12"; static markup; css rules: 0 |
| `#mandalaToggle` | both | `index.html:930`, `js/20-mixer-layout.js:4140`, `js/34-mandala-mode.js:42`, `js/44-recipes.js:404`, `js/61-room-report.js:130`; +3 test/bake files | input[type=checkbox] labelled "Mandala Overlay"; label for= target; x2 in static markup (lines 930, 931); css rules: 0 |
| `#mandalaWedges` | both | `index.html:935`, `js/34-mandala-mode.js:47`, `js/44-recipes.js:407`; +1 test/bake file | label for= target; input[type=range] labelled "Wedges 12"; x2 in static markup (lines 935, 936); css rules: 0 |
| `#mandalaWedgesValue` | both | `index.html:935`, `js/34-mandala-mode.js:48` | span "12"; static markup; css rules: 0 |
| `#mandalaWet` | both | `index.html:968`, `js/34-mandala-mode.js:120` | label for= target; input[type=range] labelled "Drying 1.00"; x2 in static markup (lines 968, 969); css rules: 0 |
| `#mandalaWetValue` | both | `index.html:968`, `js/34-mandala-mode.js:120` | span "1.00"; static markup; css rules: 0 |
| `#manualShapeTools` | write | `js/15-layer-masking.js:223` | holds the eight stamp buttons (class mask-shape-tools); never queried by id |
| `#maskColliderOpt` | both | `js/15-layer-masking.js:310` | 'Also make this a collision layer' label (mask-collider-opt); display toggled 2970 |
| `#maskEditorCanvas` | both | `js/15-layer-masking.js:326`, `js/16-sam-integration.js:876` | the editor's 2D canvas (class mask-editor-canvas, touch-action: none in CSS); read 547, 633, 1226, 1355 |
| `#maskEditorOverlay` | both | `js/15-layer-masking.js:147`, `js/44-recipes.js:308`, `js/59-brush-type-key.js:110`, `js/66-skip-menu.js:292`; +1 test/bake file | the Mask Editor dialog (className mask-editor-overlay), created once and kept in body; style.display flex/none toggles it (101, 139); read 96, 137, 2543, 2937, 2994,… |
| `#maskFeatherHint` | both | `js/15-layer-masking.js:307` | hint (mask-feather-hint); textContent swapped 2960-2965 |
| `#maskFeatherSlider` | both | `js/15-layer-masking.js:304` | feather range (data-no-scale); read 496, 3048 (setRangeValue -> --val) |
| `#maskFeatherValue` | both | `js/15-layer-masking.js:305` | readout (mask-feather-value); textContent 500, 3050 |
| `#maskHint` | both | `js/15-layer-masking.js:322` | hint strip (class mask-hint); read 1755, 2652, 3278; innerHTML rewritten with <strong> fragments (1764, 1890, 2654, 3280) |
| `#maskMakeCollider` | both | `js/15-layer-masking.js:311` | checkbox; read 507, 2971 (.checked synced) |
| `#maskRotationControl` | both | `js/15-layer-masking.js:314` | stamp rotation row (class mask-rotation-control, heavy inline style= in the template); display toggled 694-708, 2955, 3300; no rule in css/ matches .mask-rotation-control |
| `#maskRotationSlider` | both | `js/15-layer-masking.js:317` | rotation range (no data-no-scale); read 533, 695 (setRangeValue -> --val) |
| `#maskRotationValue` | both | `js/15-layer-masking.js:318` | readout; textContent 537, 696 |
| `#maskWizardBack` | both | `js/15-layer-masking.js:347` | ← Back (mask-back-btn); display toggled 2980-2983, 3003-3006 |
| `#maskWizardNext` | both | `js/15-layer-masking.js:348`, `js/44-recipes.js:310` | Next → (mask-next-btn); read 1959 (.disabled + textContent while a cutout is pending), 2981, 3004 (display) |
| `#maskWizardRail` | both | `js/15-layer-masking.js:158` | three-step rail; shown / hidden via wizardSetDisplay 2941, 2996 |
| `#maskZoomLevel` | both | `js/15-layer-masking.js:338` | zoom % readout; textContent 625 |
| `#materialMode` | both | `index.html:786`, `js/08b-jank-monitor.js:447`, `js/20-mixer-layout.js:1146`, `js/29-material-modes.js:310`, `js/44-recipes.js:159`, `js/46-strip-more.js:109`; +2 test/bake files | select; static markup; css rules: 0 |
| `#max-button` | both | `index.html:536`, `js/00-window-controls.js:108` | button; static markup; css rules: 0 |
| `#mgCoarse` | both | `index.html:772`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:39`, `js/42-perf-tiers.js:245`; +1 test/bake file | label for= target; input[type=range] labelled "Coarse Solve 8"; x2 in static markup (lines 772, 773); css rules: 0 |
| `#mgCoarseValue` | both | `index.html:772`, `js/05e-effect-controls.js:43` | span "8"; static markup; css rules: 0 |
| `#mgCycles` | both | `index.html:760`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:39`, `js/42-perf-tiers.js:242`; +1 test/bake file | label for= target; input[type=range] labelled "V-Cycles 2"; x2 in static markup (lines 760, 761); css rules: 0 |
| `#mgCyclesValue` | both | `index.html:760`, `js/05e-effect-controls.js:43` | span "2"; static markup; css rules: 0 |
| `#mgPost` | both | `index.html:768`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:39`, `js/42-perf-tiers.js:244`; +1 test/bake file | label for= target; input[type=range] labelled "Post-Smooth 2"; x2 in static markup (lines 768, 769); css rules: 0 |
| `#mgPostValue` | both | `index.html:768`, `js/05e-effect-controls.js:43` | span "2"; static markup; css rules: 0 |
| `#mgPre` | both | `index.html:764`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:39`, `js/42-perf-tiers.js:243`; +1 test/bake file | label for= target; input[type=range] labelled "Pre-Smooth 2"; x2 in static markup (lines 764, 765); css rules: 0 |
| `#mgPreValue` | both | `index.html:764`, `js/05e-effect-controls.js:43` | span "2"; static markup; css rules: 0 |
| `#mgRelax` | both | `index.html:776`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:39`; +1 test/bake file | label for= target; input[type=range] labelled "Relaxation 1.00"; x2 in static markup (lines 776, 777); css rules: 0 |
| `#mgRelaxValue` | both | `index.html:776`, `js/05e-effect-controls.js:43` | span "1.00"; static markup; css rules: 0 |
| `#min-button` | both | `index.html:533`, `js/00-window-controls.js:107` | button; static markup; css rules: 0 |
| `#mirror` | both | `js/47-pen-window.js:318`; +3 test/bake files | pen window: 2D <canvas> mirror of #canvas; width/height attrs (1505-1506), hidden toggled (1537, 1569, 1586) |
| `#mirrorBtn` | both | `js/47-pen-window.js:334`; +2 test/bake files | pen window: cycles Light / Smooth / Off (1669-1679) |
| `#mixer-brushValue` | both | `js/20-mixer-layout.js:94`; +2 test/bake files | Brush Size readout (.ch-value) created L1178 via faderChannel newValueId (L815); read L94 to print the px text |
| `#mixer-more` | both | `js/46-strip-more.js:246`; +1 test/bake file | the More cell in the strip; has no data-ui-key on purpose (43 leaves it alone) |
| `#mixer-more-panel` | both | `js/08b-jank-monitor.js:205`, `js/17-hotkey-reminder.js:47`, `js/44-recipes.js:724`, `js/46-strip-more.js:271`, `js/49-hotkey-binds.js:327`; +4 test/bake files | body-mounted panel holding parked faders; read by 17, 44, 49 |
| `#mixer-strip` | both | `js/00a-boot.js:120`, `js/08b-jank-monitor.js:204`, `js/13-compact-mode.js:57`, `js/17-hotkey-reminder.js:47`, `js/20-mixer-layout.js:40`, `js/43-ui-visibility.js:121`; +6 more; +24 test/bake files | guard read L40 (build once); created L807 strip.id = 'mixer-strip' with data-group=core; root of the top bar |
| `#mixerMoreBtn` | both | `js/46-strip-more.js:250`; +1 test/bake file | the More button; focus returns here on close (00b popup) |
| `#mixerPresetGroupSel` | write | `js/20-mixer-layout.js:2129` | save-form group <select> (.mixer-preset-group-sel) |
| `#mixerPresetNameInput` | write | `js/20-mixer-layout.js:2121` | save-form name field (.mixer-preset-name-input); inline border colour #ff6b6b written on a duplicate name L2335 |
| `#mixerPresetsTrigger` | both | `js/20-mixer-layout.js:1740`, `js/43-ui-visibility.js:226`, `js/44-recipes.js:741`, `js/49-hotkey-binds.js:618`; +4 test/bake files | Presets popup trigger (.mixer-presets-trigger) with aria-haspopup/aria-expanded; .active while the panel is open |
| `#mpActivity` | both | `index.html:1423`, `js/06e-mp-panel.js:413`, `js/44-recipes.js:526`; +2 test/bake files | div; static markup; css rules: 0 |
| `#mpConnected` | both | `index.html:1413`, `js/06e-mp-panel.js:586`, `js/44-recipes.js:508`, `js/54-phone-pads.js:61`; +2 test/bake files | div; static markup; css rules: 0 |
| `#mpDisconnected` | both | `index.html:1392`, `js/06e-mp-panel.js:585`, `js/20-mixer-layout.js:8380`, `js/54-phone-pads.js:263`; +5 test/bake files | div; static markup; css rules: 2 |
| `#mpError` | both | `index.html:1408`, `js/06e-mp-panel.js:600`, `js/54-phone-pads.js:271`; +1 test/bake file | div; static markup; css rules: 0 |
| `#mpInviteBtn` | both | `index.html:1430`, `js/06e-mp-panel.js:505`, `js/44-recipes.js:518`; +2 test/bake files | button[type=button] "Invite ▾"; static markup; css rules: 0 |
| `#mpInvitePop` | both | `index.html:1430`, `js/06e-mp-panel.js:773`, `js/44-recipes.js:745`, `js/54-phone-pads.js:288`; +4 test/bake files | referenced by aria-controls on #mpInviteBtn; div; x2 in static markup (lines 1430, 1445); css rules: 0 |
| `#mpMenuBtn` | both | `index.html:1431`, `js/06e-mp-panel.js:761`, `js/44-recipes.js:746`; +2 test/bake files | button[type=button] "⋯"; static markup; css rules: 0 |
| `#mpRoomMenu` | both | `index.html:1431`, `js/06e-mp-panel.js:773`, `js/44-recipes.js:746`, `js/61-room-report.js:165`; +2 test/bake files | referenced by aria-controls on #mpMenuBtn; div "Lock room"; x2 in static markup (lines 1431, 1477); css rules: 0 |
| `#mpRoomToast` | both | `js/06e-mp-panel.js:452`; +3 test/bake files | showRoomToast: looked up (452), created on first use (455) as div.mp-room-toast[role=status] appended to body; shown by inline opacity 1 -> 0 after 2.6 s; called from… |
| `#multiArtistPanel` | both | `index.html:1390`, `js/20-mixer-layout.js:8368`; +3 test/bake files | div; static markup; css rules: 1 |
| `#multigridPanel` | both | `index.html:758`, `js/05e-effect-controls.js:22`, `js/20-mixer-layout.js:4176` | div; static markup; css rules: 0 |
| `#multigridToggle` | both | `index.html:755`, `js/01a-param-registry.js:183`, `js/05e-effect-controls.js:21`, `js/20-mixer-layout.js:4173`; +1 test/bake file | input[type=checkbox] labelled "Multigrid Pressure"; label for= target; x2 in static markup (lines 755, 756); css rules: 0 |
| `#multiplayerStatus` | both | `index.html:1418`, `js/06e-mp-panel.js:310`, `js/44-recipes.js:509`; +2 test/bake files | span "Connecting…"; static markup; css rules: 0 |
| `#multiplayerToggle` | both | `index.html:1389`, `js/06a-mp-core.js:400`, `js/06e-mp-panel.js:589`, `js/20-mixer-layout.js:8372` | input[type=checkbox]; static markup; css rules: 0 |
| `#multiplier` | both | `index.html:881`, `js/01a-param-registry.js:461`, `js/04b-presets.js:48`, `js/04e-anim-portal.js:27`, `js/04f-canvas-actions.js:119`, `js/05e-effect-controls.js:407`; +4 more; +9 test/bake files | label for= target; input[type=range] labelled "Multiplier 1x"; x2 in static markup (lines 881, 882); css rules: 0 |
| `#multiplierPanel` | read | `js/49-hotkey-binds.js:233` | old bindings to the removed Multi-Brush proxy slider are redirected to #multiplier |
| `#multiplierValue` | both | `index.html:881`, `js/04e-anim-portal.js:29`, `js/04f-canvas-actions.js:121`, `js/05e-effect-controls.js:408`, `js/20-mixer-layout.js:849`, `js/43-ui-visibility.js:226`; +1 more; +1 test/bake file | span "1x"; static markup; css rules: 1 |
| `#mutation-section` | both | `js/20-mixer-layout.js:2917`, `js/43-ui-visibility.js:578` | the Mutate shader .sidebar-section |
| `#mutationChain` | both | `js/20-mixer-layout.js:3063` | chain breadcrumb; read 3529. x2 |
| `#mutationCount` | both | `js/20-mixer-layout.js:2984` | Variants select 4\|6\|9\|12; read 3134. x2 |
| `#mutationDiff` | both | `js/20-mixer-layout.js:3056` | diff panel; inline display none/block (3058, 3513, 3516, 3609); read 3509, 3608. x3 |
| `#mutationGenerate` | both | `js/05n-hotkeys-init.js:576`, `js/17-hotkey-reminder.js:123`, `js/20-mixer-layout.js:2996`, `js/44-recipes.js:420`; +1 test/bake file | Mutate button (.mutation-btn.mutation-btn-primary) |
| `#mutationGrid` | both | `js/20-mixer-layout.js:3049`; +1 test/bake file | variant grid; inline display none/'' (3051, 3168, 3172); read 3161. x2 |
| `#mutationRedo` | both | `js/20-mixer-layout.js:3007` | .disabled driven by chain index (3010, 3565); read 3563. x2 |
| `#mutationReset` | write | `js/20-mixer-layout.js:3013` | Reset button (.mutation-btn) |
| `#mutationScope` | both | `js/20-mixer-layout.js:2932`; +1 test/bake file | hidden native select (inline cssText position:absolute;opacity:0;pointer-events:none;width:0;height:0, aria-hidden, tabIndex -1) behind the .mutation-scope-seg; read… |
| `#mutationStrength` | both | `js/20-mixer-layout.js:2968` | range input 0.05-1 with data-no-scale; read 3125. x2 |
| `#mutationStrengthVal` | both | `js/20-mixer-layout.js:2966` | value readout span (class value-display) inside the Strength label; read 2973 on input. x2 |
| `#mutationUndo` | both | `js/20-mixer-layout.js:3001`, `js/44-recipes.js:424` | .disabled driven by chain index (3004, 3564); read 3562. x2 |
| `#opacityValue` | both | `index.html:1041`, `js/05e-effect-controls.js:325`; +1 test/bake file | span "100%"; static markup; css rules: 0 |
| `#openDesktopGo` | both | `js/51-open-in-desktop.js:96` | 'Open in desktop' (btn--emphasis); initial focus (159); disabled + inline display none through the hand-off |
| `#openDesktopModal` | write | `js/51-open-in-desktop.js:82` | the web build's 'Open in the desktop app?' question, built once on first offer and appended to body (99);… |
| `#openDesktopMsg` | both | `js/51-open-in-desktop.js:91` | message text rewritten through the hand-off verdict (138, 171, 184-192) |
| `#openDesktopNever` | both | `js/51-open-in-desktop.js:92` | the checkbox; .checked read on close -> localStorage fluidui.openInDesktop.never |
| `#openDesktopStay` | both | `js/51-open-in-desktop.js:94` | 'Stay in browser' / 'Stay here'; onclick close |
| `#openDesktopStore` | both | `js/51-open-in-desktop.js:95` | 'Get it on Steam' (class btn--emphasis); inline display none until the hand-off fails |
| `#openDesktopTitle` | both | `js/51-open-in-desktop.js:90` | title (90), read into els.title (102); aria-labelledby target |
| `#openPresetsFolderBtn` | both | `index.html:1387`, `js/12b-preset-vault.js:514`, `js/20-mixer-layout.js:8423` | button "Open Presets Folder"; static markup; css rules: 0 |
| `#overflowBand` | both | `index.html:1148`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:97`; +1 test/bake file | label for= target; input[type=range] labelled "Width 2.5%"; x2 in static markup (lines 1148, 1149); css rules: 0 |
| `#overflowBandValue` | both | `index.html:1148`, `js/05e-effect-controls.js:98` | span "2.5%"; static markup; css rules: 0 |
| `#overflowPanel` | both | `index.html:1146`, `js/05e-effect-controls.js:80`, `js/20-mixer-layout.js:4513` | div "Width 2.5%"; static markup; css rules: 0 |
| `#overflowToggle` | both | `index.html:1143`, `js/01a-param-registry.js:183`, `js/05e-effect-controls.js:79`, `js/20-mixer-layout.js:4512`, `js/44-recipes.js:389`; +1 test/bake file | input[type=checkbox] labelled "Border"; label for= target; x2 in static markup (lines 1143, 1144); css rules: 0 |
| `#paletteActiveHead` | both | `index.html:654`, `js/01-config.js:860` | div; static markup; css rules: 0 |
| `#paletteAddChip` | both | `js/01-config.js:888`, `js/44-recipes.js:227`, `js/64-colour-picker.js:743`; +1 test/bake file | the [+] button at the end of the colour row; focus restored by id after a re-render; css rules: 0 |
| `#paletteCarousel` | both | `index.html:651`, `js/01-config.js:431`, `js/17-hotkey-reminder.js:92`, `js/20-mixer-layout.js:4531` | div; static markup; css rules: 0 |
| `#paletteExtractHost` | both | `index.html:652`, `js/44-recipes.js:235`, `js/65-palette-from-image.js:282`; +1 test/bake file | div; static markup; css rules: 3 |
| `#paletteFluidFile` | both | `index.html:663` | inline handler: document.getElementById('paletteFluidFile').click(); input[type=file]; x2 in static markup (lines 663, 664); css rules: 0 |
| `#paletteImportStatus` | both | `index.html:650`, `js/01-config.js:668`; +1 test/bake file | span; static markup; css rules: 0 |
| `#paletteKeys` | write | `index.html:658` | div; static markup; css rules: 0 |
| `#paletteNewBtn` | write | `js/01-config.js:580` | "Brush color" button in the palette list New row; css rules: 0 |
| `#paletteNote` | both | `index.html:656`, `js/01-config.js:704`; +1 test/bake file | div; static markup; css rules: 0 |
| `#palettePickerHost` | both | `index.html:657`, `js/64-colour-picker.js:805`; +1 test/bake file | div; static markup; css rules: 0 |
| `#palettePreview` | both | `index.html:655`, `js/01-config.js:705`, `js/44-recipes.js:247`, `js/64-colour-picker.js:735`; +2 test/bake files | div; static markup; css rules: 0 |
| `#paletteSelect` | both | `js/01-config.js:428`, `js/44-recipes.js:224`; +3 test/bake files | palette dropdown trigger (div[role=combobox]) rebuilt by refreshPaletteCarousel into #paletteCarousel; css rules: 0 |
| `#paletteStepIndicator` | read | `js/01-config.js:972`; +1 test/bake file | UNRESOLVED: no element with this id exists in index.html or any js/ template; guarded lookup hides it if present; scripts/test/palette-picker/run.js:200 asserts it is… |
| `#pasteIndicator` | write | `js/32-file-drop.js:242` | paste toast appended to body; inline style.cssText only (243-246, rgba(15,20,27,0.9) / rgba(110,200,255,0.45) / #fff); style.display toggled 250, 252; no CSS |
| `#pathDeleteCancel` | both | `js/24-path-layers.js:877` | click closes with false; DialogFocus initial focus; no CSS |
| `#pathDeleteConfirm` | both | `js/24-path-layers.js:878` | no CSS |
| `#pathDeleteModal` | both | `js/24-path-layers.js:870` | lazily built delete-confirm modal appended to body; class delete-modal; show toggled by class; no id rule in css/ |
| `#pathDeleteModalMessage` | both | `js/24-path-layers.js:875` | textContent set per confirm; no CSS |
| `#pathDrawCancel` | both | `js/24-path-layers.js:929` | CSS 22-overlays.css x1 |
| `#pathDrawCanvas` | both | `js/24-path-layers.js:932` | 2D draw surface sized to #canvas-wrapper; CSS 22-overlays.css x1 |
| `#pathDrawDone` | both | `js/24-path-layers.js:928` | CSS 22-overlays.css x1 |
| `#pathDrawOverlay` | write | `js/24-path-layers.js:924` | full-screen freehand-draw overlay appended to body, removed on exit 1061; CSS 22-overlays.css x3 |
| `#pathDrawStatus` | both | `js/24-path-layers.js:927` | status span; textContent + style.color #ffb74d / '' (958, 961); no CSS |
| `#pathLayersList` | both | `js/20-mixer-layout.js:3749`, `js/24-path-layers.js:458` | Path Layers list container, filled by window.pathLayers.render() |
| `#pathTransformCancel` | both | `js/24-path-layers.js:1089` | CSS 22-overlays.css x1 |
| `#pathTransformCanvas` | both | `js/24-path-layers.js:1092` | style.cursor written per pointer move (1209: move / corner cursor / default); CSS 22-overlays.css x1 |
| `#pathTransformDone` | both | `js/24-path-layers.js:1088` | CSS 22-overlays.css x1 |
| `#pathTransformOverlay` | write | `js/24-path-layers.js:1084` | move/resize overlay appended to body, removed 1263, 1283; CSS 22-overlays.css x3 |
| `#pauseBtn` | both | `index.html:1482`, `js/04f-canvas-actions.js:63`, `js/20-mixer-layout.js:1537`, `js/45-breathing.js:78`; +10 test/bake files | button "Pause"; static markup; css rules: 4 |
| `#penWindowBtn` | both | `index.html:1086`, `js/20-mixer-layout.js:4555`, `js/44-recipes.js:598`, `js/47-pen-window.js:1759`; +5 test/bake files | label for= target; button[type=button] labelled "Pen Input Window"; x2 in static markup (lines 1086, 1087); css rules: 0 |
| `#penWindowHint` | both | `index.html:1088`, `js/47-pen-window.js:1760` | div; static markup; css rules: 0 |
| `#penWindowMirror` | both | `index.html:1091`, `js/20-mixer-layout.js:4556`, `js/47-pen-window.js:193`; +2 test/bake files | label for= target; select labelled "Pen Window Mirror"; x2 in static markup (lines 1091, 1092); css rules: 0 |
| `#penWindowMouseReturn` | both | `index.html:1107`, `js/20-mixer-layout.js:4558`, `js/47-pen-window.js:949`; +1 test/bake file | input[type=checkbox] labelled "Mouse Picks Up Where It Left Off"; label for= target; x2 in static markup (lines 1107, 1108); css rules: 1 |
| `#penWindowScreens` | both | `index.html:1100`, `js/20-mixer-layout.js:4557`, `js/44-recipes.js:601`, `js/47-pen-window.js:549`; +2 test/bake files | div; static markup; css rules: 0 |
| `#phonePadAlt` | both | `js/54-phone-pads.js:347`; +1 test/bake file | textContent (456) |
| `#phonePadBody` | both | `js/54-phone-pads.js:344`; +1 test/bake file | .hidden while a stranger pairing has no seat (454) |
| `#phonePadBtn` | both | `js/44-recipes.js:535`, `js/54-phone-pads.js:264`; +5 test/bake files | 'Sync phone' door in #mpDisconnected: button.mp-btn-phone-door; textContent adds ' · connected' while a phone is the mouse (305); js/44-recipes.js:535 targets it |
| `#phonePadCode` | both | `js/54-phone-pads.js:348`; +3 test/bake files | textContent code / dots (457) |
| `#phonePadDone` | both | `js/54-phone-pads.js:358`; +1 test/bake file | 'Done' (btn--emphasis), initial focus (525), click -> close |
| `#phonePadModal` | both | `js/54-phone-pads.js:332`; +2 test/bake files | 'Paint from your phone' dialog: div.delete-modal.phone-pad-modal[data-group=core][role=dialog][aria-modal][aria-labelledby=phonePadTitle], appended to body (361); scrim… |
| `#phonePadMsg` | both | `js/54-phone-pads.js:343` | textContent per way (427-430) |
| `#phonePadNote` | both | `js/54-phone-pads.js:354`; +1 test/bake file | .hidden = !note (494) |
| `#phonePadQr` | both | `js/54-phone-pads.js:345`; +3 test/bake files | innerHTML = QRCode.svg(url) (450), aria-label (451-452), .is-hidden (455) |
| `#phonePadReveal` | both | `js/54-phone-pads.js:349`; +1 test/bake file | .hidden unless Hide mode hides the code (458); click reveals |
| `#phonePadRoomBtn` | both | `js/44-recipes.js:535`, `js/54-phone-pads.js:289`; +2 test/bake files | the in-room door: button.mp-btn-share.mp-btn-phone[data-pop-close]; textContent lists 'your mouse' / 'N artists' (307-319); 44 tour fallback target |
| `#phonePadStatus` | both | `js/54-phone-pads.js:353`; +2 test/bake files | .hidden when empty (491), textContent, .is-live (493) |
| `#phonePadStop` | both | `js/54-phone-pads.js:356`; +1 test/bake file | 'Disconnect the phone', .hidden unless a phone is the mouse (497) |
| `#phonePadTitle` | write | `js/54-phone-pads.js:339` | aria-labelledby target; never queried |
| `#phonePadUnlock` | both | `js/54-phone-pads.js:357` | 'Unlock the room', .hidden unless host of a locked room in artist mode (496) |
| `#phonePadWayArtist` | both | `js/54-phone-pads.js:342`; +3 test/bake files | aria-pressed toggle (342 default false, 424) |
| `#phonePadWayMouse` | both | `js/54-phone-pads.js:341`; +1 test/bake file | aria-pressed toggle (341 default true, 423) |
| `#photoSafeOffGo` | both | `js/05e-effect-controls.js:253` | Turn off button; queried L258; trusted click required |
| `#photoSafeOffKeep` | both | `js/05e-effect-controls.js:252` | Keep button; queried L257 (click) and L279 (DialogFocus initial focus) |
| `#photoSafeOffModal` | write | `js/05e-effect-controls.js:239` | created once (L238-256): div.delete-modal[data-group=system][role=alertdialog]; opened/closed with .show; appended to body |
| `#photoSafeOffMsg` | write | `js/05e-effect-controls.js:249` | aria-describedby target of #photoSafeOffModal |
| `#photoSafeOffTitle` | write | `js/05e-effect-controls.js:248` | aria-labelledby target of #photoSafeOffModal |
| `#photoSafeToggle` | both | `index.html:451`, `js/01a-param-registry.js:183`, `js/05e-effect-controls.js:194`, `js/20-mixer-layout.js:4545`, `js/44-recipes.js:607`; +3 test/bake files | input[type=checkbox] labelled "Reduce flashing and rapid brightness changes"; label for= target; x2 in static markup (lines 1053, 1054); css rules: 0 \|\| Continue… |
| `#photoWarn` | both | `index.html:302`, `js/00b-dialog-focus.js:276`, `js/38-button-audit.js:30`, `js/43-ui-visibility.js:597`, `js/51-open-in-desktop.js:245`, `js/52-demo-clock.js:331`; +2 more; +23 test/bake files | div; static markup; css rules: 0 \|\| PhotoSafe dialog root; .hidden toggled at 406/508/514; .pw-off toggled at 389; inline <style> 252-300 scopes every rule under it |
| `#photoWarnShowBtn` | both | `index.html:1057`, `js/05e-effect-controls.js:290`, `js/20-mixer-layout.js:4546`, `js/44-recipes.js:610` | button[type=button] "Show photosensitivity warning"; static markup; css rules: 0 |
| `#physicsResolution` | both | `index.html:688`, `js/01a-param-registry.js:259`, `js/05h-slider-bindings.js:293`, `js/05n-hotkeys-init.js:110`, `js/06b-mp-look.js:285`, `js/08a-quality-governor.js:351`; +4 more; +16 test/bake files | label for= target; select labelled "Motion Detail"; x2 in static markup (lines 688, 689); css rules: 0 |
| `#physicsResolutionCustom` | read | `js/05h-slider-bindings.js:294` | number input, inline style.display (L300, L307) |
| `#playtestLabel` | write | `js/52-demo-clock.js:448` | web build / itch playtest: div.playtest-label '0.04 playtest' in the clock's spot (place + tuck); removed if the demo clock is enabled (355) |
| `#portalBtn` | both | `index.html:1490`, `js/04e-anim-portal.js:85` | button "Portal"; static markup; css rules: 0 |
| `#preserveFluidOpacity` | both | `index.html:1045`, `js/01a-param-registry.js:183`, `js/05e-effect-controls.js:336`, `js/20-mixer-layout.js:4571`; +1 test/bake file | input[type=checkbox] labelled "Empty Alpha Locked"; label for= target; x2 in static markup (lines 1045, 1046); css rules: 0 |
| `#preserveRandomness` | write | `js/20-mixer-layout.js:5129` | Preserve Randomness checkbox; label[for] 5131 |
| `#presetPathToast` | write | `js/20-mixer-layout.js:1685` | role=status toast, body-mounted once; shown/hidden through the hidden attribute (L1690/L1692) |
| `#presetsGroup` | write | `index.html:1350` | div; static markup; css rules: 0 |
| `#pressureConstant` | both | `index.html:1120`, `js/20-mixer-layout.js:4198`, `js/44-recipes.js:381`; +4 test/bake files | input[type=checkbox] labelled "Gravity Direction"; label for= target; x2 in static markup (lines 1120, 1121); css rules: 0 |
| `#pressureDissipation` | both | `index.html:739`, `js/01a-param-registry.js:461`, `js/04b-presets.js:102`, `js/05h-slider-bindings.js:535`, `js/20-mixer-layout.js:4162`, `js/29-material-modes.js:118`; +2 test/bake files | label for= target; input[type=range] labelled "Pressure Dissipation 0.950"; x2 in static markup (lines 739, 740); css rules: 0 |
| `#pressureFieldControls` | both | `index.html:1126`, `js/20-mixer-layout.js:4199` | div; static markup; css rules: 0 |
| `#pressureIteration` | both | `index.html:743`, `js/01a-param-registry.js:461`, `js/04b-presets.js:103`, `js/05h-slider-bindings.js:535`, `js/08a-quality-governor.js:352`, `js/20-mixer-layout.js:4163`; +2 more; +2 test/bake files | label for= target; input[type=range] labelled "Pressure Iteration 25"; x2 in static markup (lines 743, 744); css rules: 0 |
| `#pressurePad` | both | `index.html:1127`, `js/44-recipes.js:384`; +1 test/bake file | div; static markup; css rules: 0 |
| `#pressurePadRead` | both | `index.html:1135`; +2 test/bake files | div "Centered - no gravity"; static markup; css rules: 0 |
| `#pressureValue` | both | `index.html:739`, `js/05h-slider-bindings.js:549`, `js/29-material-modes.js:119` | span "0.950"; static markup; css rules: 0 |
| `#previewToggle` | both | `index.html:1551`, `js/20-mixer-layout.js:3762` | div "PREVIEW LAYERS"; static markup; css rules: 0 |
| `#pwContinue` | both | `index.html:324` | button[type=button] "Continue with protection on"; static markup; css rules: 0 \|\| primary button; textContent swapped at 391; inline CSS 293 + 297 (#photoWarn.pw-off… |
| `#pwDesc` | both | `index.html:302` | referenced by aria-describedby on #photoWarn; p; x2 in static markup (lines 302, 305); css rules: 0 |
| `#pwExit` | both | `index.html:323` | button[type=button] "Exit App"; static markup; css rules: 0 \|\| Exit App button; Tab ring member (488) |
| `#pwLearn` | both | `index.html:319` | a; static markup; css rules: 0 \|\| Epilepsy Foundation link; Tab ring member (488) |
| `#pwProtect` | both | `index.html:310` | input[type=checkbox]; static markup; css rules: 0 \|\| protection checkbox; change listener at 421 (isTrusted-gated) |
| `#pwTitle` | both | `index.html:302` | referenced by aria-labelledby on #photoWarn; h1 "⚠ Photosensitive seizure warning"; x2 in static markup (lines 302, 304); css rules: 0 \|\| h1 focused on open (411) and… |
| `#quality-underbar` | both | `js/01-config.js:1405`, `js/08a-quality-governor.js:519`, `js/20-mixer-layout.js:2678`, `js/43-ui-visibility.js:154`, `js/44-recipes.js:793`, `js/52-demo-clock.js:148`; +3 more; +4 test/bake files | exists-check 2676, created 2678, body-mounted; .qub-shading toggled on it (2713); inline left/right set from #canvas-area's rect (2733-2734) |
| `#radialMenu` | both | `js/58-radial-menu.js:469`; +1 test/bake file | the menu layer on body; data-group=system (470), role=menu (471), aria-label 'Radial menu' (472); hidden toggled 535 / 684; emptied with textContent='' on every open.… |
| `#radialNote` | write | `js/58-radial-menu.js:403` | role=status toast (404) appended to body; shown/hidden via the hidden attribute (408-410); CSS css/22-overlays.css:1613, [hidden] 1627 |
| `#randomColor` | both | `index.html:642`, `js/01-config.js:155`, `js/01a-param-registry.js:183`, `js/04b-presets.js:35`, `js/05g-arm-colors.js:823`, `js/05n-hotkeys-init.js:105`; +2 more; +9 test/bake files | input[type=checkbox] labelled "Random Colors"; label for= target; x2 in static markup (lines 642, 643); css rules: 0 |
| `#recDiscardBtn` | both | `index.html:1585`, `js/03-recording.js:1996` | button[type=button] "Discard"; static markup; css rules: 0 |
| `#recDrawer` | both | `index.html:1599`, `js/28-studio-drawer.js:19` | div; static markup; css rules: 1 |
| `#recipeGuide` | write | `js/44-recipes.js:861` | parked 44: body-mounted pointer + ring layer, un-zoomed, positioned with transforms in screen px; classes show/glide/wide toggled (893-908); styled in… |
| `#recipeHelpBtn` | read | `js/44-recipes.js:1396`; +1 test/bake file | parked 44: the strip's ? button (20's buildHelpChannel, removed with the parking; nothing creates this id today) |
| `#recipeModal` | write | `js/44-recipes.js:1166` | parked 44: the How-do-I dialog; 'delete-modal recipe-modal', role=dialog, aria-modal, aria-labelledby=recipeTitle |
| `#recipePill` | both | `js/44-recipes.js:984`, `js/49-hotkey-binds.js:608` | parked 44: folded-down modal / tour stepper, body-mounted, role=status, data-group=system; closest('#recipePill') keeps the guide up on its own clicks (911); 49 lists it… |
| `#recipeSearch` | both | `js/44-recipes.js:1176` | parked 44: search input (1176, 1191); aria-label 'Search how-to' |
| `#recipeTitle` | write | `js/44-recipes.js:1185` | parked 44: aria-labelledby target; 'recipe-foot-title' |
| `#recKeepBtn` | both | `index.html:1584`, `js/03-recording.js:1995`, `js/44-recipes.js:480` | button[type=button] "Keep"; static markup; css rules: 0 |
| `#recKeepRow` | both | `index.html:1582`, `js/03-recording.js:1118` | div; static markup; css rules: 0 |
| `#recLen15` | both | `index.html:1571`, `js/03-recording.js:1107` | button[type=button] "15 s"; static markup; css rules: 0 |
| `#recLen30` | both | `index.html:1572`, `js/03-recording.js:1107` | button[type=button] "30 s"; static markup; css rules: 0 |
| `#recLen4` | both | `index.html:1569`, `js/03-recording.js:1107` | button[type=button] "4 s"; static markup; css rules: 0 |
| `#recLen8` | both | `index.html:1570`, `js/03-recording.js:1107` | button[type=button] "8 s"; static markup; css rules: 0 |
| `#recMini` | both | `index.html:1560`, `js/03-recording.js:288`, `js/20-mixer-layout.js:3793` | div; static markup; css rules: 0 |
| `#recMiniPauseBtn` | both | `index.html:1563`, `js/03-recording.js:1015` | button[type=button] "Play"; static markup; css rules: 2 |
| `#recMiniRecordBtn` | both | `index.html:1562`, `js/03-recording.js:1014`, `js/44-recipes.js:477` | button[type=button] "Record"; static markup; css rules: 2 |
| `#recMiniStopBtn` | both | `index.html:1564`, `js/03-recording.js:1016`, `js/44-recipes.js:480` | button[type=button] "Stop"; static markup; css rules: 1 |
| `#recMiniTime` | both | `index.html:1567`, `js/03-recording.js:1069` | span "0:00 / 0:08"; static markup; css rules: 0 |
| `#reconnectBtn` | both | `index.html:1409`, `js/06a-mp-core.js:441`, `js/06e-mp-panel.js:592` | button "Reconnect"; static markup; css rules: 0 |
| `#recResizeHandle` | both | `index.html:1600`, `js/28-studio-drawer.js:66` | div; static markup; css rules: 0 |
| `#recSrcAll` | both | `index.html:1579`, `js/03-recording.js:1113` | button[type=button] "Everything"; static markup; css rules: 0 |
| `#recSrcMe` | both | `index.html:1578`, `js/03-recording.js:1113` | button[type=button] "Local Only"; static markup; css rules: 0 |
| `#recStripStatus` | both | `index.html:1588`, `js/03-recording.js:278` | span; static markup; css rules: 0 |
| `#recTakeDiscardBtn` | both | `js/03-recording.js:319` | Discard button in the prompt (btn--destructive); read L323 |
| `#recTakeKeepBtn` | both | `js/03-recording.js:318`, `js/44-recipes.js:480` | Keep button in the prompt (btn--emphasis); read L322 to wire the click |
| `#recTakePrompt` | both | `js/03-recording.js:302` | on-canvas 'Keep what you painted?' card; read L302, L309, L335; created L313-324 inside #canvas-area as .rec-take-prompt with data-group=expressive; open state is inline… |
| `#replaySpeed` | both | `js/20-mixer-layout.js:5099`, `js/60-reset-app.js:176`; +1 test/bake file | Replay Speed range; label[for] 5094; readout #replaySpeedValue |
| `#replaySpeedValue` | both | `js/20-mixer-layout.js:5095` | readout span in the Replay Speed label, class value-display; the one literal instance of the #<id>Value pattern |
| `#replayTimePeriod` | both | `js/05d-input-replay.js:1989`, `js/12-save-load.js:1314`, `js/20-mixer-layout.js:5073` | Stroke and replay > Replay Period number input (inside .brush-time-group); read back by js/05d-input-replay.js:1989 and js/12-save-load.js:1314 |
| `#resetAppAll` | both | `js/60-reset-app.js:272` | 'Reset all' -> reset({layers:true}) (285) |
| `#resetAppBtn` | both | `js/60-reset-app.js:336`; +5 test/bake files | button.btn--ghost.reset-app-btn 'Reset app' on the right of the quality underbar; click -> ask |
| `#resetAppCancel` | both | `js/60-reset-app.js:270`; +1 test/bake file | Cancel: click -> close (276); initial focus of the DialogFocus hold (319) |
| `#resetAppDefaults` | both | `js/60-reset-app.js:267` | the checkbox: change -> sayWhat (277), .checked read on answer (280, 294), reset false on ask (304) |
| `#resetAppDefaultsRow` | both | `js/60-reset-app.js:266` | .hidden = !savedLook() on every ask (303), read by sayWhat (294) |
| `#resetAppHint` | write | `js/60-reset-app.js:366` | the one-time protip above the button: div.reset-app-hint[data-group=system][role=note] > .reset-app-hint-text + .reset-app-hint-actions > button.btn--ghost; positioned… |
| `#resetAppKeep` | both | `js/60-reset-app.js:271` | 'Keep layers' -> reset({layers:false}) (284) |
| `#resetAppModal` | both | `js/60-reset-app.js:253`; +1 test/bake file | the 'Reset Swirl Together?' question: div.delete-modal.reset-app-modal[data-group=system][role=dialog][aria-modal][aria-labelledby=resetAppTitle][aria-describedby=resetAp… |
| `#resetAppMsg` | write | `js/60-reset-app.js:263` | aria-describedby target; holds #resetAppWhat |
| `#resetAppTitle` | write | `js/60-reset-app.js:262` | aria-labelledby target; never queried |
| `#resetAppWhat` | both | `js/60-reset-app.js:263` | first sentence: saved settings vs the app's defaults (sayWhat 292-298) |
| `#ridges` | both | `index.html:829`, `js/01a-param-registry.js:461`, `js/04b-presets.js:36`, `js/05e-effect-controls.js:125`; +2 test/bake files | label for= target; input[type=range] labelled "Ridges 6.0"; x2 in static markup (lines 829, 830); css rules: 0 |
| `#ridgesValue` | both | `index.html:829`, `js/05e-effect-controls.js:129` | span "6.0"; static markup; css rules: 0 |
| `#ring` | both | `js/47-pen-window.js:290`; +2 test/bake files | pen window: the hotspot ring; innerHTML rebuilt by buildRing (1230-1236: .pr-dot svg + .pr-p badge); inline transform / display / visibility (1275, 1313-1315, 1324) |
| `#roomDisplay` | both | `index.html:1446`, `js/06e-mp-panel.js:466`; +1 test/bake file | div; static markup; css rules: 0 |
| `#roomName` | both | `index.html:1455`, `js/06e-mp-panel.js:655`, `js/44-recipes.js:518`; +1 test/bake file | div "------"; static markup; css rules: 0 |
| `#roomQr` | both | `index.html:1456`, `js/06e-mp-panel.js:657`; +1 test/bake file | div; static markup; css rules: 0 |
| `#roomReportBtn` | both | `js/61-room-report.js:167`; +1 test/bake file | mount once (167), created (170) as button.btn--ghost.mp-menu-item.mp-room-report[role=menuitem][data-stay]; textContent flashes 'Copied' / 'Could not copy' |
| `#samCandidateControls` | both | `js/15-layer-masking.js:276` | cutout-proposal chips (mask-roto-candidates); read 1921, 2061; innerHTML rebuilt with <span> + .mask-zoom-btn chips (2065-2085); display none / flex |
| `#samDownloadBar` | both | `js/16-sam-integration.js:306` | style.width = percent %; inline gradient #238636 -> #3fb950 |
| `#samDownloadMessage` | both | `js/16-sam-integration.js:296` | textContent; inline style only |
| `#samDownloadModal` | both | `js/16-sam-integration.js:251` | lazily built Instant Roto model download modal appended to body; look is style.cssText (252-262) plus inline style= in the innerHTML (281-333), no CSS hooks;… |
| `#samDownloadPercent` | both | `js/16-sam-integration.js:314` | textContent; inline style only |
| `#samLoadingIndicator` | both | `js/15-layer-masking.js:277` | busy line (mask-roto-busy) with .sam-spinner; read 1927, 2015; display block / none |
| `#samLoadingStatus` | both | `js/15-layer-masking.js:219`, `js/16-sam-integration.js:368` | status text in the tab strip (class mask-roto-status); read 1772; class is-error toggled (1776, 1786, 1857) |
| `#samModalStyles` | both | `js/16-sam-integration.js:267` | a <style> injected into document.head on first modal show, holding only @keyframes fadeIn / fadeOut; unlayered, so cascade-layer step 1 must list it; js/23's… |
| `#samSegmentBtn` | both | `js/15-layer-masking.js:269`, `js/44-recipes.js:309` | 'Instant Roto It' (mask-action-btn btn--emphasis, disabled attr in template); read 1773, 1915, 2040; .disabled and .title set by script |
| `#saveAsPresetBtn` | both | `index.html:1374`, `js/12-save-load.js:2240` | button "+ Save Current as Preset"; static markup; css rules: 0 |
| `#saveSettingsBtn` | both | `index.html:1341`, `js/12-save-load.js:499`, `js/20-mixer-layout.js:8394` | button "Save settings"; static markup; css rules: 0 |
| `#scatterAmount` | both | `index.html:860`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:152`; +3 test/bake files | label for= target; input[type=range] labelled "Amount 0.50"; x2 in static markup (lines 860, 861); css rules: 0 |
| `#scatterAmountValue` | both | `index.html:860`, `js/05e-effect-controls.js:160` | span "0.50"; static markup; css rules: 0 |
| `#scatterBlockToggle` | both | `index.html:868`, `js/01a-param-registry.js:183`, `js/05e-effect-controls.js:172`; +3 test/bake files | input[type=checkbox] labelled "Colliders Block Light"; label for= target; x2 in static markup (lines 868, 869); css rules: 0 |
| `#scatterPanel` | both | `index.html:858`, `js/05e-effect-controls.js:62` | div "Amount 0.50"; static markup; css rules: 0 |
| `#scatterReach` | both | `index.html:864`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:164`; +3 test/bake files | label for= target; input[type=range] labelled "Reach 1.00"; x2 in static markup (lines 864, 865); css rules: 0 |
| `#scatterReachValue` | both | `index.html:864`, `js/05e-effect-controls.js:168` | span "1.00"; static markup; css rules: 0 |
| `#scatterSource` | both | `index.html:872`, `js/01a-param-registry.js:259`, `js/05e-effect-controls.js:179`; +4 test/bake files | label for= target; select labelled "Source"; x2 in static markup (lines 872, 873); css rules: 0 |
| `#scatterToggle` | both | `index.html:855`, `js/01a-param-registry.js:183`, `js/05e-effect-controls.js:61`, `js/20-mixer-layout.js:4474`, `js/44-recipes.js:348`; +5 test/bake files | input[type=checkbox] labelled "Scatter"; label for= target; x2 in static markup (lines 855, 856); css rules: 0 |
| `#screenBtn` | both | `js/47-pen-window.js:335`; +1 test/bake file | pen window: move to the next screen |
| `#shadeFormResolution` | both | `index.html:705`, `js/01a-param-registry.js:259`, `js/05h-slider-bindings.js:340`, `js/20-mixer-layout.js:2694`, `js/42-perf-tiers.js:238` | label for= target; select labelled "Shading Detail"; x2 in static markup (lines 705, 709); css rules: 0 |
| `#shadeGloss` | both | `index.html:825`, `js/01a-param-registry.js:461`, `js/04b-presets.js:36`, `js/05e-effect-controls.js:384`; +3 test/bake files | label for= target; input[type=range] labelled "Gloss 0.05"; x2 in static markup (lines 825, 826); css rules: 0 |
| `#shadeGlossValue` | both | `index.html:825`, `js/05e-effect-controls.js:385` | span "0.05"; static markup; css rules: 0 |
| `#shadeRelief` | both | `index.html:821`, `js/01a-param-registry.js:461`, `js/04b-presets.js:36`, `js/05e-effect-controls.js:375`; +3 test/bake files | label for= target; input[type=range] labelled "Relief 0.10"; x2 in static markup (lines 821, 822); css rules: 0 |
| `#shadeReliefValue` | both | `index.html:821`, `js/05e-effect-controls.js:376` | span "0.10"; static markup; css rules: 0 |
| `#shadingIntensity` | both | `index.html:817`, `js/01a-param-registry.js:461`, `js/04b-presets.js:36`, `js/05e-effect-controls.js:347`, `js/29-material-modes.js:58`; +4 test/bake files | label for= target; input[type=range] labelled "Intensity 2.0"; x2 in static markup (lines 817, 818); css rules: 0 |
| `#shadingIntensityGroup` | both | `index.html:815`, `js/05e-effect-controls.js:349`, `js/20-mixer-layout.js:4489` | div "Intensity 2.0"; static markup; css rules: 0 |
| `#shadingIntensityValue` | both | `index.html:817`, `js/05e-effect-controls.js:348` | span "2.0"; static markup; css rules: 0 |
| `#shareHint` | both | `index.html:1457`, `js/06e-mp-panel.js:658` | div; static markup; css rules: 0 |
| `#shareLookBtn` | both | `index.html:1407`, `js/06e-mp-panel.js:918`, `js/44-recipes.js:531`, `js/54-phone-pads.js:271`; +1 test/bake file | button[type=button] "Link to current settings"; static markup; css rules: 0 |
| `#shareModeCode` | both | `index.html:1450`, `js/06e-mp-panel.js:660`; +1 test/bake file | button[type=button] "Code"; static markup; css rules: 0 |
| `#shareModeHidden` | both | `index.html:1452`, `js/06e-mp-panel.js:660`; +1 test/bake file | button[type=button] "Hide"; static markup; css rules: 0 |
| `#shareModeQr` | both | `index.html:1451`, `js/06e-mp-panel.js:660`; +1 test/bake file | button[type=button] "QR"; static markup; css rules: 0 |
| `#sharpness` | both | `index.html:833`, `js/01a-param-registry.js:461`, `js/04b-presets.js:36`, `js/05h-slider-bindings.js:535`, `js/29-material-modes.js:66`; +3 test/bake files | label for= target; input[type=range] labelled "Ridge Strength 2.0"; x2 in static markup (lines 833, 834); css rules: 0 |
| `#sharpnessValue` | both | `index.html:833`, `js/05h-slider-bindings.js:549` | span "2.0"; static markup; css rules: 0 |
| `#shootingStarSettings` | both | `index.html:1504`, `js/04d-anim-ascend-star.js:57` | div "Frequency 2.0/s"; static markup; css rules: 0 |
| `#shootingStarToggle` | both | `index.html:1502`, `js/04d-anim-ascend-star.js:53`; +1 test/bake file | input[type=checkbox]; static markup; css rules: 0 |
| `#shootingStarWrap` | write | `index.html:1499` | div "Shooting Star"; static markup; css rules: 0 |
| `#showCanvasHandles` | both | `index.html:1111`, `js/01-config.js:46`, `js/01a-param-registry.js:183`, `js/05n-hotkeys-init.js:112`, `js/17-hotkey-reminder.js:117`, `js/20-mixer-layout.js:4581`; +1 more; +3 test/bake files | input[type=checkbox] labelled "Show Canvas Border & Handles"; label for= target; x2 in static markup (lines 1111, 1112); css rules: 0 |
| `#showPreviewLayersCb` | write | `js/20-mixer-layout.js:3767` | checkbox + label[for="showPreviewLayersCb"] created inside a .checkbox-group |
| `#sidebar-left` | both | `js/08b-jank-monitor.js:204`, `js/12-save-load.js:478`, `js/17-hotkey-reminder.js:48`, `js/20-mixer-layout.js:2383`, `js/43-ui-visibility.js:143`, `js/44-recipes.js:690`; +3 more; +3 test/bake files | in SECTION_SEL ('#sidebar-right .sidebar-section, #sidebar-left .sidebar-section', consumed past L2400); created L2386 bar.id = 'sidebar-left' with aria-label='Brush' |
| `#sidebar-right` | both | `js/00a-boot.js:120`, `js/08b-jank-monitor.js:204`, `js/12-save-load.js:478`, `js/13-compact-mode.js:58`, `js/17-hotkey-reminder.js:48`, `js/20-mixer-layout.js:2383`; +8 more; +11 test/bake files | right sidebar root created here; read at 2573 (scoped query), 3404 and 4362 (scroll hides hover cards), 3440 (closest, tip placement); first half of SECTION_SEL (2383).… |
| `#sidebarPresetList` | write | `js/20-mixer-layout.js:8413` | Saved Presets list (class user-presets-list) rebuilt by renderSidebarPresets (window.renderSidebarPresets); empty state is an inline-styled div 8531 |
| `#sketchVisible` | read | `js/01a-param-registry.js:183`; +1 test/bake file | checkbox id used as the persisted preset/snapshot key; 12-save-load and 25-mutation-engine query it by this id |
| `#skipMenu` | both | `js/00b-dialog-focus.js:197`, `js/66-skip-menu.js:88`; +2 test/bake files | the skip menu, inserted as body's FIRST child (148) so it is the first Tab stop; inline style.top/left set at place() (195-196, under #custom-titlebar when shown). No… |
| `#skipMenuFoot` | both | `js/66-skip-menu.js:122`; +1 test/bake file | footer line; referenced by aria-describedby (94) |
| `#skipMenuTitle` | write | `js/66-skip-menu.js:97` | 'Move focus to' heading; referenced by aria-labelledby (93) |
| `#slowdownBtn` | both | `js/08a-quality-governor.js:495`; +1 test/bake file | the button; className swapped whole between btn--slow-red and btn--slow-yellow (544). CSS css/22-overlays.css:2484 '.slowdown-cell #slowdownBtn' |
| `#slowdownCell` | both | `js/08a-quality-governor.js:487`; +1 test/bake file | 'Slowdown detected, lower quality?' cell: class slowdown-cell (488), data-group=system (491), hidden attribute (492, 542), class 'floating' when the underbar is hidden… |
| `#smartSelectBtn` | both | `js/15-layer-masking.js:213`, `js/44-recipes.js:309` | Instant Roto tab; read 1753; class engaged added / removed (1758, 1871) and .disabled set while the model loads |
| `#smartSelectControls` | both | `js/15-layer-masking.js:260` | Instant Roto panel (mask-roto-panel mask-tool-panel); display toggled 1761, 1872, 2949, 3300 |
| `#splash-progress-bar` | both | `index.html:524` | div; static markup; css rules: 0 \|\| style.width = pct% per chunk (1781) |
| `#splash-screen` | both | `index.html:519`, `js/00a-boot.js:178`, `js/04a-canvas-gl-config.js:96`, `js/20-mixer-layout.js:21`, `js/43-ui-visibility.js:601`, `js/51-open-in-desktop.js:247`; +2 more; +7 test/bake files | div "Swirl Together"; static markup; css rules: 7 \|\| loader adds .ready at 1789 after the 30 chunks load (static at 519) |
| `#splatInDist` | write | `js/20-mixer-layout.js:5187` | Splat In ramp slider; syncRamp (5221) retargets it between Ramp (% of canvas) and Time (s) and rewrites --min/--max/--val; its row's display is toggled inline |
| `#splatInMode` | both | `js/01a-param-registry.js:374`, `js/12-save-load.js:1330`, `js/20-mixer-layout.js:5146`; +2 test/bake files | Splat In select (styled by inline cssText); a room-shared select (js/06b-mp-look.js:60), restored by js/12-save-load.js:1330; tier-2 gate… |
| `#splatOutDist` | write | `js/20-mixer-layout.js:5206` | Splat Out ramp slider, same retargeting as #splatInDist |
| `#splatOutMode` | both | `js/01a-param-registry.js:374`, `js/12-save-load.js:1335`, `js/20-mixer-layout.js:5197`; +1 test/bake file | Splat Out select; room-shared (js/06b-mp-look.js:60), restored by js/12-save-load.js |
| `#ssAngle` | both | `index.html:1511`, `js/04d-anim-ascend-star.js:343`; +1 test/bake file | label for= target; input[type=range] labelled "Angle 120°"; x2 in static markup (lines 1511, 1512); css rules: 0 |
| `#ssAngleVal` | both | `index.html:1511`, `js/04d-anim-ascend-star.js:367` | span "120°"; static markup; css rules: 0 |
| `#ssFrequency` | both | `index.html:1507`, `js/04d-anim-ascend-star.js:341`; +1 test/bake file | label for= target; input[type=range] labelled "Frequency 2.0/s"; x2 in static markup (lines 1507, 1508); css rules: 0 |
| `#ssFreqVal` | both | `index.html:1507`, `js/04d-anim-ascend-star.js:353` | span "2.0/s"; static markup; css rules: 0 |
| `#ssGravity` | both | `index.html:1534`, `js/04d-anim-ascend-star.js:565`; +1 test/bake file | label for= target; input[type=range] labelled "Gravity 0.10"; x2 in static markup (lines 1534, 1535); css rules: 0 |
| `#ssGravityVal` | both | `index.html:1534`, `js/04d-anim-ascend-star.js:573` | span "0.10"; static markup; css rules: 0 |
| `#ssLength` | both | `index.html:1515`, `js/04d-anim-ascend-star.js:345`; +1 test/bake file | label for= target; input[type=range] labelled "Length 0.4s"; x2 in static markup (lines 1515, 1516); css rules: 0 |
| `#ssLengthVal` | both | `index.html:1515`, `js/04d-anim-ascend-star.js:381` | span "0.4s"; static markup; css rules: 0 |
| `#ssOriginCoords` | both | `index.html:1527`, `js/04d-anim-ascend-star.js:421`, `js/12-save-load.js:1381` | div "-30%, 0%"; static markup; css rules: 0 |
| `#ssOriginDot` | both | `index.html:1525`, `js/04d-anim-ascend-star.js:419`, `js/12-save-load.js:777` | div; static markup; css rules: 0 |
| `#ssOriginFrame` | both | `index.html:1524`, `js/04d-anim-ascend-star.js:417`, `js/12-save-load.js:778` | div; static markup; css rules: 0 |
| `#ssOriginPicker` | both | `index.html:1523`, `js/04d-anim-ascend-star.js:511` | div; static markup; css rules: 0 |
| `#ssSize` | both | `index.html:1519`, `js/04d-anim-ascend-star.js:389`; +1 test/bake file | label for= target; input[type=range] labelled "Size 0.5x"; x2 in static markup (lines 1519, 1520); css rules: 0 |
| `#ssSizeVal` | both | `index.html:1519`, `js/04d-anim-ascend-star.js:397` | span "0.5x"; static markup; css rules: 0 |
| `#ssVariance` | both | `index.html:1530`, `js/04d-anim-ascend-star.js:581`; +1 test/bake file | label for= target; input[type=range] labelled "Variance 15%"; x2 in static markup (lines 1530, 1531); css rules: 0 |
| `#ssVarianceVal` | both | `index.html:1530`, `js/04d-anim-ascend-star.js:589` | span "15%"; static markup; css rules: 0 |
| `#stage` | both | `js/47-pen-window.js:317`; +3 test/bake files | PEN WINDOW DOCUMENT (a separate window written by document.write; none of the app's stylesheets apply - its own <style> is lines 275-316). The input stage (fixed… |
| `#stampMenu` | both | `js/15-layer-masking.js:221` | Stamps panel; display toggled 1738, 2948, 3300 |
| `#stampMenuBtn` | both | `js/15-layer-masking.js:216` | Stamps tab; read 1736; class open toggled (1740) |
| `#stat-budget` | write | `index.html:592` | span "--"; static markup; css rules: 0 |
| `#stat-canvassize` | write | `index.html:605` | span "--"; static markup; css rules: 0 |
| `#stat-curl` | write | `index.html:609` | span "--"; static markup; css rules: 0 |
| `#stat-dendiss` | write | `index.html:607` | span "--"; static markup; css rules: 0 |
| `#stat-displayhz` | write | `index.html:593` | span "--"; static markup; css rules: 0 |
| `#stat-dyeres` | write | `index.html:604` | span "--"; static markup; css rules: 0 |
| `#stat-fps` | write | `index.html:589` | span "--"; static markup; css rules: 0 |
| `#stat-frametime` | write | `index.html:590` | span "--"; static markup; css rules: 0 |
| `#stat-governor` | both | `index.html:597`, `js/08a-quality-governor.js:576` | span "--"; static markup; css rules: 0 |
| `#stat-idlevram` | both | `index.html:599`, `js/53-idle-vram.js:189` | span "--"; static markup; css rules: 0 |
| `#stat-jank-dropped` | both | `js/08b-jank-monitor.js:229` | Dropped frames readout |
| `#stat-jank-last` | both | `js/08b-jank-monitor.js:232` | Last interaction readout |
| `#stat-jank-tasks` | both | `js/08b-jank-monitor.js:230` | Long tasks readout |
| `#stat-jank-worst` | both | `js/08b-jank-monitor.js:231` | Worst task readout |
| `#stat-kangle` | write | `index.html:615` | span "--"; static markup; css rules: 0 |
| `#stat-kmode` | write | `index.html:613` | span "--"; static markup; css rules: 0 |
| `#stat-ksegments` | write | `index.html:614` | span "--"; static markup; css rules: 0 |
| `#stat-kzoom` | write | `index.html:616` | span "--"; static markup; css rules: 0 |
| `#stat-multiplier` | write | `index.html:623` | span "--"; static markup; css rules: 0 |
| `#stat-pointerpos` | write | `index.html:620` | span "--"; static markup; css rules: 0 |
| `#stat-pointervel` | write | `index.html:621` | span "--"; static markup; css rules: 0 |
| `#stat-pressure` | write | `index.html:608` | span "--"; static markup; css rules: 0 |
| `#stat-simres` | write | `index.html:603` | span "--"; static markup; css rules: 0 |
| `#stat-splatradius` | write | `index.html:622` | span "--"; static markup; css rules: 0 |
| `#stat-textures` | write | `index.html:627` | span "--"; static markup; css rules: 0 |
| `#stat-updatetime` | write | `index.html:591` | span "--"; static markup; css rules: 0 |
| `#stat-veldiss` | write | `index.html:606` | span "--"; static markup; css rules: 0 |
| `#stat-webgl` | write | `index.html:628` | span "--"; static markup; css rules: 0 |
| `#statsCloseBtn` | both | `index.html:585`, `js/08-stats-panel.js:10` | button "✕"; static markup; css rules: 0 |
| `#statsPanel` | both | `index.html:581`, `js/08-stats-panel.js:9`, `js/08b-jank-monitor.js:205`, `js/12-save-load.js:136`; +1 test/bake file | div "Debug Info"; static markup; css rules: 1 |
| `#statsPinBtn` | read | `js/12-save-load.js:138` | pin button for the stats panel; classList.contains('pinned') 139, classList.toggle('pinned') 334 (x2). DEAD HOOK: no element with this id exists in index.html or any js/… |
| `#statsToggle` | both | `index.html:1115`, `js/01a-param-registry.js:183`, `js/08-stats-panel.js:8`, `js/12-save-load.js:137`, `js/20-mixer-layout.js:4583`; +1 test/bake file | input[type=checkbox] labelled "Debug Info"; label for= target; x2 in static markup (lines 1115, 1116); css rules: 0 |
| `#status` | both | `js/47-pen-window.js:325`; +1 test/bake file | pen window: status text (setStatus 1464) |
| `#stepPalette` | both | `index.html:669`, `js/01-config.js:157`, `js/01a-param-registry.js:183`, `js/04b-presets.js:35`, `js/05g-arm-colors.js:825`, `js/05n-hotkeys-init.js:106`; +2 more; +6 test/bake files | input[type=checkbox] labelled "Palette mode (new colour each stroke)"; label for= target; x2 in static markup (lines 669, 670); css rules: 0 |
| `#strangerBtn` | both | `index.html:1398`, `js/06e-mp-panel.js:943`, `js/44-recipes.js:506`; +1 test/bake file | button "Stranger"; static markup; css rules: 0 |
| `#streamFormatLock` | both | `js/01a-param-registry.js:183`, `js/02-palettes.js:71`, `js/20-mixer-layout.js:8003`; +1 test/bake file | Lock Format checkbox; label for= 8005; handed to focusMode.registerLockCheckbox 8016 |
| `#strokeLockGuide` | write | `js/56-stroke-lock.js:522` | Stroke-lock guide (circle / spoke marks + hand ring), aria-hidden=true (523); inline position:absolute, pointer-events:none, left/top/width/height, viewBox and z-index =… |
| `#strokeLockGuides` | both | `js/20-mixer-layout.js:4717`; +2 test/bake files | Show guides checkbox in .stroke-lock-block; label for= written at 4720 |
| `#studioCloseBtn` | both | `index.html:1605`, `js/28-studio-drawer.js:117` | button "✕"; static markup; css rules: 0 |
| `#symmetryFaceCenter` | both | `index.html:908`, `js/01a-param-registry.js:183`, `js/05g-arm-colors.js:365`; +1 test/bake file | input[type=checkbox] labelled "Stay oriented to the center"; label for= target; x2 in static markup (lines 908, 909); css rules: 0 |
| `#symmetryFaceCenterGroup` | both | `index.html:906`, `js/20-mixer-layout.js:8649` | div "Stay oriented to the center"; static markup; css rules: 0 |
| `#symmetryHold` | both | `index.html:915`, `js/01a-param-registry.js:461`, `js/05h-slider-bindings.js:535`; +1 test/bake file | label for= target; input[type=range] labelled "Hold symmetry 0.00"; x2 in static markup (lines 915, 916); css rules: 0 |
| `#symmetryHoldGroup` | both | `index.html:914`, `js/20-mixer-layout.js:8653` | div "Hold symmetry 0.00"; static markup; css rules: 0 |
| `#symmetryHoldValue` | both | `index.html:915`, `js/05h-slider-bindings.js:549` | span "0.00"; static markup; css rules: 0 |
| `#symmetryMode` | both | `index.html:889`, `js/01a-param-registry.js:259`, `js/04b-presets.js:49`, `js/05g-arm-colors.js:351`, `js/20-mixer-layout.js:8737`; +8 test/bake files | label for= target; select labelled "Symmetry"; x2 in static markup (lines 889, 890); css rules: 0 |
| `#symmetryModeGroup` | both | `index.html:888`, `js/20-mixer-layout.js:8639`, `js/44-recipes.js:145` | div; static markup; css rules: 0 |
| `#symmetrySameAngle` | both | `index.html:903`, `js/01a-param-registry.js:183`, `js/05g-arm-colors.js:358`; +1 test/bake file | input[type=checkbox] labelled "Same angle on every arm"; label for= target; x2 in static markup (lines 903, 904); css rules: 0 |
| `#symmetrySameAngleGroup` | both | `index.html:901`, `js/20-mixer-layout.js:8645`; +1 test/bake file | div "Same angle on every arm"; static markup; css rules: 0 |
| `#text-arrange-bar` | write | `js/23-text-overlays.js:795` | floating arrange toolbar appended to body; dataset.group = 'expressive' 796; innerHTML template 797-800 with .ba-title, .ba-hint and #textArrangeDone; removed on close… |
| `#text-arrange-canvas` | write | `js/23-text-overlays.js:777` | arrange-mode hit / drag surface appended to #canvas-area; inline cssText 783 (absolute, full size, z-index 10010, touch-action none), style.cursor per hit 701; removed… |
| `#text-overlay-container` | both | `js/23-text-overlays.js:195`; +1 test/bake file | created at init 194-209 and appended to #canvas-area; all presentation is inline cssText 203 (absolute, full size, pointer-events none, z-index 1001, overflow hidden);… |
| `#textArrangeDone` | both | `js/23-text-overlays.js:800` | Done button in #text-arrange-bar; written in the template 800, read 802 to bind onclick = closeArrange (x2) |
| `#textOverlayBgColor` | write | `js/20-mixer-layout.js:6796` | background colour <input type=color>, class text-swatch; dimmed via inline opacity/pointer-events while the box is off (syncBgEnabled 6842) |
| `#textOverlayBgOpacity` | write | `js/20-mixer-layout.js:6824` | Background Opacity range |
| `#textOverlayBgOpacityValue` | both | `js/20-mixer-layout.js:6824` | readout of #textOverlayBgOpacity |
| `#textOverlayBgToggle` | write | `js/20-mixer-layout.js:6800` | background box checkbox beside the swatch (14px inline size override) |
| `#textOverlayCase` | write | `js/20-mixer-layout.js:6769` | letter case select |
| `#textOverlayClearAll` | write | `js/20-mixer-layout.js:7031` | Clear All (btn--destructive); carries aria-expanded + aria-controls=textOverlayClearAsk |
| `#textOverlayClearAsk` | write | `js/20-mixer-layout.js:7040` | inline confirm box, role=group, shown/hidden by inline display (7092, 7104) |
| `#textOverlayClearConfirm` | write | `js/20-mixer-layout.js:7055` | 'Yes, clear all' button (btn--destructive) inside #textOverlayClearAsk |
| `#textOverlayCollider` | both | `js/20-mixer-layout.js:6855`, `js/44-recipes.js:620` | 'Fluid collides with this text' checkbox; shows the collider mode/strength box (inline display) |
| `#textOverlayColliderMode` | write | `js/20-mixer-layout.js:6867` | Block/Deflect/Slow select |
| `#textOverlayColliderStrength` | write | `js/20-mixer-layout.js:6871` | Wall Strength range |
| `#textOverlayColliderStrengthValue` | both | `js/20-mixer-layout.js:6871` | readout of #textOverlayColliderStrength |
| `#textOverlayColor` | write | `js/20-mixer-layout.js:6795` | text colour <input type=color>, class text-swatch |
| `#textOverlayContent` | both | `js/20-mixer-layout.js:6617`, `js/44-recipes.js:617` | textarea for the selected line; js/44-recipes.js:627 waits for it to be visible |
| `#textOverlayFluidize` | both | `js/20-mixer-layout.js:6978`, `js/44-recipes.js:625` | Fluidize button; js/44-recipes.js:625,628 tour target |
| `#textOverlayFont` | write | `js/20-mixer-layout.js:6628` | font family select; optgroups built at runtime, plus an 'Installed' optgroup tagged data-installed |
| `#textOverlayHotkeyAction` | write | `js/20-mixer-layout.js:6900` | 'When pressed' select (pour / show-hide); only appended when window.Hotkeys.picker exists (6905) |
| `#textOverlayHotkeyAtBrush` | write | `js/20-mixer-layout.js:6920` | 'Pour at the brush location' checkbox; built only when window.Hotkeys.picker exists |
| `#textOverlayLeading` | write | `js/20-mixer-layout.js:6784` | Line Height range |
| `#textOverlayLeadingValue` | both | `js/20-mixer-layout.js:6784` | readout of #textOverlayLeading |
| `#textOverlayList` | both | `js/20-mixer-layout.js:6501`, `js/44-recipes.js:627`; +1 test/bake file | Text section: list of text lines, rebuilt by innerHTML on every change (6518); js/44-recipes.js:627 tour target; tier-2 scripts/test/mp/mp-text-e2e.js:329 reads it |
| `#textOverlayMakeBrush` | write | `js/20-mixer-layout.js:7007` | Convert to brush button (label flips to 'Brush ready' for 1.6 s) |
| `#textOverlayOpacity` | write | `js/20-mixer-layout.js:6789` | Opacity range |
| `#textOverlayOpacityValue` | both | `js/20-mixer-layout.js:6789` | readout of #textOverlayOpacity |
| `#textOverlayPadding` | write | `js/20-mixer-layout.js:6829` | box padding number input |
| `#textOverlayRadius` | write | `js/20-mixer-layout.js:6831` | box corner radius number input |
| `#textOverlayShadow` | write | `js/20-mixer-layout.js:6852` | Drop shadow checkbox (inside label, no for=) |
| `#textOverlaySize` | write | `js/20-mixer-layout.js:6714` | font size number input |
| `#textOverlayTracking` | write | `js/20-mixer-layout.js:6779` | Letter Spacing range in a .control-group; setValue writes --min/--max/--val (6432-6434) |
| `#textOverlayTrackingValue` | both | `js/20-mixer-layout.js:6779` | readout of #textOverlayTracking |
| `#textOverlayWeight` | write | `js/20-mixer-layout.js:6716` | font weight select |
| `#timeScale` | both | `index.html:919`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:417`, `js/20-mixer-layout.js:1135`; +2 test/bake files | label for= target; input[type=range] labelled "⏱️ Time 1.00x"; x2 in static markup (lines 919, 920); css rules: 0 |
| `#timeScalePerceptual` | both | `js/20-mixer-layout.js:1070`; +2 test/bake files | resolved from the pattern for FADER_CURVES.timeScale; visible proxy range of the Time cell |
| `#timeScaleValue` | both | `index.html:919`, `js/05e-effect-controls.js:418`, `js/20-mixer-layout.js:1173` | span "1.00x"; static markup; css rules: 0 |
| `#touchUpDespeckBtn` | both | `js/15-layer-masking.js:295` | Remove specks; read 438 |
| `#touchUpDrawBtn` | both | `js/15-layer-masking.js:288` | Add; read 417; class active toggled 420 |
| `#touchUpEraseBtn` | both | `js/15-layer-masking.js:287` | Erase (active by default); read 416; class active toggled 421 |
| `#touchUpHint` | write | `js/15-layer-masking.js:297` | hint under the touch-up row (mask-collider-hint); never queried by id |
| `#touchUpRedoBtn` | both | `js/15-layer-masking.js:294` | ↷; read 435, 2646 (.disabled) |
| `#touchUpSize` | both | `js/15-layer-masking.js:290` | touch-up brush size range (data-no-scale); read 425, 3052 (setRangeValue -> --val) |
| `#touchUpSizeVal` | both | `js/15-layer-masking.js:291` | readout; textContent 429, 3054 |
| `#touchUpTools` | both | `js/15-layer-masking.js:285` | step-2 toolbar (mask-collider-tools); display toggled 2952, 2997 |
| `#touchUpUndoBtn` | both | `js/15-layer-masking.js:293` | ↶; read 434, 2645 (.disabled follows the touch-up history) |
| `#transparentMode` | both | `index.html:1031`, `js/01a-param-registry.js:183`, `js/05h-slider-bindings.js:29`, `js/24-video-export.js:67`, `js/47-pen-window.js:1482`; +1 test/bake file | input[type=checkbox] labelled "Transparent Background"; label for= target; x2 in static markup (lines 1031, 1032); css rules: 0 |
| `#transparentRestartBtn` | both | `index.html:1037`, `js/05h-slider-bindings.js:45` | button[type=button] "Restart now"; static markup; css rules: 0 |
| `#transparentRestartRow` | both | `index.html:1035`, `js/05h-slider-bindings.js:44` | div; static markup; css rules: 0 |
| `#uiForkModal` | write | `js/43-ui-visibility.js:488` | startup Simple\|Everything fork dialog, body-mounted; shown via .show |
| `#uiForkTitle` | write | `js/43-ui-visibility.js:498` | aria-labelledby target of #uiForkModal |
| `#uploadBtn` | both | `index.html:1550`, `js/04f-canvas-actions.js:321`, `js/20-mixer-layout.js:3631`, `js/44-recipes.js:277` | button "Upload Image Layer"; static markup; css rules: 0 |
| `#userPresetBulkRow` | both | `index.html:1382`, `js/20-mixer-layout.js:8421` | div; static markup; css rules: 0 |
| `#userPresetCancelBtn` | both | `index.html:1379`, `js/12-save-load.js:2245` | button "Cancel"; static markup; css rules: 0 |
| `#userPresetConfirmBtn` | both | `index.html:1378`, `js/12-save-load.js:2244` | button "Save"; static markup; css rules: 0 |
| `#userPresetNameInput` | both | `index.html:1377`, `js/12-save-load.js:2243` | input[type=text]; static markup; css rules: 0 |
| `#userPresetNameRow` | both | `index.html:1376`, `js/12-save-load.js:2241` | div; static markup; css rules: 0 |
| `#userPresetSaveRow` | both | `index.html:1373`, `js/12-save-load.js:2242` | div "+ Save Current as Preset"; static markup; css rules: 0 |
| `#userPresetsList` | both | `index.html:1372`, `js/12-save-load.js:2150` | div; static markup; css rules: 0 |
| `#userPresetStatus` | both | `index.html:1381`, `js/12-save-load.js:2230`, `js/20-mixer-layout.js:8422` | div; static markup; css rules: 0 |
| `#velocityDissipation` | both | `index.html:735`, `js/01a-param-registry.js:461`, `js/04b-presets.js:101`, `js/05h-slider-bindings.js:408`, `js/20-mixer-layout.js:1135`, `js/29-material-modes.js:118`; +3 test/bake files | label for= target; input[type=range] labelled "Velocity Sustain 1.0009"; x2 in static markup (lines 735, 736); css rules: 0 |
| `#velocityInfluence` | both | `index.html:781`, `js/01a-param-registry.js:461`, `js/05h-slider-bindings.js:359`, `js/20-mixer-layout.js:1135`, `js/34-mandala-mode.js:115`; +7 test/bake files | label for= target; input[type=range] labelled "Motion Isolation 2.000"; x2 in static markup (lines 781, 782); css rules: 0 |
| `#velocityInfluenceValue` | both | `index.html:781`, `js/05h-slider-bindings.js:360`, `js/20-mixer-layout.js:1173`; +1 test/bake file | span "2.000"; static markup; css rules: 0 |
| `#velocityValue` | both | `index.html:735`, `js/05h-slider-bindings.js:409`, `js/20-mixer-layout.js:1173`, `js/29-material-modes.js:119`; +1 test/bake file | span "1.0009"; static markup; css rules: 0 |
| `#vibrance` | both | `index.html:837`, `js/01a-param-registry.js:461`, `js/04b-presets.js:36`, `js/05h-slider-bindings.js:535`, `js/29-material-modes.js:59`; +3 test/bake files | label for= target; input[type=range] labelled "Vibrance 0.50"; x2 in static markup (lines 837, 838); css rules: 0 |
| `#vibranceValue` | both | `index.html:837`, `js/05h-slider-bindings.js:549` | span "0.50"; static markup; css rules: 0 |
| `#viscosity` | both | `index.html:796`, `js/01a-param-registry.js:461`, `js/05h-slider-bindings.js:535`, `js/20-mixer-layout.js:1135`; +4 test/bake files | label for= target; input[type=range] labelled "Viscosity 0.30"; x2 in static markup (lines 796, 797); css rules: 0 |
| `#viscosityValue` | both | `index.html:796`, `js/05h-slider-bindings.js:549`, `js/20-mixer-layout.js:1173` | span "0.30"; static markup; css rules: 0 |
| `#visualResolution` | both | `index.html:673`, `js/01a-param-registry.js:259`, `js/05h-slider-bindings.js:255`, `js/05n-hotkeys-init.js:109`, `js/06b-mp-look.js:284`, `js/08a-quality-governor.js:350`; +3 more; +16 test/bake files | label for= target; select labelled "Image Sharpness"; x2 in static markup (lines 673, 676); css rules: 0 |
| `#visualResolutionCustom` | read | `js/05h-slider-bindings.js:256` | number input, inline style.display (L262, L269) |
| `#wetDrying` | both | `index.html:808`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:116`, `js/20-mixer-layout.js:4168`, `js/34-mandala-mode.js:117`; +2 test/bake files | label for= target; input[type=range] labelled "Dry Time 4.5s"; x2 in static markup (lines 808, 809); css rules: 0 |
| `#wetDryingValue` | both | `index.html:808`, `js/05e-effect-controls.js:120` | span "4.5s"; static markup; css rules: 0 |
| `#wetInfluence` | both | `index.html:804`, `js/01a-param-registry.js:461`, `js/05e-effect-controls.js:107`, `js/20-mixer-layout.js:4167`, `js/34-mandala-mode.js:116`; +3 test/bake files | label for= target; input[type=range] labelled "Drying 0.14"; x2 in static markup (lines 804, 805); css rules: 0 |
| `#wetInfluenceValue` | both | `index.html:804`, `js/05e-effect-controls.js:111` | span "0.14"; static markup; css rules: 0 |
| `#windowMode` | both | `index.html:1073`, `js/17-hotkey-reminder.js:120`, `js/20-mixer-layout.js:4550`, `js/36-display-mode.js:217` | label for= target; select labelled "Window Mode"; x2 in static markup (lines 1073, 1074); css rules: 0 |
| `#zoomBadge` | both | `js/35-zoom-view.js:139`; +1 test/bake file | zoom pill appended to #canvas-area; fully inline-styled (cssText 140-142; per-state padding/font/color/background/border/boxShadow 168-188 with 'Segoe UI' and colour… |
| `#zoomModeFrame` | write | `js/35-zoom-view.js:153` | accent ring round the canvas area in Zoom Mode; inline cssText with box-shadow: inset 0 0 0 3px var(--accent, #ec3013) (154-155); display toggled 163; no CSS |
| `#zoomModeToggle` | both | `index.html:955`, `js/35-zoom-view.js:111` | input[type=checkbox] labelled "Zoom Mode&nbsp; (Z)"; label for= target; x2 in static markup (lines 955, 956); css rules: 0 |

## Classes

1046 selectors.

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `.ace-bar` | write | `js/40b-audio-cue-editor.js:673` | toolbar row; css/21-sidebar.css:1952 |
| `.ace-btn` | write | `js/40b-audio-cue-editor.js:629` | every toolbar and match-box button via mkBtn, as 'ace-btn btn--ghost'; css/21-sidebar.css:1954-1955 |
| `.ace-canvas` | both | `js/40b-audio-cue-editor.js:739`; +1 test/bake file | the cue editor canvas, tabIndex 0, owns keys while focused; its CSS height is written inline per draw when it changes (L132); css/21-sidebar.css:1958-1959 |
| `.ace-hint` | write | `js/40b-audio-cue-editor.js:757` | hint line under the canvas (textContent left empty); css/21-sidebar.css:1960 |
| `.ace-match` | both | `js/40b-audio-cue-editor.js:705`; +1 test/bake file | the pattern-match box (info, mode buttons, Similarity, Make a lane, Cancel); shown/hidden through the hidden property (L597, L706); css/21-sidebar.css:1965-1966 |
| `.ace-match-info` | both | `js/40b-audio-cue-editor.js:708`; +1 test/bake file | match summary text; css/21-sidebar.css:1967 |
| `.ace-sep` | write | `js/40b-audio-cue-editor.js:693` | toolbar separators (L693, L695); css/21-sidebar.css:1956 |
| `.ace-sim` | write | `js/40b-audio-cue-editor.js:715` | Similarity label wrapping the range; css/21-sidebar.css:1968-1970 |
| `.ace-sim-val` | write | `js/40b-audio-cue-editor.js:728` | Similarity readout span; css/21-sidebar.css:1970 |
| `.ace-status` | both | `js/40b-audio-cue-editor.js:700`; +1 test/bake file | toolbar status span (selection count / result line); css/21-sidebar.css:1957 |
| `.ace-status-done` | both | `js/40b-audio-cue-editor.js:256` | on .ace-status after 'Set up this song' succeeds (toggle L642); checked and cleared when a selection exists (L256-257); css/21-sidebar.css:1961 |
| `.ace-title` | write | `js/40b-audio-cue-editor.js:675` | 'Cues' title span; css/21-sidebar.css:1953 |
| `.ace-wrap` | write | `js/40b-audio-cue-editor.js:671` | root of the cue editor, mounted into #audioCueEditorHost (js/20-mixer-layout.js:7673-7677); no stylesheet rule mentions it |
| `.active` | both | `index.html:1603`, `js/01-config.js:599`, `js/03-recording.js:1094`, `js/04b-presets.js:188`, `js/04f-canvas-actions.js:69`, `js/05g-arm-colors.js:1040`; +18 more; +4 test/bake files | preset-selected state on .user-preset-btn, .mixer-user-preset-btn (remove L190) and .mixer-preset-btn / .presets button (toggle L223 = key === activePreset); freeze… |
| `.active-layer` | write | `js/05k-layers-render.js:369`, `js/24-path-layers.js:596` | selected-row state (layer.id === pathActiveId), set only at render; CSS .path-layer-item.active-layer 22-overlays.css:495; the name is shared with the Layers panel's… |
| `.anim-grid` | write | `js/20-mixer-layout.js:3802` | six-slot grid |
| `.anim-lib` | write | `js/20-mixer-layout.js:3917` | Saved Animations library |
| `.anim-lib-act` | write | `js/20-mixer-layout.js:4031` | row action button base |
| `.anim-lib-delete` | write | `js/20-mixer-layout.js:4019` | delete button (confirms via appConfirm) |
| `.anim-lib-empty` | write | `js/20-mixer-layout.js:3944` | 'No saved animations yet' row |
| `.anim-lib-grip` | write | `js/20-mixer-layout.js:3955` | drag grip glyph |
| `.anim-lib-head` | both | `js/20-mixer-layout.js:3919`, `js/44-recipes.js:489` | library toggle button; aria-expanded (3920, 3927) |
| `.anim-lib-list` | write | `js/20-mixer-layout.js:3922` | library rows; inline display none/'' (3923, 3931) |
| `.anim-lib-mode` | write | `js/20-mixer-layout.js:3992` | library-row variant of the colour-mode select |
| `.anim-lib-name` | write | `js/20-mixer-layout.js:3958` | recording name; replaced by .anim-lib-rename-input while renaming |
| `.anim-lib-rename` | write | `js/20-mixer-layout.js:4031` | rename button |
| `.anim-lib-rename-input` | write | `js/20-mixer-layout.js:4051` | inline rename field; aria-label 'New name' |
| `.anim-lib-row` | write | `js/20-mixer-layout.js:3951` | draggable library row; .dragging / .playing |
| `.anim-settings` | write | `index.html:1504` | static markup; on div; css rules: 6 |
| `.anim-settings-inner` | write | `index.html:1505` | static markup; on div; css rules: 2 |
| `.anim-slot` | both | `js/20-mixer-layout.js:3869`, `js/44-recipes.js:482` | one slot; holds a button[data-anim-name][aria-pressed] + .anim-slot-clear, or a hint |
| `.anim-slot-clear` | write | `js/20-mixer-layout.js:3893` | x button clearing a slot |
| `.anim-slot-empty` | write | `js/20-mixer-layout.js:3904` | empty slot ('Drag an animation here') |
| `.anim-slot-missing` | write | `js/20-mixer-layout.js:3885` | slot whose recording no longer exists |
| `.anim-slot-over` | write | `js/20-mixer-layout.js:3850` | drag-over highlight (3850, 3852, 3855). x3 |
| `.anim-switch` | both | `index.html:1502`, `js/04d-anim-ascend-star.js:329` | clicks inside the switch itself are left to the native input; CSS 21-sidebar.css:544-577 |
| `.anim-switch-track` | write | `index.html:1502` | static markup; on span; css rules: 4 |
| `.anim-toggle-label` | write | `index.html:1501` | static markup; on span; css rules: 1 |
| `.anim-toggle-row` | both | `index.html:1500`, `js/04d-anim-ascend-star.js:323` | a click anywhere on the row flips the switch (fallback parentElement.parentElement); CSS 21-sidebar.css:526 |
| `.app-close-modal` | write | `js/04f-canvas-actions.js:650` | variant class for the close prompt; CSS styles.css x4 |
| `.app-close-safe` | write | `js/04f-canvas-actions.js:637` | on #appCloseQuit after a successful save (the go-ahead is now safe); no rule in css/ (write-only) |
| `.app-close-save` | write | `js/04f-canvas-actions.js:659` | 'Save project' button; CSS styles.css x1 |
| `.app-confirm-modal` | both | `js/20-mixer-layout.js:369`, `js/46-strip-more.js:55`; +1 test/bake file | second class on #appConfirmModal |
| `.ar-pat-glyph` | write | `js/20-mixer-layout.js:7867` | glyph span inside each pattern tile |
| `.ar-pat-label` | write | `js/20-mixer-layout.js:7867` | word span inside each pattern tile |
| `.ar-pattern-btn` | write | `js/20-mixer-layout.js:7864` | 7 pattern tiles, 'ar-pattern-btn' + ' active' on center; .active moved by click 7869-7870 and engine sync 7921; carries data-gen |
| `.ar-pattern-grid` | write | `js/20-mixer-layout.js:7854` | Auto-Splat Pattern tile grid |
| `.ar-sub-control` | write | `js/20-mixer-layout.js:7773` | 'control-group ar-sub-control' on the Spin speed (7773) and Change colour every (7797) rows; NO stylesheet mentions it |
| `.arm-colors-header` | write | `js/20-mixer-layout.js:1783` | popup header ('Presets'), shared chrome with the arm-colours popup |
| `.arm-colors-panel` | both | `js/05g-arm-colors.js:1069`, `js/20-mixer-layout.js:1776`, `js/46-strip-more.js:55`, `js/49-hotkey-binds.js:774`; +1 test/bake file | skin shared with the brush drawer and presets popup; the arm panel is 'arm-colors-panel arm-colors-rows' with data-group=core 8617; read elsewhere as… |
| `.arm-colors-rows` | both | `js/05g-arm-colors.js:1069`, `js/20-mixer-layout.js:5833`, `js/44-recipes.js:146`, `js/49-hotkey-binds.js:330` | marks THE arm-colors popup (8615 on the panel, 8747 on the inner rows wrap); read by js/05g:1069, js/20:5833, js/44-recipes.js:146 (tour target),… |
| `.arm-label` | write | `js/20-mixer-layout.js:8862` | arm number span |
| `.arm-mirror-note` | write | `js/20-mixer-layout.js:8679` | mouse-button mirror notice; [hidden] toggled 8680/8715; rows rebuilt via innerHTML='' 8714 |
| `.arm-mirror-off` | write | `js/20-mixer-layout.js:8724` | Turn off button in .arm-mirror-row |
| `.arm-mirror-row` | write | `js/20-mixer-layout.js:8719` | one row per mirroring mouse button (text + Turn off) |
| `.arm-mode-btn` | write | `js/20-mixer-layout.js:9004` | modifier on the arm mode radios; carries data-mode; NO stylesheet mentions it |
| `.arm-mode-wrap` | write | `js/20-mixer-layout.js:8888` | role=radiogroup, aria-label 'Arm N color'; holds four .brush-mode-btn.arm-mode-btn radios |
| `.arm-picker` | write | `js/20-mixer-layout.js:8872` | input[type=color] colour chip with aria-label 'Arm N color'; js/64 ColourPicker adds/removes .cp-open on it, which paintRow checks 8985; inline opacity 0.35 while the… |
| `.arm-push-btn` | write | `js/20-mixer-layout.js:8925` | Pressure switch, role=checkbox; .active + aria-checked toggled in paintRow 8946-8947; inline opacity 0.45 while the whole brush is in Pressure mode 8948 |
| `.arm-row` | write | `js/20-mixer-layout.js:8852` | one row per arm: .arm-label, input.arm-picker, .arm-row-mid (.arm-mode-wrap + .arm-push-btn), .arm-tip-btn, in that DOM order (9060-9064) |
| `.arm-row-mid` | write | `js/20-mixer-layout.js:8866` | middle column holding the mode radiogroup and the Pressure switch |
| `.arm-sym-note` | write | `js/20-mixer-layout.js:8656` | symmetry note div, inline cssText; updateSymNote always sets textContent '' (8693) so it renders empty; NO stylesheet mentions it |
| `.arm-tip-btn` | both | `js/20-mixer-layout.js:8900`, `js/44-recipes.js:151` | per-arm tip square, aria-haspopup=menu; opens openArmTipMenu (defined outside this range); painted by paintArmTipButton (outside this range) |
| `.arm-tip-grid` | write | `js/20-mixer-layout.js:742` | grid of the five built-in tips |
| `.arm-tip-icon` | write | `js/20-mixer-layout.js:730` | glyph/thumbnail span in a tip option; L730, L748; shape tips get background-* inline via setTipIcon (L651-654) |
| `.arm-tip-menu` | write | `js/20-mixer-layout.js:717` | per-arm tip picker menu (role=menu, data-group=core), body-mounted |
| `.arm-tip-note` | write | `js/20-mixer-layout.js:783` | 'None yet' note when the shape library is empty |
| `.arm-tip-opt` | write | `js/20-mixer-layout.js:728` | tip option button; L728 (+ arm-tip-same), L746 (grid); .active marks the current pick |
| `.arm-tip-same` | write | `js/20-mixer-layout.js:728` | 'Same as the brush' option |
| `.arm-tip-shapes` | write | `js/20-mixer-layout.js:767` | the arm-tip menu's own shapes row |
| `.arm-tip-sub` | write | `js/20-mixer-layout.js:762` | 'Your shapes' sub-heading |
| `.armed` | write | `js/20-mixer-layout.js:1392` | .ch-nudge-row and .ch-ignite-lock while the held pointer is over the latch (L1398-1399) |
| `.atv-act` | both | `js/40-audio-timing.js:1864`; +1 test/bake file | action select (what a cue does on the canvas); css/22-overlays.css:1880-1881 |
| `.atv-act-arrow` | write | `js/40-audio-timing.js:1860` | arrow glyph before the action select; css/22-overlays.css:1880 |
| `.atv-auto` | write | `js/40-audio-timing.js:1599` | 'Auto' button: lay lanes on the most active bands; css/22-overlays.css:1863 |
| `.atv-canvas` | both | `js/40-audio-timing.js:856` | the chart canvas; read L859 (cv); click = play/pause, wheel = zoom the lead window; css/22-overlays.css:1798 |
| `.atv-close` | both | `js/40-audio-timing.js:854` | close button in the head; read L887 to wire the click; css/22-overlays.css:1786 |
| `.atv-controls` | write | `js/20-mixer-layout.js:7304` | AudioTiming.mountControls host in the sidebar (7304, inline display:none) and in the drawer (#audioDrawerLanes 7687) |
| `.atv-cue-files` | both | `js/40-audio-timing.js:1695`; +2 test/bake files | Save/Open .swirlcues row (with atv-foot); no stylesheet rule mentions it |
| `.atv-dot` | write | `js/40-audio-timing.js:1809` | lane colour swatch; its background is set inline from laneColor (L1810), data not theme; css/22-overlays.css:1886 |
| `.atv-every` | write | `js/40-audio-timing.js:1873` | 'every N cues' select; hidden by inline display while the action is 'none' (L1881, L1884); css/22-overlays.css:1881 |
| `.atv-fit` | write | `js/40-audio-timing.js:1641` | 'Fit' button: re-fit every lane edge to this track; css/22-overlays.css:1863 |
| `.atv-foot` | write | `js/40-audio-timing.js:1679` | footer row (status text + Re-read) L1679; also the Save/Open cue-files row L1695 as 'atv-foot atv-cue-files'; css/22-overlays.css:1915 |
| `.atv-gate-btns` | write | `js/40-audio-timing.js:1588` | button row under the gate editor (Clear, Auto, Fit); css/22-overlays.css:1861 |
| `.atv-grip` | write | `js/40-audio-timing.js:851` | grip glyph in the head, aria-hidden=true; css/22-overlays.css:1768 |
| `.atv-head` | both | `js/40-audio-timing.js:850` | panel title bar; read L898 as the Draggable handle; css/22-overlays.css:1749 |
| `.atv-lane` | both | `js/40-audio-timing.js:1802`; +1 test/bake file | one lane row (dot, label, method, count, delete, action line), rebuilt on every extraction; css/22-overlays.css:1866, 1874, 1890 |
| `.atv-lane-act` | write | `js/40-audio-timing.js:1858` | action line under the lane (arrow + two selects); css/22-overlays.css:1874 |
| `.atv-lane-count` | write | `js/40-audio-timing.js:1839` | cue-count span (pencil prefix when hand-edited); css/22-overlays.css:1901 |
| `.atv-lane-del` | write | `js/40-audio-timing.js:1846` | remove-lane button; css/22-overlays.css:1906 |
| `.atv-lane-hint` | write | `js/40-audio-timing.js:1793` | 'Draw a box above to add a lane' placeholder when there are no lanes; css/22-overlays.css:1911 |
| `.atv-lane-label` | both | `js/40-audio-timing.js:1814`; +1 test/bake file | lane name + Hz band text; css/22-overlays.css:1890 |
| `.atv-lanes` | write | `js/40-audio-timing.js:1660` | lane-row list container; survives rebuilds and owns the pointerleave glow reset; css/22-overlays.css:1865 |
| `.atv-method` | both | `js/40-audio-timing.js:1821`; +1 test/bake file | method cycle button (Level / Onset / Beat / Pitch / Pattern); css/22-overlays.css:1896 |
| `.atv-panel` | write | `js/40-audio-timing.js:843` | root class of #audioTimingPanel; css/22-overlays.css:1727 |
| `.atv-reread` | write | `js/40-audio-timing.js:1686` | 'Re-read' button L1686; reused on the Save cues (L1698) and Open cues (L1704) buttons; css/22-overlays.css:1925 |
| `.atv-rz` | both | `js/40-audio-timing.js:848` | eight resize handles in the panel template; read L947 to wire pointer resizing (dataset.dir); css/22-overlays.css:1812 |
| `.atv-rz-e` | write | `js/40-audio-timing.js:848` | east resize handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1813 |
| `.atv-rz-n` | write | `js/40-audio-timing.js:848` | north resize handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1813 |
| `.atv-rz-ne` | write | `js/40-audio-timing.js:848` | north-east corner handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1814 |
| `.atv-rz-nw` | write | `js/40-audio-timing.js:848` | north-west corner handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1814 |
| `.atv-rz-s` | write | `js/40-audio-timing.js:848` | south resize handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1813 |
| `.atv-rz-se` | write | `js/40-audio-timing.js:848` | south-east corner handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1814 |
| `.atv-rz-sw` | write | `js/40-audio-timing.js:848` | south-west corner handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1814 |
| `.atv-rz-w` | write | `js/40-audio-timing.js:848` | west resize handle, from the atv-rz-<dir> pattern; css/22-overlays.css:1813 |
| `.atv-status` | both | `js/40-audio-timing.js:853` | head status line; read L860 and pushed into statusHosts, textContent refreshed by refreshStatus (L820-823); css/22-overlays.css:1776, 1916 |
| `.atv-status-text` | write | `js/40-audio-timing.js:1681` | footer status span, pushed into statusHosts; css/22-overlays.css:1916 |
| `.atv-title` | write | `js/40-audio-timing.js:852` | 'Timing' label in the head; css/22-overlays.css:1769 |
| `.audio-choose-track` | write | `js/20-mixer-layout.js:7250` | on #audioChooseTrack |
| `.audio-clock` | write | `js/20-mixer-layout.js:7262` | on #audioClock |
| `.audio-construction-badge` | write | `js/20-mixer-layout.js:7200` | Audio 'under construction' badge; css/21-sidebar.css:101-102 |
| `.audio-construction-note` | write | `js/20-mixer-layout.js:7657` | drawer notice wrapper holding a second Under construction badge |
| `.audio-cue-editor-host` | write | `js/20-mixer-layout.js:7674` | on #audioCueEditorHost |
| `.audio-drawer-enable` | write | `js/20-mixer-layout.js:7666` | on #audioDrawerEnableHost |
| `.audio-drawer-lanes` | write | `js/20-mixer-layout.js:7687` | on #audioDrawerLanes ('atv-controls audio-drawer-lanes') |
| `.audio-filename` | write | `js/20-mixer-layout.js:7268` | on #audioFileName |
| `.audio-gate-clear` | write | `js/30-audio-scenes.js:873` | small 'Clear' button beside a gate meter or editor (makeGateClearBtn, lent out as AudioScenes.gateClearButton and used by js/40-audio-timing.js:1590); inline cssText… |
| `.audio-gate-meter` | write | `js/30-audio-scenes.js:953` | single-gate level meter canvas; css/21-sidebar.css:2062 |
| `.audio-gates-editor` | both | `js/30-audio-scenes.js:965`, `js/40-audio-timing.js:1575`; +1 test/bake file | the spectral gates editor canvas (also created by js/40-audio-timing.js:1575); its cursor is set inline per hover (L708); css/21-sidebar.css:2071 |
| `.audio-gates-row` | write | `js/30-audio-scenes.js:963`, `js/40-audio-timing.js:1570` | Lanes row that hosts the borrowed gate editor; the same class js/30-audio-scenes.js:963 adds; css/21-sidebar.css:2069 |
| `.audio-live-block` | both | `js/20-mixer-layout.js:7698`; +1 test/bake file | <details> 'Live reactions' that holds the viz canvas, sensitivity, beat, mappings and pattern grid in the drawer |
| `.audio-mini` | write | `js/20-mixer-layout.js:7232` | skin shared by #audioSceneBox (7232) and #audioMini (7242) |
| `.audio-mini-enable` | write | `js/20-mixer-layout.js:7246` | label wrapping #audioReactToggle |
| `.audio-mini-full` | write | `js/20-mixer-layout.js:7271` | on #audioOpenFullBtn |
| `.audio-mini-row` | both | `js/20-mixer-layout.js:7245`; +1 test/bake file | rows inside #audioMini (7245 enable row, 7258 and 7265 transport rows); mini.querySelector('.audio-mini-row') 7337 takes the FIRST one as the shared enable row that is… |
| `.audio-mini-src` | write | `js/20-mixer-layout.js:7247` | on #audioReactSource |
| `.audio-play-btn` | write | `js/20-mixer-layout.js:7259` | on #audioPlayBtn, #audioRestartBtn, #audioLoopBtn (7259-7261) and #audioMuteBtn (7266) |
| `.audio-scene-ctl` | both | `js/06-slider-updater.js:85`, `js/30-audio-scenes.js:901` | per-scene control row modifier; css/21-sidebar.css:2045-2053 |
| `.audio-scene-cycle` | write | `js/30-audio-scenes.js:929` | cycle button for enumerated scene options; css/21-sidebar.css:2055-2061 |
| `.audio-seek` | write | `js/20-mixer-layout.js:7264` | on #audioSeek range |
| `.audio-transport` | write | `js/20-mixer-layout.js:7257` | on #audioPlayRow |
| `.audio-vol` | write | `js/20-mixer-layout.js:7267` | on #audioVolume range |
| `.ba-hint` | write | `js/23-text-overlays.js:799` | usage hint in #text-arrange-bar |
| `.ba-title` | write | `js/23-text-overlays.js:798` | 'Arrange text' label in #text-arrange-bar (css/22-overlays.css) |
| `.background-layer` | both | `index.html:566`, `js/04f-canvas-actions.js:356`, `js/05g-arm-colors.js:755`, `js/12-save-load.js:1517`, `js/23-depth-collision.js:757`; +1 test/bake file | class of every #layer<N> div; written on a collision layer's div created here 1517; read as ':scope > .background-layer' (stray duplicates parented to #canvas-wrapper,… |
| `.bg-transparency-group` | write | `index.html:1048` | static markup; on div; css rules: 1 |
| `.boot-cursor` | write | `js/00a-boot.js:365` | on <html> while the boot cursor is up (removed 395); styled ONLY by the injected #boot-cursor-style sheet, no rule in css/ |
| `.boot-error-card` | both | `index.html:152` | global error card: read at 152 (cap at 3 concurrent), created at 163; styled only by inline cssText, no stylesheet rule |
| `.boot-fade` | write | `js/00a-boot.js:453` | on <html> for the whole desktop session (never removed); CSS css/init-responsive.css:169 (11 rules: splash words, titlebar) |
| `.booting` | write | `js/00a-boot.js:453` | on <html> (root) for the desktop boot; removed at the reveal (234). CSS: css/init-responsive.css:186 html.boot-fade.booting ... (6 rules; freezes transitions) |
| `.brush-fold` | both | `js/20-mixer-layout.js:5935`, `js/44-recipes.js:825` | collapsible Tip block; .collapsed toggled on it (5951) and read (5958); css/21-sidebar.css:1755-1770 |
| `.brush-fold-body` | write | `js/20-mixer-layout.js:5943` | fold body (#brushTipFoldBody); hidden by css/21-sidebar.css:1770 under .brush-fold.collapsed |
| `.brush-fold-chev` | write | `js/20-mixer-layout.js:5939` | chevron span, aria-hidden; rotated by css/21-sidebar.css:1755 under .brush-fold.collapsed |
| `.brush-fold-head` | write | `js/20-mixer-layout.js:5938` | the fold's <button> (with btn--ghost); carries aria-expanded + aria-controls; css/21-sidebar.css:1734 |
| `.brush-fold-sum` | both | `js/20-mixer-layout.js:5939` | names the current tip/shape while the fold is closed (syncTipSummary 5966); css/21-sidebar.css:1758,1766 |
| `.brush-ghost-group` | write | `index.html:1067` | static markup; on div; css rules: 0 |
| `.brush-ghost-head` | write | `index.html:1069` | static markup; on label; css rules: 2 |
| `.brush-mode-btn` | both | `js/12-save-load.js:1305`, `js/20-mixer-layout.js:4777`, `js/44-recipes.js:163`; +1 test/bake file | segmented buttons lit by .active: 4866, 4875, 4902, 5045, 5051, 5720, 5723, 5729, 5788, 6095, 6098; js/12-save-load.js:1305 queries '.brush-mode-btn[data-mode]'; x11 |
| `.brush-mode-row` | both | `js/20-mixer-layout.js:4772`, `js/44-recipes.js:832`; +1 test/bake file | segmented button rows: 4863, 4899, 5041 (Replay Mode), 5716 (+brush-radio-row), 5785 (Pressure 2x2), 6093 (On Move/Constant); x6 |
| `.brush-preset-btn` | both | `js/20-mixer-layout.js:5637` | brush preset chip; .active marks the applied preset and is cleared on any manual tweak (markDirty); x3 |
| `.brush-preset-del` | write | `js/20-mixer-layout.js:5641` | the × span inside a preset chip; css/20-mixer-strip.css:1290-1299 |
| `.brush-presets-chips` | write | `js/20-mixer-layout.js:5518` | brush preset chip container; emptied by innerHTML='' on every render (5628) and queried for '.brush-preset-btn' (5652) |
| `.brush-presets-empty` | write | `js/20-mixer-layout.js:5524` | 'None saved yet' span, display toggled inline (syncEmptyNote 5545); css/20-mixer-strip.css:1315 |
| `.brush-presets-save-row` | write | `js/20-mixer-layout.js:5522` | row holding the empty note, the name input and the save button |
| `.brush-radio-row` | write | `js/20-mixer-layout.js:5716` | Paint Into row drawn as a radio track (css/01-buttons.css:246, css/21-sidebar.css:1707); role=radiogroup |
| `.brush-section-label` | write | `js/20-mixer-layout.js:4619`, `js/43-ui-visibility.js:368`, `js/49-hotkey-binds.js:1381`, `js/58-radial-menu.js:869` | sub-heading labels: Mappings 7751, Format 7960, Project 8033, Quick Export 8083, Video Settings 8180, GIF Settings 8221, Output Folder 8264 |
| `.brush-settings-panel` | both | `js/20-mixer-layout.js:5406`, `js/44-recipes.js:180`, `js/49-hotkey-binds.js:329`; +2 test/bake files | Brush panel root; css/21-sidebar.css:1744 scopes the fold head label under it |
| `.brush-shape-add` | both | `js/20-mixer-layout.js:602`, `js/44-recipes.js:133` | + Add brush shape tile |
| `.brush-shape-btn` | both | `js/20-mixer-layout.js:552` | custom-shape tiles in the alternate-brush picker; background-image set inline per tile (the Brush panel's own tiles come from renderShapeTiles, 560, outside this slice) |
| `.brush-shape-menu` | both | `index.html:1445`, `js/01-config.js:239`, `js/20-mixer-layout.js:461`, `js/46-strip-more.js:55`, `js/49-hotkey-binds.js:774` | body-mounted context-menu chrome; reused as 'brush-shape-menu arm-tip-menu' L717 and 'brush-shape-menu preset-menu' L1905; positioned with inline left/top |
| `.brush-shape-menu-head` | write | `js/01-config.js:241`, `js/20-mixer-layout.js:471` | menu heading; L471, L722, L1909 |
| `.brush-shape-menu-item` | both | `js/01-config.js:255`, `js/20-mixer-layout.js:465`; +1 test/bake file | menu item button; L465 (+ 'danger'), L1913 (+ 'btn--destructive') |
| `.brush-shape-paste` | write | `js/20-mixer-layout.js:610` | Clipboard tile (new shape from the clipboard) |
| `.brush-shapes-actions` | write | `js/20-mixer-layout.js:6027` | row filled by buildShapeActions (598, outside this slice) |
| `.brush-shapes-area` | both | `js/20-mixer-layout.js:6022`, `js/32-file-drop.js:57` | wrapper of the shape row + actions + hidden file input; the comment names it as js/32-file-drop.js's drop target (not verified in this slice) |
| `.brush-shapes-row` | write | `js/20-mixer-layout.js:767` | alt-brush shape row (4817, filled by fillAltShapes via innerHTML='' 4936) and the Brush panel shape row (6024, filled by renderShapeTiles); x2 |
| `.brush-time-group` | both | `js/12-save-load.js:1309`, `js/20-mixer-layout.js:5061` | Replay Period wrapper; display toggled inline by setMode (5293) |
| `.brush-time-input-wrap` | write | `js/20-mixer-layout.js:5069` | wraps #replayTimePeriod and its 'sec' suffix |
| `.brush-time-suffix` | write | `js/20-mixer-layout.js:5080` | 'sec' span; css/21-sidebar.css:1819 |
| `.brush-tip-btn` | both | `js/20-mixer-layout.js:570`, `js/44-recipes.js:130` | shared tile plate: L570/L771 shape tiles, L602 add (+), L610 Clipboard; its :hover/.active rules use the background shorthand, so script pins… |
| `.brush-tip-row` | both | `js/20-mixer-layout.js:767`, `js/44-recipes.js:132` | row of tip tiles ('brush-tip-row brush-shapes-row arm-tip-shapes'); also built by buildBrushPanel past L2400 |
| `.brush-trigger` | read | `js/49-hotkey-binds.js:619` | OPENERS |
| `.bt-hint` | both | `js/59-brush-type-key.js:79`; +1 test/bake file | 'when you lift' hint; hidden attribute toggled (85); CSS 1404 |
| `.bt-name` | both | `js/59-brush-type-key.js:73`; +1 test/bake file | one per brush kind; class 'on' toggled on the current one (84). CSS 22-overlays:1408-1409 '#brushTypePill .bt-name.on' |
| `.btn` | both | `js/20-mixer-layout.js:1376`, `js/38-button-audit.js:74`, `js/49-hotkey-binds.js:637` | button-system base plate applied to the ignite lock <div> (only bare .btn write in this range) |
| `.btn--block` | write | `js/43-ui-visibility.js:395`, `js/49-hotkey-binds.js:1387`, `js/58-radial-menu.js:879` | full-width variant on the bind button (1387) and the list trigger (1402) |
| `.btn--destructive` | both | `index.html:1212`, `js/03-recording.js:319`, `js/04f-canvas-actions.js:660`, `js/05e-effect-controls.js:253`, `js/20-mixer-layout.js:376`, `js/24-path-layers.js:878`; +2 more | button-system modifier: template L376; toggled per call L398 (danger !== false; alerts drop it); className L1913 (danger items of the preset menu), L2095… |
| `.btn--emphasis` | write | `index.html:1397`, `js/03-recording.js:318`, `js/15-layer-masking.js:269`, `js/20-mixer-layout.js:6473`, `js/26-layer-transform.js:412`, `js/40b-audio-cue-editor.js:697`; +8 more | on 'Set up this song' (L697) and 'Make a lane' (L733); button-system variant (css/01-buttons.css:168, css/21-sidebar.css:1115) |
| `.btn--ghost` | write | `index.html:661`, `js/01-config.js:587`, `js/05k-layers-render.js:52`, `js/08a-quality-governor.js:500`, `js/20-mixer-layout.js:2088`, `js/40b-audio-cue-editor.js:629`; +9 more | button-system class (css/01-buttons.css) on .cp-copy 215, .cp-drop 226, .cp-pop-close 622, .cp-secondary 826 (x4) |
| `.btn--icon` | write | `index.html:1431`, `js/05k-layers-render.js:52`, `js/20-mixer-layout.js:1376`, `js/44-recipes.js:997`, `js/64-colour-picker.js:226`, `js/65-palette-from-image.js:447` | button-system modifier: ignite lock L1376, .preset-more L1846/L2025, .preset-path-forget L2095 |
| `.btn--lg` | write | `js/26-layer-transform.js:412` | button-system size on #layerTransformDone and #layerTransformCancel (413) |
| `.btn--record` | both | `index.html:1562`, `js/24-video-export.js:1846`, `js/38-button-audit.js:24` | 'Stop and save' state on the capturing Quick Export button (video or gif); css/01-buttons.css:340-348, 386-419 |
| `.btn--slow-red` | both | `js/08a-quality-governor.js:544`; +1 test/bake file | level 2 (rescue); CSS 2 rules |
| `.btn--slow-yellow` | both | `js/08a-quality-governor.js:544`; +1 test/bake file | level 1; CSS 2 rules |
| `.btn--sm` | write | `js/20-mixer-layout.js:2088`, `js/44-recipes.js:1185`, `js/46-strip-more.js:251`, `js/50-look-links.js:1104`, `js/64-colour-picker.js:215` | button-system size class on .cp-copy 215, .cp-primary 823, .cp-secondary 826 (x3) |
| `.btn-sm` | write | `index.html:1568`, `js/01-config.js:578`, `js/44-recipes.js:992` | small-button size class (01-buttons) on .palette-new-btns; css rules: 2 |
| `.button-roles-lock` | both | `js/20-mixer-layout.js:4629`; +1 test/bake file | 'No button set to paint' notice; inline cssText with hard-coded colours (4630-4632); inline display toggled (4636) |
| `.canvas-layer` | read | `js/12-save-load.js:1464` | removed on preset apply as 'dynamically-created canvas-layer divs'. STALE: nothing in js/, css/ or index.html creates this class today (js/23-depth-collision.js:755… |
| `.cap-drag-handle` | both | `js/04g-hover-capture.js:55` | drag bar of #captureArea; js/10 writes style.cursor move + userSelect none on it; CSS #captureArea .cap-drag-handle styles.css:1306 |
| `.cap-e` | write | `js/04g-hover-capture.js:61` | CSS styles.css:1322 |
| `.cap-n` | write | `js/04g-hover-capture.js:57` | edge handle with data-dir=n; CSS styles.css:1320 |
| `.cap-ne` | write | `js/04g-hover-capture.js:65` | corner handle; CSS styles.css:1325 |
| `.cap-nw` | write | `js/04g-hover-capture.js:67` | CSS styles.css:1326 |
| `.cap-rz` | both | `js/04g-hover-capture.js:57` | eight resize handles; style.touchAction / userSelect inline 185-187; pointer capture per handle; CSS #captureArea .cap-rz styles.css:1319-1328 (x9) |
| `.cap-s` | write | `js/04g-hover-capture.js:59` | CSS styles.css:1321 |
| `.cap-se` | write | `js/04g-hover-capture.js:69` | CSS styles.css:1327 |
| `.cap-sw` | write | `js/04g-hover-capture.js:71` | CSS styles.css:1328 |
| `.cap-w` | write | `js/04g-hover-capture.js:63` | CSS styles.css:1323 |
| `.ch-canonical` | write | `js/20-mixer-layout.js:1062` | display:none (inline) wrapper around a curved fader's canonical <input>; hides the printed scale 06 wraps around it |
| `.ch-color-input` | write | `js/20-mixer-layout.js:1505` | #colorPicker: className ASSIGNMENT drops every class the input had in index.html |
| `.ch-fader` | both | `js/20-mixer-layout.js:1187`, `js/46-strip-more.js:239` | fader track wrapper holding the canonical range (or .ch-canonical + .ch-perceptual) |
| `.ch-gate-toggle` | both | `js/20-mixer-layout.js:1324`, `js/44-recipes.js:252` | Limit button; .active = limit OFF (inverted: default unpressed) |
| `.ch-header` | both | `js/17-hotkey-reminder.js:47`, `js/20-mixer-layout.js:1139`, `js/44-recipes.js:832` | fader cell header row (label left, value right) |
| `.ch-ignite-dot` | write | `js/20-mixer-layout.js:1379` | indicator dot inside the latch cell |
| `.ch-ignite-lock` | both | `js/20-mixer-layout.js:1376`; +2 test/bake files | latch cell ('ch-ignite-lock btn btn--icon', role=button, aria-pressed); gets .armed / .latched / .active |
| `.ch-label` | both | `js/08b-jank-monitor.js:197`, `js/20-mixer-layout.js:1142`, `js/43-ui-visibility.js:226`, `js/46-strip-more.js:58`, `js/58-radial-menu.js:255` | fader cell label; the Fluid cell's label contains the #materialMode <select> |
| `.ch-material` | write | `js/20-mixer-layout.js:1152` | Fluid cell whose label is the material picker; kept as a hook per comment L1151 |
| `.ch-nudge-btn` | both | `js/20-mixer-layout.js:1365`; +1 test/bake file | Ignite hold button; gets .active / .locked |
| `.ch-nudge-row` | write | `js/20-mixer-layout.js:1361` | swatch + Ignite + latch row; gets .holding / .armed |
| `.ch-perceptual` | both | `js/20-mixer-layout.js:1071`, `js/49-hotkey-binds.js:655` | visible 0-1 proxy range of the four curved faders (#<id>Perceptual); --val written on it |
| `.ch-seg-switch` | write | `js/20-mixer-layout.js:1223`, `js/43-ui-visibility.js:374` | 'ch-seg-switch ui-vis-presets': the Simple\|Everything two-cell switch (same skin as the Mutate scope switch) |
| `.ch-text-toggle` | both | `js/20-mixer-layout.js:1251`, `js/43-ui-visibility.js:380`, `js/44-recipes.js:215` | text chip: colour-mode chips L1251 (+ .active, aria-pressed), Limit 'ch-text-toggle ch-gate-toggle' L1324, Ignite 'ch-text-toggle ch-nudge-btn' L1365 |
| `.ch-toggle-row` | write | `js/20-mixer-layout.js:1220` | colour cell rows: L1220 (segmented switch + Limit), L1361 ('ch-toggle-row ch-nudge-row') |
| `.ch-value` | both | `js/20-mixer-layout.js:1174`, `js/49-hotkey-binds.js:343` | readout: added to the existing index.html value spans L1174, created for Brush Size L1177; its text is mirrored to aria-valuetext |
| `.ch-wide` | write | `js/20-mixer-layout.js:1205` | the colour cell (two rows wide) |
| `.checkbox-group` | both | `index.html:641`, `js/06e-mp-panel.js:369`, `js/17-hotkey-reminder.js:167`, `js/20-mixer-layout.js:3766`, `js/44-recipes.js:832`; +1 test/bake file | written for Show Preview Layers (3766) and Show guides (4714); read by closest in fxRow (4417) and moveCheckboxGroup (9380: 14 calls in this range). x~17 |
| `.close` | write | `index.html:539` | static markup; on button; css rules: 0 |
| `.close-btn` | write | `index.html:1613` | static markup; on button[type=button]; css rules: 0 |
| `.collapsed` | both | `js/03-recording.js:290`, `js/05k-layers-render.js:291`, `js/12-save-load.js:488`, `js/20-mixer-layout.js:1829`, `js/24-path-layers.js:596`, `js/43-ui-visibility.js:210`; +3 more; +10 test/bake files | section fold state on .sidebar-section; written 9304 (initial), 9264 (sweep add), 9268 (toggle); read contains at 8379, 8622, 9206 (persisted), 9219, 9228, 9263, 9269,… |
| `.collapsible` | write | `index.html:815` | x8 in static markup (lines 815, 845, 858, 933, 979, 1146, …); on div; css rules: 0 |
| `.collider-colour-input` | both | `js/05k-layers-render.js:481` | collider <input type=color>; read 217 and via '.layer-item[data-layer-index="N"] .collider-colour-input' 237 (undo writes its value); no rule in css/ matches it (styled… |
| `.collider-size-label` | write | `js/15-layer-masking.js:191` | Size / View-on-canvas labels (191, 197, 289) |
| `.collider-tool-btn` | write | `js/15-layer-masking.js:188` | second class on the same tool buttons |
| `.collision-btn-wrap` | write | `js/20-mixer-layout.js:3671` | Collider button + its sibling menu |
| `.collision-controls` | write | `js/05k-layers-render.js:447` | collider settings block, carries data-collision-layer |
| `.collision-invert-cb` | both | `js/05k-layers-render.js:457` | depth-collider Invert checkbox (data-cinv); read 546; no rule in css/ matches it |
| `.collision-label` | write | `js/05k-layers-render.js:118` | field row caption label ('collision-label layer-prop-label') |
| `.collision-mode-select` | both | `js/05k-layers-render.js:448` | Block / Deflect / Slow <select>; read 516 |
| `.collision-refresh-btn` | both | `js/05k-layers-render.js:468` | Refresh depth button (data-cref); read 559 |
| `.collision-row` | both | `js/05k-layers-render.js:117`, `js/06-slider-updater.js:85` | every field row: 'collision-row layer-prop <rowCls>' (name predates the shared layout) |
| `.collision-source-menu` | both | `js/20-mixer-layout.js:3676`, `js/44-recipes.js:307` | From Image / From Canvas menu; inline display none/flex (3677, 3694, 3701, 3719); buttons carry data-src |
| `.compact-ui` | both | `js/13-compact-mode.js:89`, `js/20-mixer-layout.js:2379`, `js/46-strip-more.js:144`; +1 test/bake file | <=768 px wide, or <=500 tall and <=1200 wide (48-51); set before js/20 builds (97) and on resize (115); CSS css/21-sidebar.css:775 body.compact-ui ... (30 rules) |
| `.control-group` | both | `index.html:634`, `js/05f-kaleido-controls.js:111`, `js/06-slider-updater.js:86`, `js/06e-mp-panel.js:369`, `js/17-hotkey-reminder.js:48`, `js/20-mixer-layout.js:2965`; +5 more; +3 test/bake files | generic field wrapper created 14 times in this range (7211, 7289, 7717, 7734, 7773, 7797, 7822, 7846, 7940, 7999, 8185, 8201, 8227, 8243); read by closest at 8396, 9368… |
| `.controls` | both | `index.html:633`, `js/20-mixer-layout.js:42` | legacy control panel in index.html, the source of every re-parented node; hidden with inline display:none L90; controls.querySelector(...) L1526, L1796 |
| `.corner` | write | `index.html:557`, `js/05l-layers-transform.js:449` | x4 in static markup (lines 557, 559, 561, 563); on div; css rules: 2 |
| `.corner-lock` | read | `js/05g-arm-colors.js:757`; +1 test/bake file | corner lock buttons get .hide-cursor (css has no rule for .corner-lock itself) |
| `.corner-ne` | write | `index.html:550` | static markup; on div; css rules: 1 |
| `.corner-nw` | write | `index.html:549` | static markup; on div; css rules: 1 |
| `.corner-se` | write | `index.html:551` | static markup; on div; css rules: 1 |
| `.corner-sw` | write | `index.html:552` | static markup; on div; css rules: 1 |
| `.cp` | write | `js/64-colour-picker.js:197` | picker root (one per create()); carries data-variant and data-owns-keys; classList.add/remove('is-dragging') 290 / 300 while a track is dragged; appended into .cp-pop or… |
| `.cp-chip` | both | `js/64-colour-picker.js:434`; +1 test/bake file | a colour chip: recent colours 434 and the brush popover's palette strip 574; inline style.background, role=button, tabIndex 0; is-active toggled 579 on the palette strip… |
| `.cp-copy` | write | `js/64-colour-picker.js:215` | Copy button; textContent 'Copied' then 'Copy' 476-477 |
| `.cp-drop` | both | `js/64-colour-picker.js:226` | eyedropper button (innerHTML = inline SVG 228, aria-label 230); classList active + aria-pressed 496 / 499-500 while sampling; closest('.cp-drop') 1031 lets its own click… |
| `.cp-foot` | write | `js/64-colour-picker.js:822` | inline picker footer (Add to palette / Change it + Done / Cancel) |
| `.cp-gamut` | write | `js/64-colour-picker.js:234` | out-of-gamut note; hidden toggled 236, 423 |
| `.cp-head` | write | `js/64-colour-picker.js:205` | head row: swatch, hex field, Copy, colour-space select, eyedropper |
| `.cp-hex` | both | `js/64-colour-picker.js:210`; +1 test/bake file | hex text field (aria-label 'Hex code' 214); classList is-bad toggled 452 / removed 407, 472 |
| `.cp-lab` | write | `js/64-colour-picker.js:265` | channel letter; textContent / title rewritten per colour space 410-411 |
| `.cp-loupe` | both | `js/64-colour-picker.js:937`; +1 test/bake file | eyedropper loupe on body; aria-hidden 938; hidden toggled 952, 977, 980; inline left/top 1009-1013 |
| `.cp-loupe-grid` | write | `js/64-colour-picker.js:941` | 11x11 pixel grid canvas; inline width/height and style.borderColor = sampled hex 1004 |
| `.cp-loupe-hex` | both | `js/64-colour-picker.js:949`; +1 test/bake file | sampled hex text (textContent 1006) |
| `.cp-loupe-hint` | write | `js/64-colour-picker.js:950` | 'Let go to pick' / 'Click to pick . Esc to stop' |
| `.cp-loupe-new` | write | `js/64-colour-picker.js:948` | sampled colour swatch (inline style.background 1005) |
| `.cp-loupe-old` | write | `js/64-colour-picker.js:945` | current colour swatch (inline style.background 946) |
| `.cp-loupe-pill` | write | `js/64-colour-picker.js:944` | old / new / hex pill under the grid |
| `.cp-num` | write | `js/64-colour-picker.js:271` | numeric text field beside a track (inputMode decimal) |
| `.cp-open` | both | `js/20-mixer-layout.js:8985`, `js/64-colour-picker.js:639` | on the input[type=color] whose popover is open (639; removed 710) |
| `.cp-pal` | both | `js/64-colour-picker.js:546`; +1 test/bake file | palette strip appended to the brush popover (extra: brushPaletteStrip 634) |
| `.cp-pal-head` | write | `js/64-colour-picker.js:547` | palette strip head row |
| `.cp-pal-label` | write | `js/64-colour-picker.js:548` | 'Palette' label |
| `.cp-pal-row` | both | `js/64-colour-picker.js:552`; +1 test/bake file | palette strip chip row; innerHTML rebuilt 572 |
| `.cp-pal-select` | write | `js/64-colour-picker.js:549` | palette <select> (aria-label 'Palette' 550); innerHTML rebuilt 566 from window.curatedPalettes |
| `.cp-pop` | both | `js/64-colour-picker.js:615`; +2 test/bake files | popover wrapper appended to body for any input[type=color]; role=dialog 618, aria-label 619, dataset.group 617; inline style.left/top placed 605-606 and dragged by its… |
| `.cp-pop-bar` | write | `js/64-colour-picker.js:620` | popover title bar; pointerdown drag handle (651) |
| `.cp-pop-close` | both | `js/64-colour-picker.js:622`; +1 test/bake file | popover close button (aria-label 'Close' 625) |
| `.cp-pop-title` | both | `js/64-colour-picker.js:621`; +1 test/bake file | popover title text (titleFor(input) 527-533) |
| `.cp-primary` | both | `js/64-colour-picker.js:823`; +1 test/bake file | inline primary button; .disabled and textContent follow duplicate checks 756-763 |
| `.cp-recent` | write | `js/64-colour-picker.js:239` | recent colours row; innerHTML emptied 427 and refilled with .cp-chip or .cp-recent-empty on every renderRecents |
| `.cp-recent-empty` | write | `js/64-colour-picker.js:430` | placeholder text when there are no recent colours |
| `.cp-recent-head` | write | `js/64-colour-picker.js:238` | 'Recent' heading |
| `.cp-row` | write | `js/64-colour-picker.js:264` | one channel slider row: .cp-lab, .cp-track, .cp-num |
| `.cp-sampling` | both | `js/64-colour-picker.js:893`; +1 test/bake file | on body while the eyedropper is live (893; removed 1065); CSS hides the cursor / swaps it over the canvas |
| `.cp-secondary` | write | `js/64-colour-picker.js:826` | inline Done / Cancel button |
| `.cp-sliders` | write | `js/64-colour-picker.js:232` | holds the three .cp-row channel sliders; a ResizeObserver on it redraws the tracks 451-454 |
| `.cp-space` | write | `js/64-colour-picker.js:218` | colour-space <select> (OKLCH / HSL / RGB; aria-label 'Color space' 219); value persisted as colourPicker.space |
| `.cp-swatch` | write | `js/64-colour-picker.js:206` | before / now swatch pair |
| `.cp-swatch-new` | write | `js/64-colour-picker.js:209` | the 'now' half; inline style.background = hex 405. No stylesheet mentions this class |
| `.cp-swatch-old` | write | `js/64-colour-picker.js:208` | the 'before' half; inline style.background = original 404; click reverts 448. No stylesheet mentions this class (styled via .cp-swatch > span?) |
| `.cp-thumb` | write | `js/64-colour-picker.js:270` | track thumb; inline style.left = % 418 |
| `.cp-title` | both | `js/64-colour-picker.js:203`; +1 test/bake file | optional heading inside .cp ('Add a color' / 'Change this color' for the inline variant) |
| `.cp-toast` | write | `js/64-colour-picker.js:63` | fallback window.showToast element on body (only when the app defined none); role=status 64, hidden toggled 67 / 69 |
| `.cp-track` | write | `js/64-colour-picker.js:266` | custom slider: tabIndex 0, role=slider 268, aria-label / aria-valuemin / aria-valuemax / aria-valuenow / aria-valuetext 412-416; pointer drag + arrow keys |
| `.cp-track-canvas` | write | `js/64-colour-picker.js:269` | the gradient canvas inside a track (drawn by drawTrack, hatched where out of gamut) |
| `.cp-veil` | both | `js/64-colour-picker.js:920`; +1 test/bake file | frozen-frame overlay on body sized to #canvas-area (inline left/top/width/height 922-925) with an unclassed canvas child 921 |
| `.danger` | write | `js/01-config.js:255`, `js/20-mixer-layout.js:478` | Delete item of the brush-shape menu only; the preset menu uses btn--destructive instead (L1913) |
| `.debounce` | write | `js/04g-hover-capture.js:325` | 1 s hover-capture cooldown state on #captureBtn; CSS #captureBtn.debounce styles.css:1301 |
| `.delete-modal` | both | `index.html:1991`, `js/00b-dialog-focus.js:275`, `js/04f-canvas-actions.js:650`, `js/05e-effect-controls.js:240`, `js/20-mixer-layout.js:369`, `js/24-path-layers.js:871`; +8 more; +2 test/bake files | app-wide confirm-modal shell (also the Layers delete modal and js/04f #appCloseModal); CSS .delete-modal styles.css, 22-overlays.css, init-responsive.css (x9);… |
| `.delete-modal-actions` | write | `index.html:1995`, `js/04f-canvas-actions.js:657`, `js/05e-effect-controls.js:251`, `js/20-mixer-layout.js:374`, `js/24-path-layers.js:876`, `js/51-open-in-desktop.js:93`; +3 more | button row (css/22-overlays.css:2397, 2498) |
| `.delete-modal-cancel` | both | `index.html:1996`, `js/01-config.js:1078`, `js/04f-canvas-actions.js:658`, `js/05e-effect-controls.js:252`, `js/20-mixer-layout.js:375`, `js/24-path-layers.js:877`; +1 more | no rule in css/ (write-only; the button is styled as a plain .delete-modal-actions button) |
| `.delete-modal-confirm` | write | `index.html:1997`, `js/04f-canvas-actions.js:660`, `js/05e-effect-controls.js:253`, `js/20-mixer-layout.js:376`, `js/24-path-layers.js:878`, `js/60-reset-app.js:272` | no rule in css/ (write-only); the look comes from btn--destructive |
| `.delete-modal-content` | write | `index.html:1992`, `js/04f-canvas-actions.js:652`, `js/05e-effect-controls.js:247`, `js/20-mixer-layout.js:371`, `js/24-path-layers.js:873`, `js/43-ui-visibility.js:497`; +5 more | 'delete-modal-content ui-fork-content' panel inside the fork dialog |
| `.delete-modal-message` | write | `index.html:1994`, `js/04f-canvas-actions.js:654`, `js/05e-effect-controls.js:249`, `js/20-mixer-layout.js:373`, `js/24-path-layers.js:875`, `js/43-ui-visibility.js:499`; +4 more | dialog message (also id photoSafeOffMsg) |
| `.delete-modal-title` | both | `index.html:1993`, `js/00b-dialog-focus.js:117`, `js/04f-canvas-actions.js:653`, `js/05e-effect-controls.js:248`, `js/20-mixer-layout.js:372`, `js/24-path-layers.js:874`; +5 more | dialog title line (also carries id photoSafeOffTitle) |
| `.demo-clock` | both | `js/52-demo-clock.js:128`, `js/60-reset-app.js:345` | css/22-overlays.css:2423 (+ .floating 2472); js/60 uses it as an insertion anchor |
| `.demo-clock-btn` | write | `js/52-demo-clock.js:134` | the m:ss button (css/22-overlays.css:2580, 2591); textContent + aria-label rewritten each second |
| `.demo-clock-cap` | write | `js/52-demo-clock.js:130` | 'Demo time left' caption (css/22-overlays.css:2570) |
| `.demo-wishlist-modal` | write | `js/52-demo-clock.js:192` | css/22-overlays.css:2431, 2596 |
| `.display-borderless` | write | `js/36-display-mode.js:139` | Window Mode = Borderless Window; CSS css/styles.css:52-55 hides #custom-titlebar + resize handles (4 rules) |
| `.display-fullscreen` | write | `js/36-display-mode.js:140` | Window Mode = Borderless Fullscreen; CSS css/styles.css:53-55 (4 rules) |
| `.dither-draw` | write | `index.html:1202` | static markup; on div; css rules: 0 |
| `.dither-draw-actions` | write | `index.html:1210` | static markup; on div; css rules: 2 |
| `.dither-draw-row` | write | `index.html:1203` | static markup; on div; css rules: 1 |
| `.dither-pad` | write | `index.html:1204` | static markup; on canvas; css rules: 3 |
| `.dither-ramp` | write | `index.html:1207` | static markup; on canvas; css rules: 2 |
| `.done` | write | `js/15-layer-masking.js:2977`, `js/44-recipes.js:1027`; +1 test/bake file | parked 44: on .recipe-pill-step when the step completed |
| `.drag-over` | both | `js/05k-layers-render.js:783` | insertion marker on the hovered .layer-item or .drop-zone; contains 783, querySelectorAll('.drag-over') 786 and '.layer-item.drag-over' 846, add 787, 847, remove 793,… |
| `.dragging` | both | `js/01-config.js:761`, `js/05k-layers-render.js:772`, `js/05l-layers-transform.js:567`, `js/10-draggable.js:96`, `js/20-mixer-layout.js:3964`, `js/65-palette-from-image.js:664`; +1 test/bake file | on the dragged element (any Draggable: #statsPanel via js/08) while the pointer is down (96 / 156 / 244). Generic name: css/ has 10 '.dragging' rules shared with other… |
| `.draw-canvas-area` | both | `js/24-path-layers.js:931`, `js/26-layer-transform.js:406` | holds #layerTransformCanvas; read 435, its rect sizes the canvas; class shared with the draw overlay elsewhere (css x3) |
| `.draw-toolbar` | write | `js/24-path-layers.js:926`, `js/26-layer-transform.js:409` | overlay toolbar at 926 and 1086 (x2); shared with js/26 #layerTransformOverlay and the Layers draw overlay; CSS 22-overlays.css x6 |
| `.drop-after` | both | `js/01-config.js:761` | drop marker after; css rules: 5 |
| `.drop-before` | both | `js/01-config.js:761` | drop marker on the chip/row the drag will land before; css rules: 5 |
| `.drop-zone` | both | `js/05k-layers-render.js:259` | top (259) and bottom (684) drop targets created by createElement; read in querySelectorAll('.layer-item, .drop-zone') 835; class drag-over toggled on them |
| `.edge` | write | `index.html:558`, `js/05l-layers-transform.js:450` | x4 in static markup (lines 558, 560, 562, 564); on div; css rules: 2 |
| `.edge-bottom` | write | `index.html:547` | static markup; on div; css rules: 1 |
| `.edge-left` | write | `index.html:548` | static markup; on div; css rules: 1 |
| `.edge-right` | write | `index.html:546` | static markup; on div; css rules: 1 |
| `.edge-top` | write | `index.html:545` | static markup; on div; css rules: 1 |
| `.editing` | both | `js/01-config.js:383` | on .palette-option or .palette-select-trigger while renameInline has the name field open; click/keydown handlers bail while set; css rules: 3 |
| `.edition-demo` | write | `js/52-demo-clock.js:356` | body marker for the demo edition; no stylesheet rule mentions it today (a free theming hook, and it shows up in js/61's 'format' field) |
| `.electron-mode` | write | `js/00-window-controls.js:16` | platform tag on <body> in the Electron renderer (17-19). NO rule in css/ or index.html mentions it today; only its sibling .web-mode is styled |
| `.encapsulated-slider` | both | `js/05k-layers-render.js:137`, `js/06-slider-updater.js:100` | every fader mounted in a layer row (<input type=range>); events are stopped from bubbling into the row drag |
| `.engaged` | write | `js/15-layer-masking.js:1758` | on #smartSelectBtn while Instant Roto mode is on (1758 add, 1871 remove); no rule in css/ matches it |
| `.eraser` | write | `js/20-mixer-layout.js:5637` | modifier on .brush-preset-btn for presets saved with BRUSH_ERASER on |
| `.export-capturing` | write | `js/24-video-export.js:1851` | canvas 'VIDEO 0:04 / 0:15' badge while capturing (css/styles.css:1056, 1072-1075) |
| `.export-size-readout` | write | `js/62-canvas-readout.js:96` | 'Comes out W x H . ratio' line under Quick Export; CSS css/21-sidebar.css:2300 |
| `.fade-out` | write | `js/20-mixer-layout.js:263` | #splash-screen fade; L263 (desktop), L297 (web); node removed 700-800ms later |
| `.fader-scale` | both | `js/06-slider-updater.js:50` | printed min-mid-max scale div created per range input (buildScale L45-59); re-queried for refresh L115; listed in the INTERACTIVE guard L180 so a press on it is not… |
| `.fader-stack` | both | `js/06-slider-updater.js:71` | wrapper div (scale row + input) built round every range input (L78-109); contains() guard L71 stops double-wrapping after re-parenting |
| `.fader-stack-inline` | write | `js/06-slider-updater.js:95` | inline variant of .fader-stack for one-line rows (scale overlays the row gap) |
| `.feature-body` | write | `index.html:933` | x2 in static markup (lines 933, 979); on div; css rules: 2 |
| `.feature-head` | write | `index.html:925` | x2 in static markup (lines 925, 929); on div; css rules: 11 |
| `.file-drop-hover` | write | `js/32-file-drop.js:69` | drop-hover highlight on the zone under the pointer; styled ONLY by the <style> this file injects at 76-80 (unlayered; outline and background-color both !important); no… |
| `.floating` | both | `js/08a-quality-governor.js:528`, `js/52-demo-clock.js:153`; +1 test/bake file | on the clock or playtest label when the underbar is hidden and it floats bottom-right on body (css/22-overlays.css:2472, 2540); inline right/bottom computed from… |
| `.focus-mode` | both | `js/03-recording.js:291`, `js/21-focus-mode.js:149`, `js/44-recipes.js:774`; +6 test/bake files | Focus mode (F / #focusModeToggle): hides every UI surface by CSS; css/22-overlays.css:8 body.focus-mode ... (23 rules, several !important) |
| `.fx-cluster` | write | `js/20-mixer-layout.js:4463` | Lighting cluster (Light Source, Light Shift, Glow + their panels) |
| `.fx-group` | write | `js/20-mixer-layout.js:4487` | Surface Shading row + #shadingIntensityGroup |
| `.fx-row` | both | `js/20-mixer-layout.js:4419`, `js/44-recipes.js:832`; +1 test/bake file | added to the checkbox's .checkbox-group/.control-group; data-fx set; native title removed (4423) |
| `.fx-thumb` | both | `js/20-mixer-layout.js:4428`; +1 test/bake file | thumbnail span prepended to the row; role=img, aria-label 'Preview <label>', tabIndex 0; <img src=assets/effects/<key>.png> |
| `.fx-tip` | both | `js/20-mixer-layout.js:3400`; +1 test/bake file | body-mounted hover card shell: 'fx-tip mutation-tip' (3400) and the Effects card (4355); positioned in zoomed CSS px (left/top divided by UIScale.get()), so it must keep… |
| `.fx-tip-media` | both | `js/20-mixer-layout.js:4356` | media box in the Effects hover card; .is-empty toggled; filled with a fresh <img src=assets/effects/<key>.gif> (4375-4382). x2 |
| `.fx-tip-text` | both | `js/20-mixer-layout.js:4356`; +1 test/bake file | card body text (4372). x2 |
| `.fx-tip-title` | both | `js/20-mixer-layout.js:4356`; +1 test/bake file | card title (4371). x2 |
| `.gate-state` | write | `js/20-mixer-layout.js:1329` | empty span inside Limit; css/20 draws On/Off into it so the button text stays 'Limit' for 49 |
| `.glide` | write | `js/44-recipes.js:899` | parked 44: on #recipeGuide after first placement so later moves transition |
| `.grid-line` | write | `index.html:1251` | x2 in static markup (lines 1251, 1252); on div; css rules: 0 |
| `.grow` | write | `js/47-pen-window.js:296` | pen window: the status span's flex-grow class |
| `.guide` | write | `js/47-pen-window.js:307` | pen window: the three guide <svg>s over the mirror (display:none until marks exist; style.display toggled 1370) |
| `.has-preset` | write | `js/20-mixer-layout.js:1748` | .mixer-presets-trigger-label when a saved preset name is shown |
| `.hidden` | write | `js/02-palettes.js:355` | on #canvas while a preview is shown (showPreview L355 / hidePreview L359); css has one .hidden rule |
| `.hide-cursor` | both | `js/05g-arm-colors.js:763` | cursor: none while Show Cursor is off (add L765, L794; remove L763, L783; queried L782 by withCursorVisible to lift it during OS save dialogs) |
| `.hk-actions` | both | `js/49-hotkey-binds.js:754`; +1 test/bake file | Cancel / Done / Bind another buttons |
| `.hk-arrow` | write | `js/49-hotkey-binds.js:904` | '->' between picker/key cap and chip (904, 921) |
| `.hk-bind-btn` | write | `js/49-hotkey-binds.js:1387` | 'hk-bind-btn btn--block' + Bind a control |
| `.hk-binding` | write | `js/49-hotkey-binds.js:1073` | on <body> for the whole of bind mode (add 1073, remove 1123) |
| `.hk-block` | both | `js/49-hotkey-binds.js:608`, `js/58-radial-menu.js:868`; +1 test/bake file | the block js/49's Ctrl+Shift+H leaves alone; 49's own block found at 928 and polled at 1066 ('#sidebar-right .hk-block:not(.radial-block)') so this one mounts under it;… |
| `.hk-cap` | both | `js/17-hotkey-reminder.js:148`, `js/20-mixer-layout.js:6550`, `js/44-recipes.js:989`, `js/49-hotkey-binds.js:290`, `js/58-radial-menu.js:1008`, `js/59-brush-type-key.js:68`; +1 more; +4 test/bake files | in-place key cap: className='hk-cap' (148), 'hk-cap hk-cap-empty' (169); row.querySelector('.hk-cap') skips rows that have one (164) |
| `.hk-cap-empty` | write | `js/17-hotkey-reminder.js:169` | reserved empty slot so rows without a binding keep the same right margin |
| `.hk-chip` | write | `js/49-hotkey-binds.js:719` | the chosen-control chip in the bar |
| `.hk-chip-name` | both | `js/49-hotkey-binds.js:721`; +1 test/bake file | control name on the chip |
| `.hk-chip-where` | write | `js/49-hotkey-binds.js:720` | section / 'Top bar' line on the chip |
| `.hk-desc` | write | `js/05n-hotkeys-init.js:31` | description half of a hotkey line, created beside a <kbd> inside .hotkey-body li (css 2 rules) |
| `.hk-empty` | write | `js/49-hotkey-binds.js:1468`, `js/58-radial-menu.js:870` | help text (870, with radial-how) and the empty-list line (1004) |
| `.hk-group` | write | `js/49-hotkey-binds.js:1517` | group heading: Controls / Text lines / <other group> |
| `.hk-keycap` | write | `js/49-hotkey-binds.js:920` | saved key shown in the Done step |
| `.hk-list` | write | `js/49-hotkey-binds.js:1419` | the bindings list; hidden toggled (1420, 1439) |
| `.hk-list-trigger` | write | `js/49-hotkey-binds.js:1402` | 'Your hotkeys' fold trigger, aria-expanded |
| `.hk-list-trigger-chev` | write | `js/49-hotkey-binds.js:1411` | chevron; matches isOpener's '[class*="chev"]' |
| `.hk-list-trigger-count` | write | `js/49-hotkey-binds.js:1409` | count of keyed bindings |
| `.hk-list-trigger-label` | write | `js/49-hotkey-binds.js:1406` | trigger label |
| `.hk-offer` | both | `js/49-hotkey-binds.js:947`; +1 test/bake file | 'Hotkey to <value>' / 'Add <value>' button for colour, dropdown and number controls |
| `.hk-offer-lead` | write | `js/49-hotkey-binds.js:951` | 'Hotkey to' / 'Add' lead-in |
| `.hk-offer-swatch` | write | `js/49-hotkey-binds.js:950` | colour swatch; inline style.background = the picked colour |
| `.hk-offer-val` | write | `js/49-hotkey-binds.js:952` | value text; inline style.color = the colour for colour wells |
| `.hk-outline` | write | `js/49-hotkey-binds.js:1069` | hover outline box (1069) and 'hk-outline is-chosen' (1071), body-mounted, positioned in screen px; is-opener toggled on hover (1325) |
| `.hk-pair` | write | `js/49-hotkey-binds.js:750` | picker + arrow + chip row |
| `.hk-picker` | both | `js/48-hotkeys.js:585`, `js/49-hotkey-binds.js:608` | click-then-press key picker root (used by the Text panel, 49's bind bar and Settings -> Hotkeys rows); 49 lists '.hk-picker' as never bindable |
| `.hk-picker-clear` | write | `js/48-hotkeys.js:593` | 'hk-picker-clear btn--ghost' remove-key button |
| `.hk-picker-key` | both | `js/48-hotkeys.js:590`; +2 test/bake files | the key button; shows 'Set key' / 'Press a key...' / the formatted combo |
| `.hk-picker-note` | both | `js/48-hotkeys.js:601`; +2 test/bake files | message line; added to the caller's noteEl when given (49's bar note / list note) or to a new div |
| `.hk-picker-row` | write | `js/48-hotkeys.js:587` | row holding the key button and the clear x |
| `.hk-row` | write | `js/20-mixer-layout.js:4684`, `js/49-hotkey-binds.js:1524`, `js/58-radial-menu.js:1007` | 'hk-row' (+ ' is-missing' when the control is not on screen) |
| `.hk-row-del` | both | `js/49-hotkey-binds.js:1545`, `js/58-radial-menu.js:1030`; +1 test/bake file | 'hk-row-del btn--ghost' delete x |
| `.hk-row-name` | both | `js/20-mixer-layout.js:4698`, `js/49-hotkey-binds.js:1534`, `js/58-radial-menu.js:1010`; +1 test/bake file | binding name |
| `.hk-row-sub` | both | `js/20-mixer-layout.js:4701`, `js/49-hotkey-binds.js:1538`, `js/58-radial-menu.js:1013`; +1 test/bake file | item sub-line (where / what it does) |
| `.hk-row-text` | write | `js/20-mixer-layout.js:4695`, `js/49-hotkey-binds.js:1532`, `js/58-radial-menu.js:1009` | name + sub text column |
| `.hk-say` | both | `js/49-hotkey-binds.js:749`; +2 test/bake files | the bar's headline line |
| `.hk-step` | write | `js/49-hotkey-binds.js:744` | one step; gets is-now / is-done |
| `.hk-step-label` | both | `js/49-hotkey-binds.js:746`; +1 test/bake file | step label |
| `.hk-step-n` | write | `js/49-hotkey-binds.js:745` | step number / check mark |
| `.hk-step-sep` | write | `js/49-hotkey-binds.js:743` | '>' between steps |
| `.hk-steps` | write | `js/49-hotkey-binds.js:741` | step header row of the bar |
| `.hk-sub` | write | `js/49-hotkey-binds.js:753` | instruction lines |
| `.hk-tag` | write | `js/49-hotkey-binds.js:1070` | hover tag (1070) and 'hk-tag is-chosen' (1072) |
| `.hk-tag-key` | write | `js/49-hotkey-binds.js:713` | fillTag(): key cap span in a hover/chosen tag |
| `.hk-tag-name` | write | `js/49-hotkey-binds.js:715` | control name in a tag |
| `.hk-tag-verb` | write | `js/49-hotkey-binds.js:714` | 'Click' / 'Set it, let go' / 'Opens' verb |
| `.hk-wheel-hint` | write | `js/49-hotkey-binds.js:565` | 'scroll to fine-tune' |
| `.hk-wheel-name` | write | `js/49-hotkey-binds.js:563` | slider name in the wheel pill |
| `.hk-wheel-val` | write | `js/49-hotkey-binds.js:564` | value readout in the wheel pill (a <b>) |
| `.holding` | write | `js/20-mixer-layout.js:1392` | .ch-nudge-row while Ignite is held or latched (add L1411, L1436, L1472) |
| `.horizontal` | write | `index.html:1252` | static markup; on div; css rules: 0 |
| `.hot` | both | `js/65-palette-from-image.js:636`; +1 test/bake file | hover / drag highlight on a .pfi-marker and its .pfi-swatch together (636-637); set from mouseenter / leave and during a drag |
| `.hotkey-body` | both | `index.html:1615`, `js/05n-hotkeys-init.js:24` | each <li> is split on first open into <kbd> + span.hk-desc (chipHotkeyList) |
| `.hotkey-credits` | write | `index.html:1717` | static markup; on span; css rules: 0 |
| `.hotkey-footer` | write | `index.html:1715` | static markup; on div; css rules: 3 |
| `.hotkey-header` | write | `index.html:1611` | static markup; on div; css rules: 2 |
| `.hotkey-modal` | both | `index.html:1610`; +2 test/bake files | static markup; on div; css rules: 1 |
| `.idle` | both | `js/47-pen-window.js:1333`; +1 test/bake file | pen window: #bar auto-hide state (rule 294) |
| `.img-clip-invert` | both | `js/05k-layers-render.js:426` | picture layer Clip Inv checkbox; read 505; no rule in css/ matches it |
| `.img-clip-select` | both | `js/05k-layers-render.js:426` | picture layer Clip <select>; read 496; no rule in css/ matches it |
| `.import-status` | write | `index.html:650` | static markup; on span; css rules: 2 |
| `.is-active` | both | `js/01-config.js:980`, `js/64-colour-picker.js:579`; +1 test/bake file | the chip whose colour the next stroke paints (updatePaletteStepIndicator), paired with aria-current; css rules: 3 |
| `.is-added` | write | `js/01-config.js:731` | 900ms flash on a chip just added (addColorToPalette); css rules: 1 |
| `.is-bad` | write | `js/64-colour-picker.js:452` | on .cp-hex while the typed text is not a valid hex (452; cleared 407, 472) |
| `.is-chosen` | write | `js/49-hotkey-binds.js:1071` | the outline/tag pair pinned to the chosen control |
| `.is-dark` | write | `js/49-hotkey-binds.js:956` | on .hk-offer-val when the colour is dark (light halo) |
| `.is-done` | write | `js/49-hotkey-binds.js:879` | completed .hk-step (879); chosen outline + tag turn green on save (1182-1183, 1202-1203), cleared at 1042-1043, 1094-1095 |
| `.is-dragging` | write | `js/58-radial-menu.js:609`, `js/64-colour-picker.js:290` | on the .cp root while a .cp-track is being dragged (290 add, 300 remove) |
| `.is-editing` | both | `js/64-colour-picker.js:741`; +1 test/bake file | on .palette-chip-wrap: the chip whose colour the inline picker is changing |
| `.is-empty` | write | `js/20-mixer-layout.js:1577`, `js/48-hotkeys.js:633` | missing-asset state on .fx-tip-media (4377, 4380) and .fx-thumb (4436). x3 |
| `.is-error` | write | `js/15-layer-masking.js:1776`, `js/16-sam-integration.js:375` | error state on #samLoadingStatus; CSS .mask-roto-status.is-error mask-editor.css:658 |
| `.is-exclude` | write | `js/15-layer-masking.js:266` | modifier on .mask-roto-dot |
| `.is-forking` | write | `js/20-mixer-layout.js:1976` | .mixer-presets-panel while the question is shown (.is-forking rules in 20-mixer-strip.css hide footer + Copy-link foot) |
| `.is-hidden` | write | `js/54-phone-pads.js:455` | #phonePadQr when Hide mode or no url (css/22-overlays.css:2639) |
| `.is-hot` | both | `js/58-radial-menu.js:581`; +1 test/bake file | the item in the pointer's direction (setHot 578-584): wedge + label; CSS 6 rules |
| `.is-include` | write | `js/15-layer-masking.js:265` | modifier on .mask-roto-dot |
| `.is-listening` | write | `js/48-hotkeys.js:632` | on .hk-picker while it owns the keyboard |
| `.is-live` | write | `js/54-phone-pads.js:493` | #phonePadStatus while a phone is connected (css/22-overlays.css:2667) |
| `.is-match` | both | `js/01-config.js:699`, `js/64-colour-picker.js:740`; +1 test/bake file | on .palette-chip-wrap: the picker's current colour is already in the palette (css/23-colour-picker.css) |
| `.is-missing` | write | `js/20-mixer-layout.js:668`, `js/49-hotkey-binds.js:1524`, `js/58-radial-menu.js:1029` | arm tip square whose pinned shape is not on this machine |
| `.is-now` | write | `js/49-hotkey-binds.js:878` | current .hk-step |
| `.is-off` | both | `js/58-radial-menu.js:551`; +1 test/bake file | disabled slider: on its .radial-wedge and .radial-label; CSS 4 rules |
| `.is-opener` | write | `js/49-hotkey-binds.js:1325` | hover outline + tag over a control that only opens something |
| `.is-pinned` | write | `js/43-ui-visibility.js:437` | row of an item that can never be hidden (Settings) |
| `.is-slider` | write | `js/58-radial-menu.js:507` | on .radial-wedge (507) and .radial-label (517) of slider items; CSS 2 rules |
| `.js` | write | `index.html:2` | static markup; on html; css rules: 39 |
| `.latched` | both | `js/20-mixer-layout.js:1393` | .ch-ignite-lock latched (add L1435, L1452; remove L1393); READ L1499 by the MutationObserver that mirrors it into aria-pressed |
| `.layer-action-row` | both | `js/05k-layers-render.js:336`, `js/44-recipes.js:832` | equal-width button row (336, 428, 432, 436, 461, 483) |
| `.layer-btn` | both | `js/05k-layers-render.js:337`, `js/13-drag-scroll.js:19`, `js/24-path-layers.js:606`, `js/44-recipes.js:272` | Hide/Show, Play/Pause, collapse and Delete buttons (606-609); their text swaps on state, no class or ARIA state; shared with the Layers panel; CSS styles.css,… |
| `.layer-check` | both | `js/05k-layers-render.js:123` | captioned checkbox label (Inv 123, Mask/Collision on-off 386); read by closest('.layer-check') 604 |
| `.layer-check-inline` | write | `js/05k-layers-render.js:123` | the Inv toggle beside a Clip select |
| `.layer-check-label` | write | `js/05k-layers-render.js:389` | 'Mask' / 'Collision' caption span in the group head |
| `.layer-check-text` | write | `js/05k-layers-render.js:123` | 'Inv' caption span |
| `.layer-collapse-caret` | write | `js/05k-layers-render.js:54` | span carrying aria-hidden="true"; CSS draws the open/closed caret from .collapsed |
| `.layer-controls` | write | `js/05k-layers-render.js:60`, `js/24-path-layers.js:605` | button group in the row header; shared with the Layers panel; CSS styles.css, 22-overlays.css, init-responsive.css (x5) |
| `.layer-delete-btn` | both | `js/05k-layers-render.js:52`, `js/44-recipes.js:335` | second class on the header trash button; no rule in css/ matches it (grep), left for scripts/tests |
| `.layer-group` | write | `js/05k-layers-render.js:339` | framed group for what shapes the layer (paint 339, picture 423, collider 445) |
| `.layer-group-head` | write | `js/05k-layers-render.js:340` | group heading row (340, 394) |
| `.layer-group-meta` | write | `js/05k-layers-render.js:396` | 'N shapes' count beside the group head |
| `.layer-group-title` | write | `js/05k-layers-render.js:340` | 'Mask' title when there is no toggle (340, 395) |
| `.layer-head-delete` | both | `js/05k-layers-render.js:52` | header trash button (the only Delete); read 589 to wire click -> window.deleteLayer |
| `.layer-info` | write | `js/05k-layers-render.js:56` | wraps the .layer-title input |
| `.layer-item` | both | `js/05k-layers-render.js:286`, `js/05l-layers-transform.js:824`, `js/23-depth-collision.js:1165`, `js/49-hotkey-binds.js:164`; +2 test/bake files | written as 'layer-item layer-item-collapsible' on every row div; read by querySelector('.layer-item[data-layer-index=...]') 82, 237, closest('.layer-item') 767, 782,… |
| `.layer-item-body` | write | `js/05k-layers-render.js:328` | the collapsible body of a paint (328) or picture/collider (478) row |
| `.layer-item-collapsible` | write | `js/05k-layers-render.js:286` | second class on every row div; CSS collapses the body under .collapsed |
| `.layer-item-header` | both | `js/05k-layers-render.js:53`, `js/44-recipes.js:835` | layerHeaderHTML row header (the drag handle and the collapse control); read by querySelectorAll 23, querySelector 140, 300, 345, 487, 618, closest 641 (x8); its… |
| `.layer-mask-check` | both | `js/05k-layers-render.js:387` | mask / collision enable checkbox (data-layer); read 601 to wire change -> toggleImageLayerMask |
| `.layer-mask-controls` | write | `js/05k-layers-render.js:428` | action row holding the mask buttons (428, 436, 461) |
| `.layer-prop` | write | `js/05k-layers-render.js:110` | shared row class on slider rows (110) and field rows (117): caption \| control \| readout grid |
| `.layer-prop-label` | write | `js/05k-layers-render.js:111` | caption column (span 111, label 118) |
| `.layer-resize-e` | write | `js/05l-layers-transform.js:452` | resize handle for the E edge of a picture layer: "edge layer-resize-e" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-resize-handle` | both | `js/05g-arm-colors.js:758`, `js/05l-layers-transform.js:460` | eight handles appended to the #layer<N> div as 'layer-resize-handle <corner\|edge> layer-resize-<dir>'; read 480 to remove, 547 to let the handle's own pointerdown win |
| `.layer-resize-n` | write | `js/05l-layers-transform.js:450` | resize handle for the N edge of a picture layer: "edge layer-resize-n" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-resize-ne` | write | `js/05l-layers-transform.js:451` | resize handle for the NE corner of a picture layer: "corner layer-resize-ne" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-resize-nw` | write | `js/05l-layers-transform.js:449` | resize handle for the NW corner of a picture layer: "corner layer-resize-nw" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-resize-s` | write | `js/05l-layers-transform.js:454` | resize handle for the S edge of a picture layer: "edge layer-resize-s" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-resize-se` | write | `js/05l-layers-transform.js:453` | resize handle for the SE corner of a picture layer: "corner layer-resize-se" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-resize-sw` | write | `js/05l-layers-transform.js:455` | resize handle for the SW corner of a picture layer: "corner layer-resize-sw" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-resize-w` | write | `js/05l-layers-transform.js:456` | resize handle for the W edge of a picture layer: "edge layer-resize-w" is an object class: key in handles[] (449-456), applied at 460 by div.className =… |
| `.layer-rotate-handle` | both | `js/05l-layers-transform.js:469` | rotate handle (innerHTML '🔄') appended to the #layer<N> div; read 480, 547 |
| `.layer-row-blend` | write | `js/05k-layers-render.js:330` | paint layer Blend field row |
| `.layer-row-clip` | write | `js/05k-layers-render.js:126` | Clip dropdown + Inv row (paint 341, picture 426) |
| `.layer-row-colour` | write | `js/05k-layers-render.js:481` | collider Color field row |
| `.layer-row-cthresh` | both | `js/05k-layers-render.js:456` | depth-collider Threshold slider row; read via mountLayerSlider 533 |
| `.layer-row-invert` | write | `js/05k-layers-render.js:457` | depth-collider Invert field row |
| `.layer-row-key` | both | `js/05k-layers-render.js:401` | Feather / Threshold slider row; read via mountLayerSlider 490 |
| `.layer-row-mode` | write | `js/05k-layers-render.js:448` | collider Mode field row |
| `.layer-row-opacity` | both | `js/05k-layers-render.js:329` | Opacity slider row (329 paint, 479 picture); read via mountLayerSlider 186 |
| `.layer-row-strength` | both | `js/05k-layers-render.js:453`; +1 test/bake file | collider Strength slider row; read via mountLayerSlider 525 |
| `.layer-slider-host` | both | `js/05k-layers-render.js:112`; +1 test/bake file | empty div a fader is mounted into; read 135 as '.' + rowCls + ' .layer-slider-host' |
| `.layer-slider-value` | both | `js/05k-layers-render.js:113` | readout span; read 139 as '.' + rowCls + ' .layer-slider-value', textContent rewritten on input |
| `.layer-threshold` | both | `js/05k-layers-render.js:110`, `js/06-slider-updater.js:85` | every slider row: 'layer-threshold layer-prop <rowCls>' |
| `.layer-thumbnail` | both | `js/05k-layers-render.js:55`, `js/05l-layers-transform.js:976`, `js/23-depth-collision.js:1165` | thumb box; gets an inline style= (background-image or the SIM gradient) from the template; js/05l:976 later rewrites its backgroundImage |
| `.layer-title` | both | `js/05k-layers-render.js:57`, `js/24-path-layers.js:604`, `js/49-hotkey-binds.js:324` | layer name <input type=text>; read by activeElement.classList.contains 25, querySelector 302, 652; script sets draggable="false" on it (654) and carries inline… |
| `.layer-transform-active` | both | `js/26-layer-transform.js:417`, `js/44-recipes.js:299` | on <body> while the transform overlay is open (417 add, 490 remove); CSS hides / dims the rest |
| `.layer-transform-hint` | write | `js/26-layer-transform.js:411` | gesture hint text |
| `.layer-transform-title` | write | `js/26-layer-transform.js:410` | 'Moving layer <b>name</b>' |
| `.layer-vis` | both | `js/05k-layers-render.js:61` | label wrapping a checkbox + .layer-vis-box (header show/hide 61, collision Invert 457); read by closest('.layer-vis') 577 and in the header click filter closest('input,… |
| `.layer-vis-box` | write | `js/05k-layers-render.js:63` | the drawn checkbox square after a hidden input (61, 123, 388, 457); CSS keys on input:checked + .layer-vis-box |
| `.layer-vis-check` | both | `js/05k-layers-render.js:62` | header show/hide checkbox (data-vis); read 572 to wire change -> toggleSimLayer / toggleLayer; no rule in css/ matches it (styled via .layer-vis input + .layer-vis-box) |
| `.layers-dragging` | write | `js/05k-layers-render.js:752` | on #layersPanel while a row is dragged; CSS collapses the other rows (752 add, 760 remove) |
| `.layers-options-group` | write | `js/20-mixer-layout.js:3755` | Capture & Preview options block |
| `.layers-options-title` | write | `js/20-mixer-layout.js:3756` | 'Capture & Preview' title |
| `.layers-panel` | both | `index.html:1593`, `js/13-drag-scroll.js:6` | drag-to-scroll attached to every .layers-panel, now and via MutationObserver (101, 121, 124); inline cursor 'grabbing' / userSelect during a drag (25-26). CSS… |
| `.layers-subsection` | write | `js/20-mixer-layout.js:3730` | Path Layers block |
| `.layers-subsection-header` | write | `js/20-mixer-layout.js:3732` | Path Layers header row |
| `.layers-subsection-title` | write | `js/20-mixer-layout.js:3733` | 'Path Layers' title span |
| `.layers-toolbar` | both | `js/20-mixer-layout.js:3723`, `js/44-recipes.js:832` | added to .section-header-actions when it moves into the body |
| `.layers-toolbar-grid` | write | `js/20-mixer-layout.js:3629` | 2x2 grid: #uploadBtn, #captureBtn, #flattenLayersBtn, .collision-btn-wrap |
| `.light-dot` | write | `index.html:1254` | static markup; on div; css rules: 2 |
| `.light-gradient-overlay` | both | `index.html:1255`, `js/13-light-source.js:202` | inline style.background = radial-gradient(... rgba(255,255,200,.3) ...) follows the dot (204-207). NO rule in css/ mentions this class: it is styled only by this inline… |
| `.light-grid` | write | `index.html:1250` | static markup; on div; css rules: 0 |
| `.light-grid-container` | write | `index.html:1249` | static markup; on div; css rules: 1 |
| `.light-source-controls` | write | `index.html:1241` | static markup; on div; css rules: 2 |
| `.lit` | write | `js/17-hotkey-reminder.js:188` | on .hk-cap while its modifier combo is held >=250ms |
| `.live` | both | `js/06e-mp-panel.js:424`; +1 test/bake file | #mpActivity while a named change is showing (vs the idle sentence); css/21-sidebar.css:1461 .mp-activity.live |
| `.locked` | write | `js/20-mixer-layout.js:1391` | Ignite button while latched on (add L1434, L1451; remove L1391) |
| `.look-link-copy` | both | `js/50-look-links.js:1099` | mount-once guard (1099) and the 'Link to current settings' button's identity class (1104); no stylesheet rule mentions it (btn--sm carries the skin) |
| `.look-link-foot` | write | `js/50-look-links.js:1101` | footer row in .mixer-presets-panel (css/20-mixer-strip.css:1497, css/22-overlays.css:2402) |
| `.lsb-body` | both | `js/20-mixer-layout.js:2411`, `js/43-ui-visibility.js:143` | holds the left sections (pendingLeftSections) |
| `.lsb-edge` | both | `js/20-mixer-layout.js:2403`; +1 test/bake file | zero-width sibling holding the fold button; .collapsed toggled (2472) |
| `.lsb-head` | both | `js/20-mixer-layout.js:2390` | head of #sidebar-left holding the moved Brush Size .mixer-channel (and Stabilization, past L2400) |
| `.lsb-panel` | write | `js/20-mixer-layout.js:5406` | Brush panel root, left-sidebar panel marker (css/21-sidebar.css undoes the popup skin inside the sidebar) |
| `.lsb-rail` | write | `js/20-mixer-layout.js:2434` | folded rail: size readout, Brush label, one button per section |
| `.lsb-rail-label` | both | `js/20-mixer-layout.js:2441`; +1 test/bake file | rail buttons: 'Brush' (2441) and per-section (2451). x2 |
| `.lsb-rail-section` | both | `js/20-mixer-layout.js:2451`; +1 test/bake file | per-section rail button; carries data-group copied from the section |
| `.lsb-rail-size` | write | `js/20-mixer-layout.js:2436` | Brush Size readout mirror (text from #mixer-brushValue) |
| `.lsb-steady` | write | `js/20-mixer-layout.js:2425` | Stabilization + Hide guide wrapper in .lsb-head; data-ui-key=Stabilization |
| `.lsb-toggle` | both | `js/20-mixer-layout.js:2406`; +1 test/bake file | fold button (text « / »); aria-expanded + aria-label written on every set() (2475-2476) |
| `.lt-veil` | both | `js/26-layer-transform.js:405` | the darkening veil with a window cut over #canvas-area (aria-hidden); read 422, positioned by inline px |
| `.mandala-radio` | write | `index.html:948` | static markup; on div; css rules: 3 |
| `.mandala-sub` | write | `index.html:958` | static markup; on div; css rules: 1 |
| `.mask-action-btn` | write | `js/15-layer-masking.js:244` | Pick / Auto (244, 245), Instant Roto It / Clear Points (269, 272), Delete / Clear All (333, 334) |
| `.mask-actions` | both | `js/15-layer-masking.js:332` | Delete / Clear All group; display toggled 2947, 3002 (step 1 only) |
| `.mask-apply-btn` | both | `js/15-layer-masking.js:349`, `js/44-recipes.js:310` | Apply Mask; read 1953 (.disabled + textContent 'Cutting out…'), 2982, 3005 (display), 3309 (textContent 'Done' in collider mode) |
| `.mask-back-btn` | write | `js/15-layer-masking.js:347` | on #maskWizardBack |
| `.mask-cancel-btn` | both | `js/15-layer-masking.js:345` | Cancel; hidden in collider paint mode (3307) |
| `.mask-canvas-bar` | write | `js/15-layer-masking.js:331` | row over the canvas holding .mask-actions and .mask-zoom-controls |
| `.mask-canvas-container` | write | `js/15-layer-masking.js:325` | wraps the editor canvas and its bar |
| `.mask-clear-btn` | write | `js/05k-layers-render.js:430` | Clear Mask button (430, 466); no rule in css/ matches it |
| `.mask-close-btn` | both | `js/15-layer-masking.js:153`; +1 test/bake file | the ✕ (aria-label="Close", inline onclick exitMaskMode(false)) |
| `.mask-collider-hint` | write | `js/15-layer-masking.js:201` | hint line under the collider (201) and touch-up (297, #touchUpHint) rows |
| `.mask-collider-opt` | write | `js/15-layer-masking.js:310` | on #maskColliderOpt |
| `.mask-collider-row` | write | `js/15-layer-masking.js:187` | tool row inside the collider / touch-up toolbars (187, 286) |
| `.mask-collider-tools` | write | `js/15-layer-masking.js:186` | on #colliderTools and #touchUpTools (285) |
| `.mask-control-btn` | both | `js/05k-layers-render.js:429`, `js/44-recipes.js:318` | Edit Mask / Clear Mask / Create Mask / Edit Collider buttons (429, 430, 437, 463, 465-467) |
| `.mask-create-btn` | write | `js/05k-layers-render.js:437` | Create Mask button (437, 467); no rule in css/ matches it |
| `.mask-editor-canvas` | write | `js/15-layer-masking.js:326` | on #maskEditorCanvas |
| `.mask-editor-controls` | write | `js/15-layer-masking.js:171` | controls column above the canvas |
| `.mask-editor-footer` | write | `js/15-layer-masking.js:344` | Cancel / Back / Next / Apply row |
| `.mask-editor-header` | both | `js/15-layer-masking.js:151` | title row; its <h3> is re-written by textContent / innerHTML at 3276, 3735, 3766 (title + shape count) |
| `.mask-editor-overlay` | both | `js/15-layer-masking.js:148`, `js/46-strip-more.js:55` | on #maskEditorOverlay |
| `.mask-editor-panel` | write | `js/15-layer-masking.js:150` | the dialog box inside the overlay |
| `.mask-feather-hint` | write | `js/15-layer-masking.js:307` | on #maskFeatherHint |
| `.mask-feather-label` | write | `js/15-layer-masking.js:303` | 'Soften edge' caption |
| `.mask-feather-row` | both | `js/15-layer-masking.js:302` | Soften edge label row; hidden when the target has no feather consumer (2959) |
| `.mask-feather-step` | write | `js/15-layer-masking.js:301` | on #featherStep |
| `.mask-feather-value` | write | `js/15-layer-masking.js:305` | on #maskFeatherValue |
| `.mask-filter-check` | write | `js/15-layer-masking.js:246` | Invert checkbox label |
| `.mask-filter-cut` | write | `js/15-layer-masking.js:252` | the ringed Cut amount row |
| `.mask-filter-hint` | both | `js/15-layer-masking.js:238`; +1 test/bake file | hint text in the Filter panel |
| `.mask-filter-label` | write | `js/15-layer-masking.js:242` | 'Background' / 'Cut amount' captions (242, 253) |
| `.mask-filter-panel` | write | `js/15-layer-masking.js:237` | on #filterPanel |
| `.mask-filter-row` | write | `js/15-layer-masking.js:241` | Background row (241) and Cut amount label row (252, also mask-filter-cut) |
| `.mask-filter-value` | write | `js/15-layer-masking.js:255` | on #filterThresholdValue |
| `.mask-footer-spacer` | write | `js/15-layer-masking.js:346` | flex spacer |
| `.mask-hint` | write | `js/15-layer-masking.js:322` | on #maskHint |
| `.mask-mode-btn` | write | `js/15-layer-masking.js:188` | tool buttons in the collider and touch-up rows (188, 189, 195, 196, 287, 288, 293-295) |
| `.mask-mode-toggle` | both | `js/15-layer-masking.js:172` | Show / Hide Areas radios; display toggled 2945, 3000, 3300 |
| `.mask-next-btn` | write | `js/15-layer-masking.js:348` | on #maskWizardNext |
| `.mask-rotation-control` | write | `js/15-layer-masking.js:314` | on #maskRotationControl; styled only by its inline style attribute |
| `.mask-roto-actions` | write | `js/15-layer-masking.js:268` | button row in the Instant Roto panel |
| `.mask-roto-busy` | write | `js/15-layer-masking.js:277` | on #samLoadingIndicator |
| `.mask-roto-candidates` | write | `js/15-layer-masking.js:276` | on #samCandidateControls |
| `.mask-roto-dot` | write | `js/15-layer-masking.js:265` | <i> dots, with is-include (265) / is-exclude (266) colour modifiers |
| `.mask-roto-legend` | write | `js/15-layer-masking.js:264` | include / exclude dot legend |
| `.mask-roto-panel` | write | `js/15-layer-masking.js:260` | on #smartSelectControls |
| `.mask-roto-status` | write | `js/15-layer-masking.js:219` | on #samLoadingStatus |
| `.mask-roto-title` | write | `js/15-layer-masking.js:261` | 'Click the objects you want masked:' |
| `.mask-shape-tools` | write | `js/15-layer-masking.js:223` | on #manualShapeTools |
| `.mask-stamp-hint` | write | `js/15-layer-masking.js:222` | hint inside the Stamps panel |
| `.mask-stamp-menu` | write | `js/15-layer-masking.js:221` | on #stampMenu |
| `.mask-tool-btn` | both | `js/15-layer-masking.js:224` | the eight stamp shape buttons (data-shape); read 524 -> addMaskShape |
| `.mask-tool-panel` | write | `js/15-layer-masking.js:221` | shared class on the three tool panels #stampMenu, #filterPanel (237), #smartSelectControls (260) |
| `.mask-tool-tab` | both | `js/15-layer-masking.js:210` | Filter / Instant Roto / Stamps tabs (data-tool); read 2546, class active toggled to match currentMaskTool() |
| `.mask-tool-tabs` | write | `js/15-layer-masking.js:209` | styling class on the tab strip |
| `.mask-tools-row` | both | `js/15-layer-masking.js:209` | the step-1 tab strip (also mask-tool-tabs, role=tablist); display toggled 2946, 3001, 3300; no rule in css/ matches .mask-tools-row (CSS uses .mask-tool-tabs) |
| `.mask-wizard-num` | write | `js/15-layer-masking.js:160` | step number badge |
| `.mask-wizard-rail` | write | `js/15-layer-masking.js:158` | on #maskWizardRail |
| `.mask-wizard-sep` | write | `js/15-layer-masking.js:162` | '›' between steps |
| `.mask-wizard-step` | both | `js/15-layer-masking.js:159`; +1 test/bake file | the three step buttons (data-step 1..3); read 112 (initial focus), 409 (click -> wizardGoTo), 2974 (classes active / done toggled per step) |
| `.mask-zoom-btn` | write | `js/15-layer-masking.js:337` | zoom buttons (337-340) and, by className at 2081, the Instant Roto cutout-option chips (class active toggled 2085) |
| `.mask-zoom-controls` | write | `js/15-layer-masking.js:336` | zoom − / % / + / ⊙ group |
| `.material-mode-select` | write | `index.html:786` | static markup; on select; css rules: 10 |
| `.menu-open` | write | `js/20-mixer-layout.js:681` | arm tip square anchoring an open arm-tip menu (add L795, remove L681) |
| `.mixer-actions` | write | `js/20-mixer-layout.js:1519` | Clear + .transport-row cell (data-ui-key=Transport); state styling via .mixer-actions CSS per comment L1525 |
| `.mixer-channel` | both | `js/06e-mp-panel.js:343`, `js/08b-jank-monitor.js:195`, `js/20-mixer-layout.js:1129`, `js/46-strip-more.js:239`, `js/49-hotkey-binds.js:297`, `js/58-radial-menu.js:254`; +3 test/bake files | every bar cell (faderChannel L1129; colour cell 'mixer-channel ch-wide' L1205); read L2392 sizeInput.closest('.mixer-channel') to move the Brush Size cell whole into… |
| `.mixer-divider` | both | `js/20-mixer-layout.js:9391`, `js/43-ui-visibility.js:130`, `js/46-strip-more.js:236` | divider() helper for the top bar; its callers are earlier in js/20 (outside this range) |
| `.mixer-more` | write | `js/46-strip-more.js:247` | 'mixer-more ui-hidden' on the More cell |
| `.mixer-more-btn` | both | `js/46-strip-more.js:251`; +1 test/bake file | 'mixer-more-btn btn--sm' |
| `.mixer-more-chev` | write | `js/46-strip-more.js:257` | chevron span inside the More button; 49's isOpener matches '[class*="chev"]' |
| `.mixer-more-list` | both | `js/46-strip-more.js:281`; +1 test/bake file | list that parked cells are moved into (live nodes, no clones) |
| `.mixer-more-note` | write | `js/46-strip-more.js:284` | explanatory line under the parked faders |
| `.mixer-more-panel` | write | `js/46-strip-more.js:272` | 'arm-colors-panel mixer-more-panel' |
| `.mixer-more-probe` | both | `js/46-strip-more.js:124`; +1 test/bake file | throwaway clone inserted for one synchronous measure; in and out before paint |
| `.mixer-preset-btn` | both | `js/04b-presets.js:216`, `js/20-mixer-layout.js:1801` | built-in preset buttons (inline onclick=applyPreset kept); read L2245 '.mixer-preset-btn.active'; 04b updatePresetButtons highlights them by data-preset |
| `.mixer-preset-group-sel` | write | `js/20-mixer-layout.js:2130` | #mixerPresetGroupSel |
| `.mixer-preset-name-input` | write | `js/20-mixer-layout.js:1868` | the strip's preset-name class reused on the brush preset name field; display toggled inline |
| `.mixer-preset-new-group` | write | `js/20-mixer-layout.js:2151` | '+ Group' footer button |
| `.mixer-preset-save` | both | `js/20-mixer-layout.js:2145`, `js/44-recipes.js:415` | '+ New Preset' / 'Save' / 'Create' button L2145; '+ Group' L2151 ('mixer-preset-save mixer-preset-new-group') |
| `.mixer-preset-save-form` | write | `js/20-mixer-layout.js:2117` | name + group save form; shown/hidden by inline display |
| `.mixer-presets-channel` | write | `js/20-mixer-layout.js:1735` | Presets cell (data-ui-key=Presets) in .mixer-stack-top |
| `.mixer-presets-footer` | write | `js/20-mixer-layout.js:2113` | sticky footer (non-scrolling sibling of the list) |
| `.mixer-presets-list` | both | `js/20-mixer-layout.js:1788`, `js/44-recipes.js:414` | scrolling list between header and sticky footer; emptied and rebuilt on every open |
| `.mixer-presets-panel` | both | `js/20-mixer-layout.js:1776`, `js/44-recipes.js:741`, `js/49-hotkey-binds.js:328`, `js/50-look-links.js:1098`; +5 test/bake files | Presets popup; read L2283 (Escape inside its inputs is theirs); open state is INLINE display flex/none, plus .is-forking; data-group=core |
| `.mixer-presets-trigger` | write | `js/20-mixer-layout.js:1741` | #mixerPresetsTrigger; .active while open |
| `.mixer-presets-trigger-chev` | write | `js/20-mixer-layout.js:1742` | the trigger's chevron glyph |
| `.mixer-presets-trigger-label` | both | `js/20-mixer-layout.js:1742` | trigger text ('Presets' or the current preset name); read L1745; .has-preset toggled L1748 |
| `.mixer-stack` | both | `js/20-mixer-layout.js:870`, `js/43-ui-visibility.js:133` | right-hand stack of the bar (Presets over Clear/Pause/Stop); read L2219 to position the Presets panel under the whole stack; 43 looks inside it for data-ui-key cells |
| `.mixer-stack-top` | write | `js/20-mixer-layout.js:872` | top row of .mixer-stack holding .mixer-presets-channel |
| `.mixer-user-preset-btn` | both | `js/04b-presets.js:188`, `js/12-save-load.js:2184`, `js/20-mixer-layout.js:1754`, `js/50-look-links.js:984` | user preset row button in the popup; read L1754 ('.mixer-user-preset-btn, .user-preset-btn', markUserPresetRows) and L2245 (initial focus); written L2008; also read by… |
| `.mixer-user-preset-row` | write | `js/20-mixer-layout.js:2005` | user preset row (button + ... menu) |
| `.mp-activity` | write | `index.html:1423` | static markup; on div; css rules: 2 |
| `.mp-activity-who` | both | `js/06e-mp-panel.js:430`; +1 test/bake file | the peer's name inside #mpActivity (css/21-sidebar.css:1464); created by renderActivity (430), re-coloured by repaintPeer (159-160) through inline style.color, not a… |
| `.mp-btn-leave` | write | `index.html:1435` | static markup; on button; css rules: 1 |
| `.mp-btn-phone` | write | `js/54-phone-pads.js:290` | css/21-sidebar.css:1204, 1214 |
| `.mp-btn-phone-door` | write | `js/54-phone-pads.js:272` | the plain full-width door under Join (css/21-sidebar.css:1204, 1214) |
| `.mp-btn-primary` | write | `index.html:1397` | x2 in static markup (lines 1397, 1398); on button; css rules: 2 |
| `.mp-btn-share` | write | `index.html:1465`, `js/54-phone-pads.js:290` | shares the invite buttons' skin (css/21-sidebar.css:1215, 1218; index.html:1465-1471 use it too) |
| `.mp-btn-share-code` | write | `index.html:1466` | static markup; on button; css rules: 1 |
| `.mp-btn-share-look` | write | `index.html:1407` | x2 in static markup (lines 1407, 1471); on button[type=button]; css rules: 3 |
| `.mp-code-hidden` | write | `js/06e-mp-panel.js:676` | #roomName in Hide mode ('●●●●●●'); css/21-sidebar.css:1389 |
| `.mp-door-row` | write | `index.html:1396` | static markup; on div; css rules: 2 |
| `.mp-dot` | both | `index.html:1417`, `js/06e-mp-panel.js:320`; +1 test/bake file | #connectionDot base class (css/21-sidebar.css:1254); rewritten on every renderRoomStatus |
| `.mp-dot-alone` | write | `js/06e-mp-panel.js:320` | amber steady: in a room with nobody else (css/21-sidebar.css:1271) |
| `.mp-dot-connected` | write | `js/06e-mp-panel.js:320` | green: someone else is here (css/21-sidebar.css:1260) |
| `.mp-dot-connecting` | write | `index.html:1417`, `js/06e-mp-panel.js:320` | amber pulse: no room yet / reconnecting (css/21-sidebar.css:1264); also the markup default (index.html:1417) |
| `.mp-error` | write | `index.html:1408` | static markup; on div; css rules: 2 |
| `.mp-foot` | write | `index.html:1434` | static markup; on div; css rules: 1 |
| `.mp-invite` | write | `index.html:1446` | static markup; on div; css rules: 1 |
| `.mp-invite-head` | write | `index.html:1447` | static markup; on div; css rules: 1 |
| `.mp-join-row` | write | `index.html:1400` | static markup; on div; css rules: 6 |
| `.mp-menu-item` | write | `index.html:1478`, `js/61-room-report.js:171` | ⋯ menu row skin (css/21-sidebar.css:1312, 1321), same class as the markup items (index.html:1478) |
| `.mp-notice` | write | `js/06e-mp-panel.js:603` | #mpError in neutral colour for a non-failure outcome (a stranger leaving); css/21-sidebar.css:1239 |
| `.mp-owner-dot` | both | `js/06e-mp-panel.js:162`, `js/20-mixer-layout.js:6584` | owner dot on a room text line (inline size/colour); js/06e-mp-panel.js:153-164 queries the class and repaints by data-peer |
| `.mp-peer-touch` | both | `js/06e-mp-panel.js:377`; +1 test/bake file | the peer glow on the control face (.mixer-channel \| .control-group \| .checkbox-group \| the element) while a room change glides, removed 1.4 s after the last update… |
| `.mp-pop` | write | `index.html:1445` | x2 in static markup (lines 1445, 1477); on div; css rules: 3 |
| `.mp-qr` | write | `index.html:1456` | static markup; on div; css rules: 2 |
| `.mp-room-bar` | write | `index.html:1429` | static markup; on div; css rules: 3 |
| `.mp-room-code` | write | `index.html:1455` | static markup; on div; css rules: 2 |
| `.mp-room-invite` | write | `index.html:1430` | static markup; on button[type=button]; css rules: 1 |
| `.mp-room-label` | write | `index.html:1448` | static markup; on span; css rules: 1 |
| `.mp-room-menu` | write | `index.html:1477` | static markup; on div; css rules: 4 |
| `.mp-room-more` | write | `index.html:1431` | static markup; on button[type=button]; css rules: 1 |
| `.mp-room-report` | write | `js/61-room-report.js:171` | identity class on the report item; no stylesheet rule mentions it |
| `.mp-room-toast` | write | `js/06e-mp-panel.js:456` | the body-mounted room toast (css/21-sidebar.css:1497); shown through inline opacity |
| `.mp-share-hint` | write | `index.html:1457` | static markup; on div; css rules: 1 |
| `.mp-share-mode` | write | `index.html:1450` | x3 in static markup (lines 1450, 1451, 1452); on button[type=button]; css rules: 0 |
| `.mp-share-modes` | write | `index.html:1449` | static markup; on div; css rules: 1 |
| `.mp-share-row` | write | `index.html:1464` | static markup; on div; css rules: 4 |
| `.mp-status-row` | write | `index.html:1416` | static markup; on div; css rules: 1 |
| `.mutation-actions` | write | `js/20-mixer-layout.js:2993` | Mutate / Undo / Redo / Reset row |
| `.mutation-btn` | write | `js/20-mixer-layout.js:2997` | the four action buttons (2997, 3002, 3008, 3014); Undo/Redo use the native disabled state. x4 |
| `.mutation-btn-primary` | write | `js/20-mixer-layout.js:2997` | Mutate button emphasis |
| `.mutation-card` | both | `js/20-mixer-layout.js:3177` | variant card; data-index; read 3237 (thumb sizing), 3491 (active toggle). x3 |
| `.mutation-card-active` | write | `js/20-mixer-layout.js:3492` | the applied card |
| `.mutation-card-foot` | write | `js/20-mixer-layout.js:3203` | card footer |
| `.mutation-chain` | write | `js/20-mixer-layout.js:3064` | #mutationChain |
| `.mutation-changes` | write | `js/20-mixer-layout.js:3205` | 'N changes' token; tabIndex 0; hover/focus opens the .fx-tip.mutation-tip |
| `.mutation-color-dot` | write | `js/20-mixer-layout.js:3379` | colour swatch dot; inline background from the value |
| `.mutation-controls` | write | `js/20-mixer-layout.js:2921` | Scope / Strength / Variants row |
| `.mutation-crumb` | write | `js/20-mixer-layout.js:3537` | chain breadcrumb entry (clickable) |
| `.mutation-crumb-active` | write | `js/20-mixer-layout.js:3537` | current chain entry |
| `.mutation-crumb-arrow` | write | `js/20-mixer-layout.js:3554` | arrow between crumbs |
| `.mutation-diff` | write | `js/20-mixer-layout.js:3057` | #mutationDiff |
| `.mutation-diff-param` | write | `js/20-mixer-layout.js:3523` | param name in the diff panel |
| `.mutation-diff-row` | write | `js/20-mixer-layout.js:3523` | one change in the diff panel |
| `.mutation-diff-title` | write | `js/20-mixer-layout.js:3519` | 'N parameters changed:' heading |
| `.mutation-diff-val` | write | `js/20-mixer-layout.js:3523` | from -> to in the diff panel |
| `.mutation-field` | write | `js/20-mixer-layout.js:2929` | Scope (2929) and Variants (2981) fields. x2 |
| `.mutation-grid` | write | `js/20-mixer-layout.js:3050` | #mutationGrid |
| `.mutation-lock-cb` | both | `js/20-mixer-layout.js:3040` | lock checkboxes; read as '.mutation-lock-cb:checked' (3114). x2 |
| `.mutation-lock-chip` | write | `js/20-mixer-layout.js:3036` | label wrapping each lock checkbox |
| `.mutation-locks` | write | `js/20-mixer-layout.js:3025` | Lock: chips row |
| `.mutation-locks-label` | write | `js/20-mixer-layout.js:3026` | 'Lock:' label |
| `.mutation-scope-seg` | write | `js/20-mixer-layout.js:2937` | Basic \| All segment, drives hidden #mutationScope |
| `.mutation-swatch` | write | `js/20-mixer-layout.js:3194` | fallback when MutationThumbs is absent; inline linear-gradient background from the variant's colours |
| `.mutation-thumb` | both | `js/20-mixer-layout.js:3188` | thumbnail canvas; read as 'canvas.mutation-thumb' (3238) and sized from its on-screen rect x DPR (3248-3249). x2 |
| `.mutation-thumb-tag` | write | `js/20-mixer-layout.js:3267` | Random / Palette / kaleido tags over the thumbnail |
| `.mutation-thumb-tag-k` | write | `js/20-mixer-layout.js:3260` | kaleido tag variant |
| `.mutation-thumb-wrap` | write | `js/20-mixer-layout.js:3186` | holds the thumbnail canvas and its tags |
| `.mutation-tip` | write | `js/20-mixer-layout.js:3400` | Mutate's variant of .fx-tip |
| `.mutation-tip-more` | write | `js/20-mixer-layout.js:3432` | '+ N more' footer when rows are trimmed |
| `.mutation-tip-name` | write | `js/20-mixer-layout.js:3419` | change name in the hover card |
| `.mutation-tip-row` | both | `js/20-mixer-layout.js:3419` | one change in the hover card; rows trimmed to fit the window (3430-3436). x2 |
| `.mutation-tip-title` | write | `js/20-mixer-layout.js:3415` | 'N changes' heading in the hover card |
| `.mutation-tip-val` | write | `js/20-mixer-layout.js:3419` | from -> to in the hover card |
| `.muted` | write | `js/20-mixer-layout.js:7473` | on #audioMuteBtn while playback is muted; NO stylesheet mentions it (glyph change carries the state) |
| `.on` | both | `js/59-brush-type-key.js:84`; +2 test/bake files | lit brush name in #brushTypePill (only css/ rule for '.on' is 22-overlays:1409) |
| `.open` | both | `js/01-config.js:437`, `js/04d-anim-ascend-star.js:59`, `js/05f-kaleido-controls.js:85`, `js/15-layer-masking.js:1740`, `js/20-mixer-layout.js:2714`, `js/28-studio-drawer.js:34`; +2 more; +1 test/bake file | on #mandalaPanel; no .collapsible.open or .feature-body.open rule exists in css/ (visibility is the inline display at 518), so this toggle is write-only here; the… |
| `.open-desktop-modal` | write | `js/51-open-in-desktop.js:83` | css/22-overlays.css:2385-2386 |
| `.open-desktop-remember` | both | `js/51-open-in-desktop.js:92` | the 'Don't ask again' label (css/22-overlays.css:2387, 2396); inline display none after a successful hand-off (186) |
| `.palette-actions` | write | `index.html:660` | static markup; on div; css rules: 5 |
| `.palette-active` | write | `index.html:653` | static markup; on div; css rules: 1 |
| `.palette-active-head` | write | `index.html:654` | static markup; on div; css rules: 3 |
| `.palette-active-name` | write | `js/01-config.js:865` | "These came with a look." in #paletteActiveHead; css rules: 1 |
| `.palette-add` | write | `js/01-config.js:921` | the [+] button (#paletteAddChip); css rules: 7 |
| `.palette-carousel` | write | `index.html:651` | static markup; on div; css rules: 3 |
| `.palette-chip` | both | `js/01-config.js:895`; +2 test/bake files | the colour chip (div[role=button], roving tabindex, inline backgroundColor); keydown delegation checks e.target.classList; css rules: 11 |
| `.palette-chip-wrap` | both | `js/01-config.js:892`, `js/64-colour-picker.js:735`; +1 test/bake file | draggable wrapper of one colour chip, carries data-hex and is-match/is-added/is-active; css rules: 13 |
| `.palette-extract-host` | write | `index.html:652` | static markup; on div; css rules: 1 |
| `.palette-keep` | write | `js/01-config.js:871` | Keep button beside it; css rules: 1 |
| `.palette-keys` | write | `index.html:658` | static markup; on div; css rules: 2 |
| `.palette-label` | write | `index.html:650` | static markup; on label; css rules: 2 |
| `.palette-list` | both | `js/01-config.js:477`; +2 test/bake files | body-mounted listbox; inline width/maxHeight/top/left from placePaletteList; css rules: 1 |
| `.palette-menu` | both | `js/01-config.js:239`; +2 test/bake files | marks the palette context menu; outside-click guard of the list keeps clicks inside it; css rules: 0 |
| `.palette-menu-swatch` | write | `js/01-config.js:246` | colour swatch prepended to the chip menu title (inline backgroundColor); css rules: 1 |
| `.palette-name-input` | both | `js/01-config.js:386`; +1 test/bake file | the inline rename text field; css rules: 1 |
| `.palette-new-btns` | both | `js/01-config.js:578`; +1 test/bake file | Brush color / Image… / Canvas buttons; the arrow-key walk includes them; css rules: 2 |
| `.palette-new-cap` | write | `js/01-config.js:574` | caption of the New row; css rules: 1 |
| `.palette-new-row` | write | `js/01-config.js:572` | first row of the list ("+ New palette"); css rules: 1 |
| `.palette-note` | write | `index.html:656` | static markup; on div; css rules: 2 |
| `.palette-option` | both | `js/01-config.js:599`; +1 test/bake file | one palette row in the list (div[role=option], draggable); css rules: 14 |
| `.palette-option-name` | both | `js/01-config.js:606`; +1 test/bake file | name line of a list row; renameInline targets it; css rules: 4 |
| `.palette-option-strip` | both | `js/01-config.js:609`; +1 test/bake file | colour strip under the name (spans with inline background); css rules: 2 |
| `.palette-picker-host` | write | `index.html:657` | static markup; on div; css rules: 1 |
| `.palette-preview` | write | `index.html:655` | static markup; on div; css rules: 3 |
| `.palette-select-chev` | write | `js/01-config.js:447` | chevron span, aria-hidden; css rules: 2 |
| `.palette-select-name` | both | `js/01-config.js:444`; +1 test/bake file | palette name on the trigger; renameInline swaps its content for the input; css rules: 1 |
| `.palette-select-trigger` | both | `js/01-config.js:437` | the #paletteSelect dropdown face; css rules: 6 |
| `.path-action-row` | write | `js/24-path-layers.js:653` | CSS 22-overlays.css x2 |
| `.path-brush-slider` | write | `js/24-path-layers.js:622` | range input, wired by data-action=brush; no rule in css/ (write-only) |
| `.path-brush-val` | both | `js/24-path-layers.js:623` | CSS 22-overlays.css x1 |
| `.path-clear-btn` | write | `js/24-path-layers.js:656` | data-action=clear-paths, disabled at zero paths; CSS 22-overlays.css x2 |
| `.path-color-picker` | write | `js/24-path-layers.js:632` | input[type=color], data-action=color; CSS 22-overlays.css x3 |
| `.path-control-row` | both | `js/06-slider-updater.js:85`, `js/24-path-layers.js:615` | label + input + value rows at 615, 620, 625, 630, 635 (x5); CSS 22-overlays.css x4 |
| `.path-draw-btn` | write | `js/24-path-layers.js:654` | data-action=draw; CSS 22-overlays.css x2 |
| `.path-empty-create` | write | `js/24-path-layers.js:587` | the '+ Create Path Layer' button, carrying data-action=create; CSS 22-overlays.css x1 |
| `.path-empty-hint` | write | `js/24-path-layers.js:586` | CSS 22-overlays.css x1 |
| `.path-empty-state` | write | `js/24-path-layers.js:583` | empty-list placeholder div; CSS 22-overlays.css x1 |
| `.path-empty-text` | write | `js/24-path-layers.js:585` | CSS 22-overlays.css x1 |
| `.path-flow-slider` | write | `js/24-path-layers.js:627` | range input, wired by data-action=flow; no rule in css/ (write-only) |
| `.path-flow-val` | both | `js/24-path-layers.js:628` | CSS 22-overlays.css x1 |
| `.path-layer-body` | write | `js/24-path-layers.js:612` | collapsible body; CSS .path-layer-item.collapsed .path-layer-body 22-overlays.css:558 (x2) |
| `.path-layer-controls` | write | `js/24-path-layers.js:614` | CSS 22-overlays.css x1 |
| `.path-layer-header` | write | `js/24-path-layers.js:603` | row header div (title input + .layer-controls), carries draggable="true"; CSS 22-overlays.css x8 |
| `.path-layer-info` | both | `js/24-path-layers.js:613` | 'n/MAX paths \| points \| mode' line; style.color written 254; CSS 22-overlays.css x1 |
| `.path-layer-item` | both | `js/24-path-layers.js:596` | every path-layer row div: className = 'path-layer-item' + ' active-layer'? + ' collapsed'?; read by selectors 251, 464 and closest 729, 736, 802, 835 (x7); CSS… |
| `.path-mode-select` | write | `js/24-path-layers.js:637` | loop / pingpong / once select, data-action=mode; no rule in css/ (write-only) |
| `.path-preview-canvas` | both | `js/24-path-layers.js:659` | 200x60 preview canvas per row, repainted by drawPathPreview; CSS 22-overlays.css x1 |
| `.path-shape-btn` | write | `js/24-path-layers.js:644` | eight shape buttons 644-651, each with data-shape; CSS 22-overlays.css x3 |
| `.path-shapes-row` | write | `js/24-path-layers.js:643` | CSS 22-overlays.css x1 |
| `.path-speed-slider` | write | `js/24-path-layers.js:617` | range input, wired by data-action=speed; no rule in css/ (write-only) |
| `.path-speed-val` | both | `js/24-path-layers.js:618` | readout span, textContent on input; CSS 22-overlays.css x1 |
| `.path-transform-btn` | write | `js/24-path-layers.js:655` | data-action=transform, disabled while the layer has no path; CSS 22-overlays.css x2 |
| `.path-use-brush-btn` | write | `js/24-path-layers.js:633` | 'From brush' button; CSS 22-overlays.css x1 |
| `.pen-screen` | write | `js/47-pen-window.js:558` | <label> per screen radio; CSS css/21-sidebar.css:2201 (3 rules, scoped under .control-group) |
| `.pen-window-hint` | write | `index.html:1088`, `js/47-pen-window.js:552` | hint lines inside #penWindowScreens; CSS css/21-sidebar.css:2168 |
| `.pen-window-screens` | write | `index.html:1100` | static markup; on div; css rules: 1 |
| `.pfi` | both | `js/65-palette-from-image.js:439`; +1 test/bake file | the 'New palette from <image>' panel root 439 and the error panel 526; tabIndex -1, role=group 441, aria-label 442; Escape closes (x2) |
| `.pfi-cancel` | both | `js/65-palette-from-image.js:497`; +1 test/bake file | Cancel button; no stylesheet mentions .pfi-cancel (styled only through btn--ghost) |
| `.pfi-close` | write | `js/65-palette-from-image.js:447` | close button (aria-label 450 / 533) 447, 530 (x2) |
| `.pfi-controls` | write | `js/65-palette-from-image.js:462` | method select + count stepper + regenerate |
| `.pfi-count` | write | `js/65-palette-from-image.js:474` | count stepper (minus / value / plus) |
| `.pfi-count-val` | both | `js/65-palette-from-image.js:479`; +1 test/bake file | count readout; aria-live=polite 480; textContent 606 |
| `.pfi-error` | both | `js/65-palette-from-image.js:537`; +1 test/bake file | decode-failure message in the error panel |
| `.pfi-foot` | write | `js/65-palette-from-image.js:496` | Cancel / Save palette row |
| `.pfi-head` | write | `js/65-palette-from-image.js:444` | panel head (title + close) 444, 528 (x2) |
| `.pfi-hint` | write | `js/65-palette-from-image.js:460` | 'Drag a circle to pick a different color.' |
| `.pfi-image` | both | `js/65-palette-from-image.js:411`; +1 test/bake file | the picture canvas (DPR-sized, inline style.width 413) placed in .pfi-stage |
| `.pfi-marker` | both | `js/65-palette-from-image.js:611`; +1 test/bake file | draggable circle on the picture; inline left/top % and backgroundColor 628-630; classes hot 636 and dragging 664 / 678 |
| `.pfi-markers` | write | `js/65-palette-from-image.js:456` | marker layer over the picture; innerHTML emptied 604 on every render |
| `.pfi-method` | both | `js/65-palette-from-image.js:463`; +1 test/bake file | method <select> (aria-label 'Method' 465) |
| `.pfi-regen` | both | `js/65-palette-from-image.js:488`; +1 test/bake file | 'Try other colors' button (aria-label 491) |
| `.pfi-save` | both | `js/65-palette-from-image.js:500`; +1 test/bake file | Save palette button; no stylesheet mentions .pfi-save (styled only through btn--emphasis) |
| `.pfi-stage` | write | `js/65-palette-from-image.js:454` | holds .pfi-image and .pfi-markers |
| `.pfi-step` | both | `js/65-palette-from-image.js:476`; +1 test/bake file | minus 476 and plus 481 buttons (aria-label 478 / 483); .disabled at the count limits 607-608 (x2) |
| `.pfi-swatch` | both | `js/65-palette-from-image.js:613`; +1 test/bake file | colour swatch paired with a marker; inline backgroundColor 631, title = hex; dataset.index 623; class hot 637 |
| `.pfi-swatches` | write | `js/65-palette-from-image.js:459` | swatch row; innerHTML emptied 605 on every render |
| `.pfi-title` | both | `js/65-palette-from-image.js:445`; +1 test/bake file | file name / label 445, 529 (x2) |
| `.phone-pad-alt` | write | `js/54-phone-pads.js:347` | 'No camera? Open … and enter' (css/22-overlays.css:2644) |
| `.phone-pad-body` | write | `js/54-phone-pads.js:344` | QR + side column (css/22-overlays.css:2620, 2682) |
| `.phone-pad-code` | write | `js/54-phone-pads.js:348` | the 8- or 6-character code, grouped (css/22-overlays.css:2649) |
| `.phone-pad-modal` | write | `js/54-phone-pads.js:331` | css/22-overlays.css:2606-2607 |
| `.phone-pad-note` | write | `js/54-phone-pads.js:354` | the locked-room / stranger note (css/22-overlays.css:2672) |
| `.phone-pad-qr` | write | `js/54-phone-pads.js:345` | the QR box (css/22-overlays.css:2625, 2634; .is-hidden 2639) |
| `.phone-pad-reveal` | write | `js/54-phone-pads.js:349` | 'Show the code' (css/22-overlays.css:2656) |
| `.phone-pad-side` | write | `js/54-phone-pads.js:346` | css/22-overlays.css:2643 |
| `.phone-pad-status` | write | `js/54-phone-pads.js:353` | live status line, role=status aria-live=polite (css/22-overlays.css:2657; .is-live 2667) |
| `.phone-pad-ways` | write | `js/54-phone-pads.js:340` | the As your mouse / As an artist toggle row, role=group aria-label 'How the phone paints' (css/22-overlays.css:2611, 2616) |
| `.photo-warn-learn` | write | `index.html:1058` | static markup; on a; css rules: 2 |
| `.photosafe-on` | both | `js/05e-effect-controls.js:197`; +1 test/bake file | on <body>, mirrors config.PHOTOSAFE (x2: L197 seed, L221 on change); css has 6 rules (canvas transitions guard) |
| `.pinned` | both | `js/12-save-load.js:139` | pinned state of #statsPinBtn (read 139, written 334); unreachable today because #statsPinBtn does not exist; no stylesheet mentions .pinned |
| `.playing` | write | `js/20-mixer-layout.js:3978` | on .anim-lib-row while that animation loops |
| `.playtest-label` | both | `js/52-demo-clock.js:449`, `js/60-reset-app.js:345` | css/22-overlays.css:30, 2417 (+ .floating); js/60 uses it as an insertion anchor |
| `.pr-dot` | both | `js/47-pen-window.js:1231` | pen window: hotspot dot svg inside #ring; style.display toggled against .pr-p (1264-1266) |
| `.pr-p` | both | `js/47-pen-window.js:1234` | pen window: the P badge for pressure mode |
| `.preset-empty` | write | `js/20-mixer-layout.js:2079` | 'Nothing saved yet' note on the own path |
| `.preset-fork` | both | `js/20-mixer-layout.js:1944`, `js/49-hotkey-binds.js:608` | first-open question block that stands in for the list |
| `.preset-fork-btn` | write | `js/20-mixer-layout.js:1953` | the two answers (data-path=ours\|own) |
| `.preset-fork-say` | write | `js/20-mixer-layout.js:1946` | the question text |
| `.preset-group` | both | `js/20-mixer-layout.js:1829` | collapsible group block ('preset-group' + ' collapsed'), data-group=<group id>; read L2164 (revealGroup) |
| `.preset-group-body` | write | `js/20-mixer-layout.js:1860` | group body holding preset rows |
| `.preset-group-chev` | write | `js/20-mixer-layout.js:1833` | group chevron glyph |
| `.preset-group-count` | both | `js/20-mixer-layout.js:1833` | group count span; read L1835 |
| `.preset-group-head` | write | `js/20-mixer-layout.js:1832` | group header row (click folds); may hold a .preset-more |
| `.preset-group-name` | both | `js/20-mixer-layout.js:1833` | group title span; read L1834, L1865 (replaced by an input during inline rename) |
| `.preset-menu` | write | `js/20-mixer-layout.js:1905` | preset / group ... menu ('brush-shape-menu preset-menu', data-group=core), body-mounted, positioned in its own zoom |
| `.preset-more` | both | `js/20-mixer-layout.js:1846`, `js/49-hotkey-binds.js:618` | the ... menu button ('preset-more btn--icon'): group head L1846, preset row L2025 |
| `.preset-name` | both | `js/20-mixer-layout.js:1755` | name span inside a preset button; read L1755, L1813 (name comparison); written L1808 (built-in), L2011 (user) |
| `.preset-path-back` | write | `js/20-mixer-layout.js:2088` | 'Show the built-in presets' ('preset-path-back btn--ghost btn--sm') |
| `.preset-path-back-row` | write | `js/20-mixer-layout.js:2085` | row holding 'Show the built-in presets' + its x |
| `.preset-path-forget` | write | `js/20-mixer-layout.js:2095` | the red x ('preset-path-forget btn--icon btn--destructive') that hides the offer for good |
| `.preset-thumb` | write | `js/20-mixer-layout.js:1572` | preset thumbnail span (img inside); .is-empty when no/failed image |
| `.presets` | both | `index.html:1352`, `js/04b-presets.js:216`, `js/20-mixer-layout.js:1796` | index.html .presets div: its built-in buttons are moved out (and the div emptied) into the popup's Built in group |
| `.pressure-pad` | both | `index.html:1127`, `js/20-mixer-layout.js:4201` | aim pad inside #pressureFieldControls; data-wired guard; pointer handlers |
| `.pressure-pad-arm` | both | `index.html:1132`, `js/20-mixer-layout.js:4207` | inline width / transform rotate / opacity (4231-4233) |
| `.pressure-pad-dot` | both | `index.html:1133`, `js/20-mixer-layout.js:4206` | inline left/top in % (4226-4227) |
| `.pressure-pad-h` | write | `index.html:1129` | static markup; on span; css rules: 2 |
| `.pressure-pad-read` | both | `index.html:1135`, `js/20-mixer-layout.js:4202` | compass readout; textContent written (4234) |
| `.pressure-pad-ring` | write | `index.html:1131` | static markup; on span; css rules: 1 |
| `.pressure-pad-v` | write | `index.html:1130` | static markup; on span; css rules: 2 |
| `.pressure-pad-wrap` | write | `index.html:1126` | static markup; on div; css rules: 1 |
| `.preview-toggle` | write | `index.html:1551` | static markup; on div; css rules: 2 |
| `.pulse` | write | `js/44-recipes.js:896` | parked 44: on .recipe-ring (finite keyframe animation) |
| `.pw-buttons` | write | `index.html:322` | static markup; on div; css rules: 0 |
| `.pw-card` | both | `index.html:303`; +1 test/bake file | static markup; on div; css rules: 0 |
| `.pw-check` | write | `index.html:309` | static markup; on label; css rules: 0 |
| `.pw-exit-line` | write | `index.html:320` | static markup; on p; css rules: 0 |
| `.pw-off` | write | `index.html:389` | on #photoWarn while the box is unchecked; inline CSS 297 recolours #pwContinue caution yellow |
| `.pw-symptoms` | write | `index.html:316` | static markup; on p; css rules: 0 |
| `.pw-unprotected` | both | `index.html:315` | static markup; on p; css rules: 0 \|\| aria-live line, textContent set at 390; inline CSS 284-285 (:empty collapses it) |
| `.qub-dd` | both | `js/17-hotkey-reminder.js:78`, `js/20-mixer-layout.js:2760`, `js/44-recipes.js:832`, `js/49-hotkey-binds.js:667`; +1 test/bake file | custom dropdown wrapper per quality select; .open toggled; closest at 2707. x2 |
| `.qub-dd-btn` | both | `js/17-hotkey-reminder.js:79`, `js/20-mixer-layout.js:2770`, `js/44-recipes.js:445`, `js/49-hotkey-binds.js:618`; +1 test/bake file | pill button; aria-haspopup=listbox, aria-expanded, aria-controls, aria-labelledby |
| `.qub-dd-cap` | write | `js/20-mixer-layout.js:2765`, `js/62-canvas-readout.js:75` | reuses the underbar dropdown caption class for 'Canvas' |
| `.qub-dd-chev` | write | `js/20-mixer-layout.js:2775` | chevron span in the pill |
| `.qub-dd-hdr` | write | `js/20-mixer-layout.js:2779` | list header (label text) |
| `.qub-dd-list` | both | `js/20-mixer-layout.js:2777`; +1 test/bake file | the popup list; role=listbox, aria-labelledby; id #<selectId>DdList |
| `.qub-dd-opt` | both | `js/20-mixer-layout.js:2827` | option rows (role=option, aria-selected, data-value, tabIndex -1); read 2824, 2840, '.qub-dd-opt.sel' 2858. x4 |
| `.qub-dd-shade` | write | `js/20-mixer-layout.js:2711` | marks the Shading Detail pill (hidden by CSS unless #quality-underbar.qub-shading) |
| `.qub-dd-sub` | write | `js/20-mixer-layout.js:2786` | one-line mechanism caption under the header |
| `.qub-dd-val` | write | `js/20-mixer-layout.js:2773` | current value span; id #<selectId>DdVal |
| `.qub-native-hidden` | write | `js/20-mixer-layout.js:2758` | on the native <select> parked inside .qub-dd (state-holder; also tabIndex -1 + aria-hidden) |
| `.qub-shading` | write | `js/20-mixer-layout.js:2713` | on #quality-underbar, follows #displayShadingToggle.checked; shows the Shading Detail pill and sets the hotkey-chip cutoff (css/20-mixer-strip.css) |
| `.qub-size` | write | `js/62-canvas-readout.js:72` | underbar 'Canvas 464 x 826 . 9:16' cell; CSS css/20-mixer-strip.css:122 '#quality-underbar > .qub-size' |
| `.qub-size-val` | write | `js/62-canvas-readout.js:78` | the size text; CSS 20-mixer-strip:126 |
| `.radial-add` | both | `js/58-radial-menu.js:890`; +1 test/bake file | add row (label input + picker + Add); CSS 6 rules |
| `.radial-add-btn` | write | `js/58-radial-menu.js:914` | Add button |
| `.radial-add-label` | both | `js/58-radial-menu.js:891`; +1 test/bake file | text input, aria-label 896 |
| `.radial-block` | both | `js/44-recipes.js:584`, `js/58-radial-menu.js:868`; +1 test/bake file | distinguishes this block from js/49's |
| `.radial-empty` | both | `js/58-radial-menu.js:531`; +1 test/bake file | 'Nothing on the menu yet' note; inline top (532) |
| `.radial-fill` | write | `js/58-radial-menu.js:514` | slider fill <path>, d rewritten per paint (546); CSS 5 rules |
| `.radial-hit` | write | `js/58-radial-menu.js:489` | the disc that takes the pointer; inline left/top/width/height from rOut (490-491) |
| `.radial-how` | write | `js/58-radial-menu.js:870` | how-to paragraph |
| `.radial-hub` | write | `js/58-radial-menu.js:528` | hub <circle> (r = rHub); CSS 2 rules |
| `.radial-hub-x` | write | `js/58-radial-menu.js:529` | the x in the hub |
| `.radial-label` | both | `js/58-radial-menu.js:517`; +3 test/bake files | item label div, role=menuitem (518); inline maxWidth/left/top (519-521); state classes is-hot / is-off; CSS 7 rules |
| `.radial-label-key` | write | `js/58-radial-menu.js:524` | key item's combo span; CSS 2 rules |
| `.radial-label-text` | both | `js/58-radial-menu.js:522`; +1 test/bake file | label text span |
| `.radial-label-val` | both | `js/58-radial-menu.js:523`; +1 test/bake file | slider readout span (textContent 549) |
| `.radial-list` | write | `js/58-radial-menu.js:874` | item rows host (re-rendered with textContent='' 1002) |
| `.radial-pick-btn` | write | `js/58-radial-menu.js:879` | '+ Add from the interface' button |
| `.radial-reset` | both | `js/58-radial-menu.js:922`; +1 test/bake file | 'Back to the starting items'; hidden when the list is the default (1037) |
| `.radial-row` | both | `js/58-radial-menu.js:1007`; +1 test/bake file | row variant |
| `.radial-svg` | both | `js/58-radial-menu.js:492`; +1 test/bake file | the SVG; width/height/viewBox attrs and inline left/top (493-497) |
| `.radial-thumb` | write | `js/58-radial-menu.js:515` | slider value arc <path> (547); CSS 3 rules |
| `.radial-wedge` | both | `js/58-radial-menu.js:507`; +1 test/bake file | one <path> per item; state classes is-hot (581/583), is-off (551), is-dragging (609/625) toggled on it; CSS 9 rules |
| `.radial-wheel` | both | `js/58-radial-menu.js:485`; +3 test/bake files | wheel origin; inline style.left/top = pointer (486-487) |
| `.raster-active` | write | `js/05k-layers-render.js:319`, `js/05l-layers-transform.js:826` | row of the paint layer currently painted into; js/05l:826 toggles it in place without a re-render |
| `.raster-blend-select` | both | `js/05k-layers-render.js:330` | paint layer Blend <select>; read 348 to wire change; no rule in css/ matches it |
| `.raster-clip-invert` | both | `js/05k-layers-render.js:341` | paint layer Clip Inv checkbox; read 362; no rule in css/ matches it |
| `.raster-clip-select` | both | `js/05k-layers-render.js:341` | paint layer Clip <select>; read 354; no rule in css/ matches it |
| `.raster-paint-btn` | both | `js/05k-layers-render.js:337`, `js/05l-layers-transform.js:827` | 'Paint into this layer' button, rendered with class active when it is the paint target; js/05l:827 toggles active in place; no rule in css/ matches it (styled as… |
| `.ready` | write | `index.html:1789`, `js/20-mixer-layout.js:261` | #splash-screen 'ready' flourish (desktop title-card path) |
| `.rec-close` | write | `index.html:1605` | static markup; on button; css rules: 0 |
| `.rec-color-mode` | write | `js/20-mixer-layout.js:3992` | replay colour-mode select; class shared with the recorder strip's own select (js/03) |
| `.rec-countdown` | both | `js/03-recording.js:1128`, `js/44-recipes.js:479` | countdown badge: css/styles.css:1035-1036 (reads data-rec-count), 1074 |
| `.rec-drawer` | both | `index.html:1599`, `js/08b-jank-monitor.js:205` | inUI() |
| `.rec-grabber` | write | `index.html:1600` | static markup; on div; css rules: 2 |
| `.rec-playing` | write | `js/03-recording.js:1127` | PLAY badge: css/styles.css:1019, 1073 |
| `.rec-recording` | both | `js/03-recording.js:1126`, `js/44-recipes.js:479` | drives the REC canvas badge: css/styles.css:1004 body.rec-recording #canvas-area::after, 1072 |
| `.rec-resize-handle` | write | `index.html:1600` | static markup; on div; css rules: 2 |
| `.rec-strip` | write | `index.html:1560` | static markup; on div; css rules: 1 |
| `.rec-strip-ask` | write | `index.html:1583` | static markup; on span; css rules: 1 |
| `.rec-strip-chips` | write | `index.html:1568` | x2 in static markup (lines 1568, 1577); on div; css rules: 2 |
| `.rec-strip-foot` | write | `index.html:1587` | static markup; on div; css rules: 1 |
| `.rec-strip-keep` | write | `index.html:1582` | static markup; on div; css rules: 3 |
| `.rec-strip-label` | write | `index.html:1576` | static markup; on span; css rules: 1 |
| `.rec-strip-length` | write | `index.html:1566` | static markup; on div; css rules: 0 |
| `.rec-strip-row` | write | `index.html:1561` | x5 in static markup (lines 1561, 1566, 1575, 1582, 1587); on div; css rules: 1 |
| `.rec-strip-source` | write | `index.html:1575` | static markup; on div; css rules: 0 |
| `.rec-strip-status` | write | `index.html:1588` | static markup; on span; css rules: 1 |
| `.rec-strip-time` | write | `index.html:1567` | static markup; on span; css rules: 1 |
| `.rec-strip-transport` | write | `index.html:1561` | static markup; on div; css rules: 3 |
| `.rec-take-ask` | both | `js/03-recording.js:317` | question text span; read L327 to set textContent; no stylesheet rule mentions it |
| `.rec-take-prompt` | write | `js/03-recording.js:315` | the on-canvas take prompt card; css/styles.css:1075, 1080 |
| `.recipe-body` | write | `js/44-recipes.js:1181` | parked 44 |
| `.recipe-close` | both | `js/44-recipes.js:1178` | parked 44: 'recipe-close btn--icon' (1216) |
| `.recipe-content` | write | `js/44-recipes.js:1173` | parked 44 |
| `.recipe-count` | both | `js/44-recipes.js:1177` | parked 44: 'n of N' aria-live (1177, 1192) |
| `.recipe-detail` | both | `js/44-recipes.js:1183` | parked 44 (1190); detail innerHTML rebuilt per highlight |
| `.recipe-detail-actions` | write | `js/44-recipes.js:1293` | parked 44 |
| `.recipe-detail-answer` | write | `js/44-recipes.js:1289` | parked 44 |
| `.recipe-detail-key` | write | `js/44-recipes.js:1291` | parked 44 |
| `.recipe-detail-title` | write | `js/44-recipes.js:1288` | parked 44 |
| `.recipe-detail-where` | write | `js/44-recipes.js:1292` | parked 44 |
| `.recipe-empty` | write | `js/44-recipes.js:1183` | parked 44 (1183, 1281) |
| `.recipe-foot` | write | `js/44-recipes.js:1185` | parked 44 |
| `.recipe-foot-hotkeys` | both | `js/44-recipes.js:1185` | parked 44: 'recipe-foot-hotkeys btn--ghost btn--sm' Hotkeys (F1) (1217) |
| `.recipe-foot-keys` | write | `js/44-recipes.js:1185` | parked 44 |
| `.recipe-foot-title` | write | `js/44-recipes.js:1185` | parked 44 |
| `.recipe-group` | write | `js/44-recipes.js:1254` | parked 44: pillar heading in results |
| `.recipe-head` | write | `js/44-recipes.js:1174` | parked 44 |
| `.recipe-modal` | both | `js/44-recipes.js:1167`; +1 test/bake file | parked 44 |
| `.recipe-pill-actions` | write | `js/44-recipes.js:992` | parked 44: 'recipe-pill-actions btn-sm' |
| `.recipe-pill-again` | both | `js/44-recipes.js:993` | parked 44: Point again (1000, 1035) |
| `.recipe-pill-back` | both | `js/44-recipes.js:995` | parked 44 (1004, 1036) |
| `.recipe-pill-close` | both | `js/44-recipes.js:997` | parked 44: 'recipe-pill-close btn--icon' (1009) |
| `.recipe-pill-demo` | both | `js/44-recipes.js:994` | parked 44 (1010, 1031) |
| `.recipe-pill-key` | both | `js/44-recipes.js:989` | parked 44 (1021) |
| `.recipe-pill-line` | both | `js/44-recipes.js:989`; +1 test/bake file | parked 44 |
| `.recipe-pill-next` | both | `js/44-recipes.js:996` | parked 44: 'recipe-pill-next btn--emphasis' (1008, 1034) |
| `.recipe-pill-note` | both | `js/44-recipes.js:990` | parked 44: note line; delegated click on 'button[data-recipe]' inside it (1011-1013, 1028, 1052) |
| `.recipe-pill-step` | both | `js/44-recipes.js:989` | parked 44: '1/4' counter (1024); gets 'done' (1027) |
| `.recipe-pill-text` | write | `js/44-recipes.js:988` | parked 44 |
| `.recipe-pill-title` | both | `js/44-recipes.js:989` | parked 44 (1020) |
| `.recipe-pointer` | both | `js/44-recipes.js:864` | parked 44: SVG pointer glyph (864, 875) |
| `.recipe-results` | both | `js/44-recipes.js:1182` | parked 44: role=listbox (1189) |
| `.recipe-ring` | both | `js/44-recipes.js:863` | parked 44: pulsing ring (863, 874, 894); 'pulse' removed + re-added to restart the animation (896) |
| `.recipe-row` | both | `js/44-recipes.js:1261` | parked 44: result button, role=option (1261-1263); closest (1220, 1226); aria-selected + active (1271-1275) |
| `.recipe-row-title` | write | `js/44-recipes.js:1264` | parked 44 |
| `.recipe-slash` | write | `js/44-recipes.js:1175` | parked 44: '/' glyph, aria-hidden |
| `.recipe-steps` | write | `js/44-recipes.js:1285` | parked 44: <ol> of step copy |
| `.recipe-tag` | both | `js/44-recipes.js:1197` | parked 44: 'ch-text-toggle recipe-tag' chips (1197, 1201); closest (1205); toggled active (1207, 1348) |
| `.recipe-tags` | both | `js/44-recipes.js:1180` | parked 44: topic chip row, role=group (1193) |
| `.remote-cursor` | both | `js/06e-mp-panel.js:183`; +2 test/bake files | peer cursor tag root (css/21-sidebar.css:1520); created per peer (183), all removed by clearRemoteCursors (267); carries --peer and inline left/top % |
| `.remote-cursor-label` | both | `js/06e-mp-panel.js:187`; +3 test/bake files | the name tag span (css/21-sidebar.css:1545, ::before 1558); textContent = '📱 ' prefix for a phone pad + shortName |
| `.remote-cursor-ring` | write | `js/06e-mp-panel.js:185` | the ring span inside .remote-cursor (css/21-sidebar.css:1533) |
| `.reset-app-btn` | write | `js/60-reset-app.js:337` | css/22-overlays.css:2438, 2443 |
| `.reset-app-defaults` | write | `js/60-reset-app.js:266` | the 'Use defaults, not my saved settings' label row (css/22-overlays.css:2500, 2509) |
| `.reset-app-hint` | write | `js/60-reset-app.js:367` | css/22-overlays.css:2512 |
| `.reset-app-hint-actions` | write | `js/60-reset-app.js:374` | the 'Got it' row (css/22-overlays.css:2538-2539) |
| `.reset-app-hint-text` | write | `js/60-reset-app.js:371` | the protip paragraph; no stylesheet rule mentions the class |
| `.reset-app-modal` | both | `js/60-reset-app.js:254`; +2 test/bake files | css/22-overlays.css:2495-2496 |
| `.resize-e` | both | `index.html:560`, `js/02-palettes.js:81` | direction class on a .resize-handle; renaming changes which edge the drag moves |
| `.resize-handle` | both | `index.html:557`, `js/02-palettes.js:12`, `js/05g-arm-colors.js:756`; +1 test/bake file | x8 in static markup (lines 557, 558, 559, 560, 561, 562, …); on div; css rules: 6 |
| `.resize-n` | both | `index.html:558`, `js/02-palettes.js:81` | direction class on a .resize-handle; renaming changes which edge the drag moves |
| `.resize-ne` | both | `index.html:559`, `js/02-palettes.js:81` | direction class on a .resize-handle; renaming changes which edge the drag moves |
| `.resize-nw` | both | `index.html:557`, `js/02-palettes.js:81` | direction class on a .resize-handle; renaming changes which edge the drag moves |
| `.resize-s` | both | `index.html:562`, `js/02-palettes.js:81` | direction class on a .resize-handle; renaming changes which edge the drag moves |
| `.resize-se` | both | `index.html:561`, `js/02-palettes.js:81`, `js/52-demo-clock.js:419` | the canvas frame's bottom-right handle (css/styles.css:269); its rect and offsetParent decide where the label tucks |
| `.resize-sw` | both | `index.html:563`, `js/02-palettes.js:81` | direction class on a .resize-handle; renaming changes which edge the drag moves |
| `.resize-w` | both | `index.html:564`, `js/02-palettes.js:81` | direction class on a .resize-handle; renaming changes which edge the drag moves |
| `.rsb-edge` | write | `js/20-mixer-layout.js:2542` | right bar's zero-width tab holder; .collapsed toggled (2588) |
| `.rsb-rail` | both | `js/13-compact-mode.js:61`, `js/20-mixer-layout.js:2555` | folded right rail (compact windows only): Controls, Color, Presets, Together |
| `.rsb-rail-label` | write | `js/20-mixer-layout.js:2559` | right rail buttons |
| `.rsb-rail-section` | write | `js/20-mixer-layout.js:2559` | added to Color/Presets/Together rail buttons |
| `.rsb-toggle` | write | `js/20-mixer-layout.js:2545` | right fold tab « / »; aria-expanded + aria-label (2591-2592) |
| `.sam-spinner` | write | `js/15-layer-masking.js:278` | spinner span; its keyframes live in the injected #samModalStyles sheet (js/16, not this slice) |
| `.section-badge` | write | `js/20-mixer-layout.js:7200` | underConstructionBadge (7198; the function and the Audio section it feeds, 7206, straddle the slice end); kept separate from .section-title so name lookups still work;… |
| `.section-body` | both | `js/20-mixer-layout.js:9353`, `js/43-ui-visibility.js:362`, `js/49-hotkey-binds.js:1374`, `js/58-radial-menu.js:864`, `js/66-skip-menu.js:50`; +1 test/bake file | section content; the MutationObserver 9347 checks body.contains(activeElement) to rescue focus when a section folds |
| `.section-chevron` | both | `js/20-mixer-layout.js:9320` | second child of .section-header; used as insertBefore reference for the Audio badge 7207 |
| `.section-header` | both | `js/08b-jank-monitor.js:192`, `js/20-mixer-layout.js:9308`, `js/44-recipes.js:835`; +6 test/bake files | header row inside .sidebar-section; click toggles the section unless the click lands in .section-header-actions (9315); read 8377 (Swirl Together focus hook), 9227… |
| `.section-header-actions` | both | `js/20-mixer-layout.js:3627` | Layers toolbar wrapper; despite the name it is appended to the section BODY (3724); makeSection's header click guard reads it by closest (9315, outside this range) |
| `.section-layers` | both | `js/05k-layers-render.js:76`, `js/20-mixer-layout.js:3619` | on the Layers .sidebar-section |
| `.section-title` | both | `js/12-save-load.js:484`, `js/20-mixer-layout.js:2447`, `js/37-nav-idle-glow.js:178`, `js/43-ui-visibility.js:148`, `js/44-recipes.js:692`, `js/49-hotkey-binds.js:129`; +2 more; +5 test/bake files | first child of .section-header (titleEl = header.firstChild 9327, so it MUST stay first); role=button, tabindex 0, aria-expanded mirrors .collapsed; its trimmed… |
| `.sel` | both | `js/20-mixer-layout.js:2827` | selected .qub-dd-opt; '.qub-dd-opt.sel' is the initial focus target (2858). x2 |
| `.show` | both | `js/00b-dialog-focus.js:275`, `js/01-config.js:672`, `js/04f-canvas-actions.js:611`, `js/05e-effect-controls.js:230`, `js/20-mixer-layout.js:402`, `js/24-path-layers.js:885`; +7 more; +9 test/bake files | open state of #pathDeleteModal; CSS .delete-modal.show { display:flex } styles.css:690 (generic name, 6 hits) |
| `.sidebar-resize-handle` | write | `js/20-mixer-layout.js:209` | drag handle appended to #sidebar-right; gets .active while dragging; writes --sidebar-width |
| `.sidebar-section` | both | `js/03-recording.js:290`, `js/05k-layers-render.js:76`, `js/08b-jank-monitor.js:190`, `js/12-save-load.js:478`, `js/20-mixer-layout.js:2383`, `js/37-nav-idle-glow.js:178`; +7 more; +18 test/bake files | makeSection root: 'sidebar-section' + ' collapsed'; read by closest 8621 (isShown), 9140 (hostSec), querySelectorAll 9216 and 9262 (accordion sweep), 9204 via… |
| `.skip-landed` | both | `js/66-skip-menu.js:244`; +1 test/bake file | 1 s ring on the REGION ROOT focus just went to (#sidebar-left etc.); previous one found by querySelector (240); CSS 2 rules |
| `.skip-menu` | write | `js/66-skip-menu.js:89` | CSS css/22-overlays.css:2047 (14 rules; shown only :focus-within, 2065) |
| `.skip-menu-canvas` | write | `js/66-skip-menu.js:116` | decorative stand-in canvas in the map; aria-hidden=true (117) |
| `.skip-menu-foot` | write | `js/66-skip-menu.js:123` | CSS 2 rules |
| `.skip-menu-map` | write | `js/66-skip-menu.js:104` | the small map of the window holding the four buttons + stand-in canvas; CSS 1 rule (grid) |
| `.skip-menu-option` | both | `js/66-skip-menu.js:108`; +2 test/bake files | each region button; read back at 174 (focused() = activeElement.classList.contains); CSS 3 rules |
| `.skip-menu-title` | write | `js/66-skip-menu.js:98` | CSS 1 rule |
| `.slowdown-cell` | write | `js/08a-quality-governor.js:488` | see #slowdownCell |
| `.slowdown-close` | write | `js/08a-quality-governor.js:500` | dismiss x; aria-label 'Dismiss' (502); CSS 2 rules |
| `.snap-collapse` | both | `js/20-mixer-layout.js:9250` | suppresses the .section-body fade on sections swept shut by the accordion; cleared 9250-9251 on the next click, added with 'collapsed' 9264 |
| `.splash-progress` | write | `index.html:523` | static markup; on div; css rules: 3 |
| `.splash-progress-bar` | write | `index.html:524` | static markup; on div; css rules: 1 |
| `.splash-subtitle` | both | `index.html:521`, `js/00a-boot.js:203` | title card word; inline opacity ramp (see .splash-title) |
| `.splash-title` | both | `index.html:520`, `js/00a-boot.js:202` | CARD_RESTING: title card words; style.opacity written per fade frame (218) to resting 1 / 1 / 0.45 for .splash-title / .splash-subtitle / .splash-version |
| `.splash-version` | both | `index.html:214`, `js/00a-boot.js:204` | title card word; inline opacity ramp to 0.45 |
| `.ss-origin-coords` | write | `index.html:1527` | static markup; on div; css rules: 1 |
| `.ss-origin-dot` | write | `index.html:1525` | static markup; on div; css rules: 1 |
| `.ss-origin-frame` | write | `index.html:1524` | static markup; on div; css rules: 1 |
| `.ss-origin-picker` | write | `index.html:1523` | static markup; on div; css rules: 1 |
| `.stat-label` | write | `index.html:589`, `js/08b-jank-monitor.js:229` | x28 in static markup (lines 589, 590, 591, 592, 593, 594, …); on span, label; css rules: 1 |
| `.stat-row` | write | `index.html:589`, `js/08b-jank-monitor.js:229` | x28 in static markup (lines 589, 590, 591, 592, 593, 594, …); on div; css rules: 2 |
| `.stats-close-btn` | write | `index.html:585` | static markup; on button; css rules: 1 |
| `.stats-content` | both | `index.html:586`, `js/08b-jank-monitor.js:224` | stats panel body (static in index.html) that receives .stats-section |
| `.stats-drag-handle` | both | `index.html:583`, `js/08-stats-panel.js:43` | panel drag handle; gets inline cursor:move / user-select:none / touch-action:none from js/10:50-59. CSS css/styles.css:1205 |
| `.stats-header` | write | `index.html:582` | static markup; on div; css rules: 1 |
| `.stats-panel` | both | `index.html:581`; +1 test/bake file | static markup; on div; css rules: 6 |
| `.stats-section` | write | `index.html:587`, `js/08b-jank-monitor.js:227` | x5 in static markup (lines 587, 601, 611, 618, 625); on div; css rules: 2 |
| `.stats-title` | write | `index.html:588`, `js/08b-jank-monitor.js:228` | x5 in static markup (lines 588, 602, 612, 619, 626); on div; css rules: 1 |
| `.stream-format-grid` | both | `js/20-mixer-layout.js:7966`, `js/44-recipes.js:593` | Focus > Format button grid; buttons inside have no class, only data-format-id; .active on them is written by js/21-focus-mode.js:265 and read here 7978 |
| `.stream-format-info` | write | `js/20-mixer-layout.js:7993` | format readout ('Freeform'), handed to focusMode.registerFormatInfo |
| `.stroke-lock-block` | both | `js/20-mixer-layout.js:4667`; +2 test/bake files | Stroke Locks block |
| `.stroke-lock-row` | both | `js/20-mixer-layout.js:4684`; +1 test/bake file | Keep distance / Keep angle rows |
| `.studio-drawer` | both | `index.html:1599`; +1 test/bake file | static markup; on div; css rules: 0 |
| `.studio-tab` | both | `index.html:1603`, `js/28-studio-drawer.js:26` | tab buttons (index.html:1603); read L26 to toggle .active and L109 for click wiring; css/styles.css:963 |
| `.studio-tab-panel` | both | `index.html:1607`, `js/28-studio-drawer.js:28`; +1 test/bake file | tab panels (index.html:1607, #audioDrawerPanel); .active toggled by data-tab; css/styles.css:964-966 |
| `.studio-tabbar` | write | `index.html:1601` | static markup; on div; css rules: 2 |
| `.studio-tabs` | write | `index.html:1602` | static markup; on div; css rules: 1 |
| `.subsection-add-btn` | write | `js/20-mixer-layout.js:3736` | '+ New Path' button |
| `.text-arrange-active` | write | `js/23-text-overlays.js:774` | on body while arrange mode is open (774; removed 825); CSS disables pointer-events on the canvas handles under it |
| `.text-swatch` | write | `js/05k-layers-render.js:481`, `js/20-mixer-layout.js:6398` | full-width colour wells in the Text editor; per the comment css/22-overlays.css overrides the round ::-webkit-color-swatch radius for this class |
| `.titlebar-button` | write | `index.html:533` | x3 in static markup (lines 533, 536, 539); on button; css rules: 4 |
| `.titlebar-drag-region` | write | `index.html:529` | static markup; on div; css rules: 1 |
| `.titlebar-title` | both | `index.html:530`, `js/52-demo-clock.js:358` | the Electron custom titlebar's title (index.html:530, css/styles.css:74): textContent 'Swirl Together Demo' (359) / 'Swirl Together Playtest' (445); x2 |
| `.tour` | write | `js/44-recipes.js:1037` | parked 44: on #recipePill while stepping |
| `.transform-ghost` | write | `js/26-layer-transform.js:398` | on the #layer<N> div during a Transform; CSS forces display/opacity/z-index so a hidden collider is visible while dragged |
| `.transparent-mode` | both | `js/05e-effect-controls.js:305`, `js/05h-slider-bindings.js:51` | on <body> while Transparent Background is on (add L51, remove L55); read by 05e; css 3 rules |
| `.transparent-restart` | write | `index.html:1035` | static markup; on div; css rules: 2 |
| `.transparent-restart-text` | write | `index.html:1036` | static markup; on div; css rules: 1 |
| `.transport-row` | write | `js/20-mixer-layout.js:1535` | #pauseBtn + #freezeBtn side by side |
| `.ui-enter` | both | `index.html:528`, `js/20-mixer-layout.js:55`; +2 test/bake files | web-build entrance start state on #mixer-strip, #sidebar-right, #canvas-area, #custom-titlebar (L55-57); removed L250, L287-290, L310; never added on the desktop window… |
| `.ui-fork-card` | both | `js/43-ui-visibility.js:501` | Simple / Everything card buttons (501, 505); m.querySelectorAll('.ui-fork-card') for focus + choice (527) |
| `.ui-fork-card-desc` | both | `js/43-ui-visibility.js:503`; +1 test/bake file | card description |
| `.ui-fork-card-title` | write | `js/43-ui-visibility.js:502` | card heading |
| `.ui-fork-cards` | write | `js/43-ui-visibility.js:500` | two-card row |
| `.ui-fork-content` | write | `js/43-ui-visibility.js:497` | fork dialog content variant |
| `.ui-fork-foot` | write | `js/43-ui-visibility.js:510` | keyboard hint footer |
| `.ui-fork-modal` | both | `js/43-ui-visibility.js:489`; +1 test/bake file | fork dialog variant class |
| `.ui-hidden` | both | `js/03-recording.js:290`, `js/43-ui-visibility.js:168`, `js/46-strip-more.js:60`, `js/66-skip-menu.js:63`; +4 test/bake files | the hide mechanism (display:none, css/22-overlays.css): contains (168, 254, 260, 286, 622), toggle on items/stacks/dividers/strip (169, 177, 252, 272), add on trailing… |
| `.ui-ready` | write | `js/20-mixer-layout.js:300` | staggered entrance (L300-303: titlebar 100ms, strip 180, canvas 260, sidebar 320); removed L250, L310 |
| `.ui-settled` | both | `js/20-mixer-layout.js:311`; +2 test/bake files | 100ms post-entrance class on the same four elements; removed L316 |
| `.ui-vis-block` | both | `js/43-ui-visibility.js:365`, `js/44-recipes.js:832`, `js/49-hotkey-binds.js:1431`, `js/58-radial-menu.js:928` | Settings -> Interface block root; 49 inserts its Hotkeys block after it; 44 lists it as a pointer row |
| `.ui-vis-group` | write | `js/43-ui-visibility.js:432` | group heading in the list: Top bar / Sidebar / Corner |
| `.ui-vis-list` | both | `js/43-ui-visibility.js:405` | checkbox list folded open in place; written 405, read 425, 474 |
| `.ui-vis-presets` | both | `js/43-ui-visibility.js:374`, `js/44-recipes.js:571` | write (374); read '.ui-vis-presets .ch-text-toggle' (464); 44 targets it |
| `.ui-vis-row` | write | `js/43-ui-visibility.js:437` | 'ui-vis-row' (+ ' is-pinned' for Settings) label row holding the checkbox |
| `.ui-vis-row-hint` | write | `js/43-ui-visibility.js:453` | 'always shown' hint on the pinned row |
| `.ui-vis-row-name` | write | `js/43-ui-visibility.js:448` | item label span |
| `.ui-vis-trigger` | both | `js/43-ui-visibility.js:395`, `js/44-recipes.js:574` | 'ui-vis-trigger btn--block': the Visible sections combo trigger; 44 targets it |
| `.ui-vis-trigger-chev` | write | `js/43-ui-visibility.js:401` | chevron span; 49's isOpener matches '[class*="chev"]' so the trigger is never bindable |
| `.ui-vis-trigger-count` | both | `js/43-ui-visibility.js:400` | 'shown / total' readout; written at 400, read at 472 |
| `.ui-vis-trigger-label` | write | `js/43-ui-visibility.js:399` | 'Visible sections' text span |
| `.user-preset-btn` | both | `js/04b-presets.js:188`, `js/12-save-load.js:2170`, `js/20-mixer-layout.js:1754`, `js/50-look-links.js:984` | load-preset button; className 2170; querySelectorAll('.user-preset-btn, .mixer-user-preset-btn') 2184 toggles active by textContent match (x2); also read by… |
| `.user-preset-delete` | write | `js/12-save-load.js:2212`, `js/20-mixer-layout.js:8584` | delete (U+00D7) button in a preset row |
| `.user-preset-overwrite` | write | `js/12-save-load.js:2192`, `js/20-mixer-layout.js:8565` | overwrite button; text flips to a check mark for 1 s |
| `.user-preset-row` | write | `js/12-save-load.js:2167`, `js/20-mixer-layout.js:8536` | row wrapper (load button + overwrite + delete) appended to #userPresetsList, one per saved preset |
| `.user-presets-list` | write | `index.html:1372`, `js/20-mixer-layout.js:8414` | on #sidebarPresetList |
| `.value-display` | both | `index.html:731`, `js/05f-kaleido-controls.js:252`, `js/06-slider-updater.js:180`, `js/20-mixer-layout.js:2966`, `js/30-audio-scenes.js:915`, `js/40-audio-timing.js:1530`; +1 more; +2 test/bake files | readout spans inside slider labels: #audioSensValue 7720, #audioBeatValue 7737, #audioKaleidoSpinValue 7776 |
| `.vertical` | write | `index.html:1251` | static markup; on div; css rules: 0 |
| `.visible` | write | `js/21-focus-mode.js:61` | on #focus-mode-hint; CSS 22-overlays:96 '#focus-mode-hint.visible { display:block }' (generic name, 2 rules in css/) |
| `.web-mode` | write | `js/00-window-controls.js:16` | platform tag on <body> in a browser; CSS css/styles.css:39-40 hides #custom-titlebar and the resize handles (4 rules) |
| `.wide` | write | `js/44-recipes.js:893` | parked 44: on #recipeGuide when the target is the canvas (ring hidden) |
| `.window-controls` | write | `index.html:532` | static markup; on div; css rules: 1 |
| `.window-resize-corner` | both | `index.html:549`, `js/00-window-controls.js:31` | x4 in static markup (lines 549, 550, 551, 552); on div; css rules: 5 |
| `.window-resize-edge` | both | `index.html:545`, `js/00-window-controls.js:31` | x4 in static markup (lines 545, 546, 547, 548); on div; css rules: 5 |
| `.zoom-mode` | both | `js/35-zoom-view.js:195`, `js/44-recipes.js:460`; +2 test/bake files | body state class for Zoom Mode; no rule in css/; read by js/44-recipes.js:460, 462 (bodyClass / noBodyClass until-conditions) and by… |

## Data attributes

Attribute names. `data-ui-key` / `data-ui-label` *values* are also contract (see Text keys). The CSS prep's `data-ui` identity attribute is a different name and must stay different.

69 selectors.

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `data-accent` | write | `js/20-mixer-layout.js:1130` | per-cell colour accent, a CSS hook: orange\|blue\|purple\|green\|yellow\|pink\|cyan from faderChannel calls L815-853; pink on the colour cell L1206 |
| `data-act` | both | `js/44-recipes.js:1294` | parked 44: 'show' \| 'demo' on detail buttons (1294-1295); read by delegated click (1231-1232) |
| `data-action` | both | `js/24-path-layers.js:587`, `js/49-hotkey-binds.js:619` | values create (587), rename, toggle-visibility, toggle-play, collapse, delete, speed, brush, flow, color, use-brush, mode, draw, transform, clear-paths (604-656) on the… |
| `data-active-tab` | write | `index.html:1599`, `js/28-studio-drawer.js:25` | 'audio' on #recDrawer (authored index.html:1599); nothing in css/ or js/ reads it |
| `data-anim-name` | write | `js/20-mixer-layout.js:3875` | recording name on the slot button |
| `data-brush-mode` | both | `js/05g-arm-colors.js:1034`, `js/20-mixer-layout.js:1253`; +1 test/bake file | colour-mode chips: one\|rnd\|step; read by js/05g-arm-colors.js:1034 querySelectorAll('[data-brush-mode]') to reflect the arm-0 mode onto .active |
| `data-choice` | both | `js/43-ui-visibility.js:501` | 'simple'\|'full' on each card (501, 505); read on Enter/Space and click (549, 555) |
| `data-cinv` | write | `js/05k-layers-render.js:457` | layer index on .collision-invert-cb; no reader found in js/, css/, scripts/test |
| `data-collision` | both | `js/05k-layers-render.js:372`, `js/44-recipes.js:93`; +1 test/bake file | marks a collider row; comment says js/44-recipes layerRows reads it (confirmed by grep) |
| `data-collision-layer` | write | `js/05k-layers-render.js:447` | layer index on .collision-controls; no reader found in js/, css/, scripts/test |
| `data-cref` | write | `js/05k-layers-render.js:468` | layer index on .collision-refresh-btn; no reader found in js/, css/, scripts/test |
| `data-dir` | both | `js/04g-hover-capture.js:57`, `js/40-audio-timing.js:848` | resize direction on each .atv-rz (n, s, e, w, ne, nw, se, sw); read L952 on pointerdown; the same attribute name js/04g-hover-capture.js:57-71 puts on its .cap-rz handles |
| `data-direction` | both | `js/05l-layers-transform.js:461` | nw..w on each resize handle (461); read 507 in handleLayerResizeStart |
| `data-draggable-init` | both | `js/04g-hover-capture.js:83` | guard so Draggable is attached to #captureArea once; no CSS |
| `data-drop-position` | both | `js/05k-layers-render.js:260` | 'top' \| 'bottom' on the two .drop-zone divs (260, 685); read 856 in handleDropZoneDrop |
| `data-err-key` | both | `index.html:155` | dedupes identical error cards (title\|message) |
| `data-export-clock` | both | `js/24-video-export.js:1860` | badge text on #canvas-area ('VIDEO 0:04 / 0:15'), written when it changes L1860, removed L1853 when not capturing; CSS prints it with attr(data-export-clock)… |
| `data-format-id` | both | `js/20-mixer-layout.js:7976`, `js/21-focus-mode.js:265` | on the Focus > Format buttons, value = focusMode.FORMATS[i].id; read by js/21-focus-mode.js:265 to set .active |
| `data-fx` | both | `js/20-mixer-layout.js:4418`; +1 test/bake file | effect key on .fx-row (read 4418 guard, write 4420); values light-source\|light-shift\|glow\|scatter\|shading\|gravity\|border\|breathing\|dither; same key names… |
| `data-gen` | write | `js/20-mixer-layout.js:7865` | on .ar-pattern-btn: center\|random\|circular\|grid\|spiral\|radialBurst\|freqMap; no reader found in js/ or css/ (tiles are keyed in the patBtns map instead) |
| `data-group` | both | `index.html:1560`, `js/01-config.js:480`, `js/03-recording.js:316`, `js/05e-effect-controls.js:241`, `js/06e-mp-panel.js:779`, `js/08a-quality-governor.js:491`; +17 more | OVERLOADED: 'core' (43's UI group taxonomy core\|expressive\|system) on .arm-tip-menu L718, #mixer-strip L808, .mixer-presets-panel L1777, .preset-menu L1906; but the… |
| `data-guide` | both | `js/47-pen-window.js:1424`; +1 test/bake file | pen window: on each Guides-menu checkbox (kaleido / mandala / strokeLock); nothing reads it back (write-only, for tests) |
| `data-hex` | both | `js/01-config.js:893`, `js/64-colour-picker.js:740`; +1 test/bake file | uppercase #RRGGBB on .palette-chip-wrap; the key every ring/flash/focus-restore matches on; css rules: 0 |
| `data-hk-mod` | write | `js/17-hotkey-reminder.js:150` | modifier combo the cap belongs to ('ctrl','alt','ctrlshift','altshift','ctrlalt'); 'lit' is applied by JS, not by this attr |
| `data-id` | both | `js/24-path-layers.js:597`, `js/44-recipes.js:1262` | numeric path-layer id on each .path-layer-item; read by dataset.id 731, 737, 805, 838 and selectors 251, 464 (x7); no CSS |
| `data-index` | both | `js/01-config.js:600`, `js/20-mixer-layout.js:3178`, `js/44-recipes.js:1262`, `js/65-palette-from-image.js:623` | on .pfi-swatch: its position in the extracted set. Write-only: nothing in js/ or css/ reads it (js/01-config.js uses the same attribute name on .palette-option, a… |
| `data-injected` | both | `js/05h-slider-bindings.js:244` | marks the <option> setResolutionDropdown creates (L246-250) for a non-preset resolution; replaced on the next call; css has no rule |
| `data-installed` | both | `js/20-mixer-layout.js:6677` | marks the 'Installed' <optgroup> of #textOverlayFont so later fonts land in it |
| `data-key` | both | `js/06e-mp-panel.js:421` | render cache on #mpActivity: 'who\|name\|names' (421-422) so an unchanged line is not rebuilt; no stylesheet reads it |
| `data-layer` | both | `js/05k-layers-render.js:387` | layer index on .layer-mask-check; read 613 -> toggleImageLayerMask |
| `data-layer-index` | both | `js/05k-layers-render.js:310`, `js/05l-layers-transform.js:462`, `js/23-depth-collision.js:1165`, `js/49-hotkey-binds.js:164`; +1 test/bake file | layer.index on each non-Sim row; read by attribute selector 82, 237 and dataset 596, 628; also read by js/05l, js/23, js/44, js/49 and scripts/test/inventory/params.json |
| `data-layer-type` | write | `js/05k-layers-render.js:293` | marks the Sim Layer row; css/22-overlays.css styles [data-layer-type] |
| `data-level` | write | `js/08a-quality-governor.js:545` | on #slowdownCell; no css/ rule reads it (write-only) |
| `data-lock-group` | both | `js/20-mixer-layout.js:3039` | on .mutation-lock-cb; values colors\|kaleido\|simulation\|effects\|audio; read 3115. x2 |
| `data-mirror` | write | `js/20-mixer-layout.js:8707` | on #multiplierValue: the mirror axis glyph while the left mouse button mirrors; drawn by css/20-mixer-strip.css:891 '#multiplierValue[data-mirror]::after { content:… |
| `data-mode` | both | `js/12-save-load.js:1305`, `js/20-mixer-layout.js:5047` | 'stroke' / 'time' on the Replay Mode buttons (5047, 5053), the only .brush-mode-btns in this slice that carry it; js/12-save-load.js:1305 queries… |
| `data-native-picker` | read | `js/64-colour-picker.js:725` | opt-out: an input[type=color] carrying it keeps the browser's own dialog (the delegated click handler 722-728 intercepts every other colour well). No element in… |
| `data-no-row-drag` | read | `js/06-slider-updater.js:235` | opt-out of full-row pointer forwarding (independent of data-no-scale) |
| `data-no-scale` | both | `js/06-slider-updater.js:68`, `js/15-layer-masking.js:192`, `js/20-mixer-layout.js:1074`, `js/40-audio-timing.js:1537`, `js/40b-audio-cue-editor.js:720` | data-no-scale="1" on #colliderSize, #filterThreshold (254), #touchUpSize (290), #maskFeatherSlider (304); read by js/06-slider-updater / js/20 (not this slice) |
| `data-order-index` | both | `js/05k-layers-render.js:289` | row's position in layerOrder; read 821, 822, 857 to reorder on drop |
| `data-overlay-id` | both | `js/23-text-overlays.js:299`; +1 test/bake file | one div per text line inside #text-overlay-container; written 299, queried 293 (replace on re-render) and 349 (getEl). All typography is inline style (styleTextEl… |
| `data-owns-keys` | both | `js/01-config.js:483`, `js/01a-param-registry.js:496`, `js/40b-audio-cue-editor.js:744`, `js/64-colour-picker.js:201` | '' on .ace-canvas so Delete, arrows, Space and 1-8 stay in the editor; read by js/01a-param-registry.js:496 via closest('[data-owns-keys]'); also written by… |
| `data-palette-drop` | both | `index.html:649`, `js/32-file-drop.js:55` | div=""; static markup; on div; css rules: 0 |
| `data-path` | write | `js/20-mixer-layout.js:1954` | .preset-fork-btn answers: ours\|own |
| `data-peer` | both | `js/06e-mp-panel.js:164`, `js/20-mixer-layout.js:6585` | on .mp-owner-dot of a room text line; js/06e-mp-panel.js:164 reads dots[i].dataset.peer to repaint the dot in the peer's colour |
| `data-peer-line` | both | `js/23-text-overlays.js:2331`; +1 test/bake file | on a room-mate's text line div (same container, same inline styling via styleTextEl 2336, placed by placePeerLine 2350-2364). Write-only: nothing in js/ or css/ queries… |
| `data-pillar` | both | `js/44-recipes.js:1197` | parked 44: '' \| pillar key on chips (1197, 1201); read to filter (1206-1207, 1348) |
| `data-pop-close` | both | `js/06e-mp-panel.js:877`, `js/54-phone-pads.js:293` | pressing the phone row closes #mpInvitePop (js/06e-mp-panel.js:877 reads it); no stylesheet rule |
| `data-preset` | both | `index.html:1359`, `js/04b-presets.js:222`, `js/20-mixer-layout.js:1803`, `js/43-ui-visibility.js:381`; +1 test/bake file | built-in preset key (index.html:1359-): read L1803 (falls back to lowercased label), normalised back L1804; js/04b updatePresetButtons highlights .mixer-preset-btn by… |
| `data-raster` | both | `js/05k-layers-render.js:316`, `js/05l-layers-transform.js:824`, `js/44-recipes.js:95` | marks a paint (GPU raster) layer row; read by js/05l:824 '.layer-item[data-raster="1"]' and js/44; css/styles.css styles it |
| `data-rec-count` | both | `js/03-recording.js:1131` | countdown digit on #canvas-area ('3', '2', '1'); CSS prints it with attr(data-rec-count) (css/styles.css:1036) |
| `data-recipe` | both | `js/44-recipes.js:1101` | parked 44: need-gap button carries the recipe id to open (1101); read by the note's delegated click (1012-1013) |
| `data-region` | both | `js/66-skip-menu.js:109`; +1 test/bake file | region key on each option button; read back from document.activeElement (174); no CSS uses it |
| `data-resize` | both | `index.html:545`, `js/00-window-controls.js:98` | div="n"; div="e"; div="s"; div="w"; div="nw"; div="ne"; x8 in static markup (lines 545, 546, 547, 548, 549, 550, …); on div; css rules: 0 |
| `data-shape` | both | `js/15-layer-masking.js:224`, `js/24-path-layers.js:644` | values circle, rectangle, triangle, star, heart, infinity, spiral, wave on .path-shape-btn (644-651); read 726, 740; no CSS |
| `data-slider-active` | both | `js/05k-layers-render.js:142` | set on the row while one of its faders is held (142), deleted on release (143); read 768 to refuse a dragstart |
| `data-src` | both | `js/20-mixer-layout.js:3682` | on .collision-source-menu buttons: image\|snapshot; event delegation reads it (3699). x2 |
| `data-stay` | both | `js/06e-mp-panel.js:873`, `js/61-room-report.js:173` | keeps #mpRoomMenu open after the press so 'Copied' can be read (js/06e-mp-panel.js:873 reads it) |
| `data-step` | both | `js/15-layer-masking.js:159`, `js/49-hotkey-binds.js:875`; +2 test/bake files | 1 \| 2 \| 3 on .mask-wizard-step (159, 163, 167); read 411, 2975; css/22-overlays.css also keys on it |
| `data-tab` | both | `index.html:1603`, `js/28-studio-drawer.js:27`; +1 test/bake file | button[type=button]="audio"; #audioDrawerPanel="audio"; x2 in static markup (lines 1603, 1607); on button[type=button], div; css rules: 1 |
| `data-tip` | both | `js/20-mixer-layout.js:4802`; +1 test/bake file | tip index on .brush-tip-btn glyphs: written 4802 (alt picker), 6003 (Brush panel); read 4992, 5986 to light the active glyph; x4 |
| `data-tone` | both | `js/48-hotkeys.js:621`, `js/58-radial-menu.js:938`; +1 test/bake file | on the add-row note div (897). The div gets .hk-picker-note from js/48:601 (H.picker noteEl), so css/22-overlays.css:1154 '.hk-picker-note[data-tone="warn"]' colours it |
| `data-tool` | both | `js/15-layer-masking.js:210` | filter \| magic \| stamps on .mask-tool-tab; read 2547 to set the active tab |
| `data-ui-key` | both | `js/20-mixer-layout.js:1133`, `js/43-ui-visibility.js:134`, `js/44-recipes.js:707`, `js/46-strip-more.js:67`, `js/49-hotkey-binds.js:298`; +2 test/bake files | show/hide key read by js/43 (stored as 'strip:' + key), parked by js/46, bound by js/49; set on every strip cell: faderChannel L1133 (Brush Size, Fluid, Viscosity,… |
| `data-ui-label` | both | `js/20-mixer-layout.js:1155`, `js/43-ui-visibility.js:138`, `js/44-recipes.js:734`, `js/46-strip-more.js:84`, `js/49-hotkey-binds.js:298` | display name 43/46/49 print instead of the key when set: 'Material Type' on the Fluid cell L1155, 'Laminar / Blend' on Color Blend L1166 (CHANNEL_NAMES) |
| `data-value` | both | `js/20-mixer-layout.js:2832` | option value on .qub-dd-opt; read on Enter/Space (2897). x2 |
| `data-variant` | write | `js/64-colour-picker.js:198` | on .cp: 'inline' (under the palette, 816) or 'popover' (629); css/23-colour-picker.css styles [data-variant] |
| `data-vis` | both | `js/05k-layers-render.js:62` | 'sim' or the layer index on .layer-vis-check; read 582 in the change handler |
| `data-wired` | both | `js/20-mixer-layout.js:4204` | idempotence guard on .pressure-pad (read 4204, write '1' 4205). x2 |

## ARIA state attributes script toggles

The hooks CSS prep step 4 styles through (`[aria-pressed="true"]`, `[aria-expanded="true"]`, `[aria-checked="true"]`, `[aria-disabled="true"]`, `[aria-selected]`, `[aria-current]`, `[hidden]`…). One row per place script writes or reads the attribute, with the element it goes on.

12 selectors, 77 tier-1 references.

### `aria-checked` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1478` | write | html aria-checked= | #lockRoomBtn="false"; static markup; on button[type=button]; css rules: 1 |
| `js/06e-mp-panel.js:574` | write | setAttribute | state: #lockRoomBtn (role=menuitemcheckbox) mirrors roomLocked on every updateConnectedView; css/21-sidebar.css:1326 styles [aria-checked="true"] as the tick |
| `js/20-mixer-layout.js:5817` | write | setAttribute | on the Paint Into radio buttons (Fluid / Pressure / Collider), mirrors .active in syncBrushMode; a candidate for CSS prep step 4 |
| `js/20-mixer-layout.js:8942` | write | setAttribute | state hook: 'true'/'false' on .arm-mode-btn (role=radio) 8942 and .arm-push-btn (role=checkbox) 8947, written together with .active in paintRow |

### `aria-current` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/01-config.js:982` | both | setAttribute/removeAttribute (982-983) + querySelector(".palette-chip[… | on .palette-chip: the colour the next stroke paints; the Tab stop follows it; pairs with .is-active on the wrap; css rules: 0 |
| `js/66-skip-menu.js:163` | write | setAttribute('aria-current','location') / removeAttribute | marks the region focus came from ('you are here') |

### `aria-disabled` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/66-skip-menu.js:161` | both | setAttribute / getAttribute | "true" on a region button whose region has nothing to focus (refresh 155-166, also tabIndex -1); read at 169 enabled(). The state hook CSS prep step 4 would style |

### `aria-expanded` — both (+6 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1430` | write | html aria-expanded= | #mpInviteBtn="false"; #mpMenuBtn="false"; x2 in static markup (lines 1430, 1431); on button[type=button]; css rules: 2 |
| `js/01-config.js:441` | write | setAttribute (441, 487, 512) | on #paletteSelect (combobox): true while .palette-list is mounted; pairs with class .open; css rules: 2 |
| `js/06e-mp-panel.js:803` | write | setAttribute | state: #mpInviteBtn / #mpMenuBtn 'true' while their popover is open (803), 'false' on close (825); .active is toggled beside it |
| `js/20-mixer-layout.js:2236` | write | setAttribute | state. #mixerPresetsTrigger: 'false' L2236, 'true' L2240 (openPanel), 'false' L2256 (closePanel); the .mixer-presets-panel itself carries no state attribute (inline display only) |
| `js/20-mixer-layout.js:2476` | write | setAttribute | .lsb-toggle (2476, 'true' while the bar is open), .rsb-toggle (2592), .qub-dd-btn (2807, 2846, 2853), .anim-lib-head (3920, 3927). x7 |
| `js/20-mixer-layout.js:5952` | write | setAttribute | on .brush-fold-head (Tip fold, 5952; mirrors .brush-fold.collapsed) and on #textOverlayClearAll (7035 init, 7093 open, 7105 close; the box itself is shown by inline display, no class); x4 |
| `js/20-mixer-layout.js:9330` | write | setAttribute | state hook on .section-title (role=button): initial 9330, then kept equal to !.collapsed by a MutationObserver on the section's class 9343-9350 |
| `js/43-ui-visibility.js:396` | write | setAttribute | .ui-vis-trigger 'false' at build (396), toggled with the list (412) |
| `js/46-strip-more.js:211` | write | setAttribute | #mixerMoreBtn 'true' on open (211), 'false' on close (229) and at build (253) |
| `js/47-pen-window.js:1457` | write | setAttribute | pen window: on #guidesBtn as the Guides menu opens / closes |
| `js/49-hotkey-binds.js:622` | both | hasAttribute/setAttribute | read: any control carrying aria-expanded or aria-haspopup is an opener (622); write: .hk-list-trigger (1403, 1440) |
| `js/64-colour-picker.js:746` | write | setAttribute | on #paletteAddChip: 'true' while the inline add picker is open under the palette, else 'false' |

### `aria-hidden` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:304` | write | html aria-hidden= | span="true"; static markup; on span; css rules: 0 |
| `js/01-config.js:448` | write | setAttribute | on .palette-select-chev (decorative chevron) |
| `js/05k-layers-render.js:44` | write | innerHTML template | aria-hidden="true" on the trash SVG (44) and the .layer-collapse-caret span (54); static, never toggled |
| `js/06-slider-updater.js:51` | write | setAttribute | 'true' on every .fader-scale |
| `js/20-mixer-layout.js:2751` | write | setAttribute | 'true' on hidden native state-holders: #mutationScope via hideMirror (2751), the quality <select> inside .qub-dd (2813). x2 |
| `js/20-mixer-layout.js:5939` | write | innerHTML | decorative: the .brush-fold-chev span (5939) and the alignment-icon <svg> (6747); x2 |
| `js/26-layer-transform.js:405` | write | innerHTML template | aria-hidden="true" on .lt-veil; static |
| `js/40-audio-timing.js:851` | write | innerHTML template | 'true' on the .atv-grip glyph in the panel head |
| `js/44-recipes.js:864` | write | innerHTML | parked 44: pointer svg (864), slash glyph (1175) |
| `js/46-strip-more.js:127` | write | setAttribute | 'true' on the probe clone (127) and on the chevron span (258) |
| `js/47-pen-window.js:320` | write | markup attribute | pen window: aria-hidden=true on the three guide svgs |
| `js/56-stroke-lock.js:523` | write | setAttribute | #strokeLockGuide is decorative |
| `js/63-kaleido-guides.js:275` | write | setAttribute | 'true' on #kaleidoGuides (decorative overlay) |
| `js/64-colour-picker.js:938` | write | setAttribute / innerHTML template | 'true' on .cp-loupe 938 (visual only) and inside PIPETTE_SVG 180 (the eyedropper icon) (x2) |
| `js/66-skip-menu.js:117` | write | setAttribute | on .skip-menu-canvas (decorative) |

### `aria-pressed` — both (+3 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1450` | write | html aria-pressed= | #shareModeCode="true"; #shareModeQr="false"; #shareModeHidden="false"; x3 in static markup (lines 1450, 1451, 1452); on button[type=button]; css rules: 6 |
| `js/03-recording.js:1109` | write | setAttribute | 'true'/'false' on the four #recLen* chips (L1109) and #recSrcMe / #recSrcAll (L1115); CSS styles button[aria-pressed=true] (css/01-buttons.css:148) |
| `js/04b-presets.js:264` | write | setAttribute | 'true' while frozen, 'false' otherwise, on #freezeBtn (seeded by js/20:1551) |
| `js/04f-canvas-actions.js:70` | write | setAttribute | 'true' / 'false' on #pauseBtn, kept in step with class active (like Stop beside it) |
| `js/05g-arm-colors.js:1041` | write | setAttribute | 'true' \| 'false' on each [data-brush-mode] chip, kept equal to .active |
| `js/06e-mp-panel.js:663` | write | setAttribute | state: #shareModeCode / #shareModeQr / #shareModeHidden, exactly one 'true' (renderShareMode); css/01-buttons.css:148 styles [aria-pressed="true"] |
| `js/20-mixer-layout.js:1254` | write | setAttribute | state. Colour-mode chips .ch-text-toggle[data-brush-mode] (seeded at build L1254 only); .ch-ignite-lock (L1490, kept in step with .latched by a MutationObserver L1499); #pauseBtn L1542 and #freezeBtn L1551 (seeded from… |
| `js/20-mixer-layout.js:3887` | write | setAttribute | 'true'\|'false' on the .anim-slot button: the playing state and its styling (comment at 3886) |
| `js/40b-audio-cue-editor.js:663` | write | setAttribute | 'true'/'false' on the Follow toolbar button, mirrored from .active; the Attacks/Texture buttons get .active only |
| `js/44-recipes.js:83` | read | getAttribute | parked 44: isActive() treats aria-pressed='true' as on |
| `js/48-hotkeys.js:634` | write | setAttribute | 'true' on .hk-picker-key while listening, else 'false' |
| `js/54-phone-pads.js:423` | write | setAttribute / innerHTML template | state: #phonePadWayMouse / #phonePadWayArtist, one 'true' (341-342 defaults, 423-424 on every render); css/01-buttons.css:148 |
| `js/64-colour-picker.js:500` | write | setAttribute | on .cp-drop: 'true' while the eyedropper is sampling (500), 'false' when it ends (496) |

### `aria-selected` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/01-config.js:603` | write | setAttribute | on .palette-option (role=option): the palette in use; pairs with class .active; css rules: 0 |
| `js/20-mixer-layout.js:2830` | write | setAttribute | 'true'\|'false' on .qub-dd-opt (also mirrored by the .sel class) |
| `js/44-recipes.js:1274` | write | setAttribute | parked 44: 'true' on the highlighted .recipe-row |

### `aria-valuemax` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/64-colour-picker.js:414` | write | setAttribute | on .cp-track (role=slider), per colour-space channel |

### `aria-valuemin` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/64-colour-picker.js:413` | write | setAttribute | on .cp-track (role=slider), per colour-space channel |

### `aria-valuenow` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/64-colour-picker.js:415` | write | setAttribute | on .cp-track: current channel value, rewritten on every paint() |

### `aria-valuetext` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:1047` | write | setAttribute | bar fader inputs (canonical or .ch-perceptual proxy): mirrors the .ch-value readout text through a MutationObserver (nameFader L1040-1051) |
| `js/64-colour-picker.js:416` | write | setAttribute | on .cp-track: channel key + shown value |

### `hidden` — both (+20 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:406` | write | html hidden + el.hidden = (406, 508, 514) | #paletteExtractHost; #paletteNote; #palettePickerHost; #transparentRestartRow; #mpInvitePop; #mpRoomMenu; x6 in static markup (lines 652, 656, 657, 1035, 1445, 1477); on div; css rules: 29 \|\| on #photoWarn; inline CSS… |
| `js/00b-dialog-focus.js:277` | read | el.hidden | #photoWarn's hidden attribute decides whether it is up |
| `js/01-config.js:712` | write | el.hidden = (712, 716) | on #paletteNote: shown for 2.6s with a note about the colour row |
| `js/05h-slider-bindings.js:62` | write | .hidden = | on #transparentRestartRow: shown only when Electron, mode on, and the window was not built transparent |
| `js/06e-mp-panel.js:801` | write | pop.hidden = false / true | state: the open/closed state of #mpInvitePop and #mpRoomMenu (801, 824); the only attribute-based visibility in the room panel (everything else is inline display); js/44-recipes.js:745 reads !p.hidden |
| `js/08a-quality-governor.js:492` | write | el.hidden | #slowdownCell shown only while a slowdown level is live (542) |
| `js/20-mixer-layout.js:1690` | write | el.hidden = | HTML hidden attribute (listed with ARIA state per brief) on #presetPathToast: false L1690 (show), true L1692 (3.2s later) |
| `js/40b-audio-cue-editor.js:597` | write | el.hidden = | boolean hidden on .ace-match: true at mount (L706), !box on every paintMatch (L597); CSS hooks it as .ace-match[hidden] (css/21-sidebar.css:1966) |
| `js/43-ui-visibility.js:406` | both | el.hidden | HTML hidden attribute (brief lists it with ARIA state): .ui-vis-list open/closed (406, 410-411, 475); read on #photoWarn to wait for the PhotoSafe answer (602) |
| `js/44-recipes.js:989` | write | innerHTML/el.hidden | parked 44: pill step/key/note/demo/next/again (989-990, 1023-1035, 1053) |
| `js/47-pen-window.js:278` | both | popup <style> '[hidden]{display:none!important}' + el.hidden | pen window: #blank (319 markup), #mirror, #guidesMenu (339) shown / hidden through the attribute (1456, 1537-1538, 1569-1570, 1586-1587); guidesMenuOpen() reads it (1445) |
| `js/48-hotkeys.js:620` | write | el.hidden | HTML hidden attribute: note hidden when empty (620); clear button hidden while listening / empty / clearable:false (645) |
| `js/49-hotkey-binds.js:1420` | write | el.hidden | HTML hidden attribute, x14: .hk-list (1420, 1439), list note (1426), #hkWheel (571, 574), #hkToast (1566, 1568), hover/chosen outline + tag (696, 701-702, 1040-1041, 1093, 1312-1313), bar note (752, 1096, 1153), action… |
| `js/51-open-in-desktop.js:248` | read | pw.hidden | PhotoSafe dialog open state read by the wait loop |
| `js/52-demo-clock.js:177` | both | el.hidden = / pw.hidden | state: #demoClock gone when left alone (177); #demoWishlistQuiet (203 template, 248, 313); read on #photoWarn (334) |
| `js/54-phone-pads.js:454` | write | el.hidden = / innerHTML template | state: #phonePadBody (454), #phonePadReveal (458), #phonePadStatus (491), #phonePadNote (354, 494), #phonePadUnlock (357, 496), #phonePadStop (356, 497) |
| `js/58-radial-menu.js:535` | write | el.hidden | #radialMenu (535 open / 684 close), #radialNote (408/410), the Settings note (937), .radial-reset (1037 when the list equals the defaults) |
| `js/59-brush-type-key.js:85` | write | el.hidden | .bt-hint (85), #brushTypePill (86, 90), and js/49's #hkToast forced hidden while the pill shows (88) |
| `js/60-reset-app.js:303` | both | el.hidden = / .hidden | state: #resetAppDefaultsRow (266 template, 294 read, 303 write), #resetAppHint while the button has no box (357-358); read on #photoWarn (425) |
| `js/64-colour-picker.js:67` | write | el.hidden = (HTML hidden attribute) | .cp-toast 67 / 69, .cp-gamut 236 / 423, #palettePickerHost 834 / 854, .cp-loupe 952 / 977 / 980; the picker shows and hides through [hidden], not display (x9) |
| `js/65-palette-from-image.js:516` | write | el.hidden = (HTML hidden attribute) | #paletteExtractHost shown 516 / 543 and hidden 718; the one-off file input is created hidden 346 (x4) |
| `js/66-skip-menu.js:54` | read | n.hidden / n.inert | shown(): any hidden or inert ancestor up to the region root disqualifies a control |

## ARIA names, relationships and roles script writes

Not state: labels, `aria-labelledby`/`aria-describedby`/`aria-controls` id references (both ids are contract), live regions, modal flags and `role`. Listed because the accessibility baseline depends on them; they are not styling hooks.

32 selectors, 150 tier-1 references.

### `aria-controls` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1430` | write | html aria-controls= | #mpInviteBtn -> #mpInvitePop; #mpMenuBtn -> #mpRoomMenu; x2 in static markup (lines 1430, 1431); on button[type=button]; css rules: 0 |
| `js/20-mixer-layout.js:2808` | write | setAttribute | .qub-dd-btn -> #<selectId>DdList |
| `js/20-mixer-layout.js:5945` | write | setAttribute | id references: .brush-fold-head -> brushTipFoldBody (5945), #textOverlayClearAll -> textOverlayClearAsk (7036); x2 |
| `js/46-strip-more.js:254` | write | setAttribute | #mixerMoreBtn -> 'mixer-more-panel' (id reference) |

### `aria-describedby` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:302` | write | html aria-describedby= | #photoWarn -> #pwDesc; static markup; on div; css rules: 0 |
| `js/05e-effect-controls.js:245` | write | setAttribute | points at #photoSafeOffMsg (id reference) |
| `js/52-demo-clock.js:197` | write | setAttribute | -> #demoWishlistMsg |
| `js/60-reset-app.js:259` | write | setAttribute | -> #resetAppMsg |
| `js/66-skip-menu.js:94` | write | setAttribute | nav#skipMenu -> #skipMenuFoot |

### `aria-haspopup` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1430` | write | html aria-haspopup= | #mpInviteBtn="dialog"; #mpMenuBtn="menu"; x2 in static markup (lines 1430, 1431); on button[type=button]; css rules: 0 |
| `js/01-config.js:440` | write | setAttribute | "listbox" on #paletteSelect (not state; name/role group) |
| `js/20-mixer-layout.js:2235` | write | setAttribute | #mixerPresetsTrigger 'true' |
| `js/20-mixer-layout.js:2806` | write | setAttribute | 'listbox' on .qub-dd-btn |
| `js/20-mixer-layout.js:8901` | write | setAttribute | ='menu' on .arm-tip-btn |
| `js/46-strip-more.js:252` | write | setAttribute | 'true' on #mixerMoreBtn (49 treats aria-haspopup holders as openers) |
| `js/47-pen-window.js:331` | write | markup attribute | pen window: #guidesBtn |
| `js/49-hotkey-binds.js:622` | read | hasAttribute | isOpener() |

### `aria-label` — both (+4 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1070` | write | html aria-label= | #brushGhostOpacity="Brush ghost opacity"; #ditherPad="Pattern pad, 16 by 16 squares. Arrow key"; #joinRoomInput="Room code to join"; #mpMenuBtn="Room options"; #mpInvitePop="Invite"; div="How to share this room"; x10 in… |
| `js/00b-dialog-focus.js:116` | read | hasAttribute | a dialog that already names itself is left alone |
| `js/01-config.js:388` | write | setAttribute (388, 442, 479, 901) | names, not state: "Palette name" (rename input), "Palette" (trigger), "Palettes" (list), the hex on each chip |
| `js/05k-layers-render.js:52` | write | innerHTML template | aria-label="Delete layer" on .layer-head-delete (52); aria-label="Collider color" on .collider-colour-input (481) |
| `js/06e-mp-panel.js:510` | write | setAttribute | name, not state: #mpInviteBtn 'Sync phone' \| 'Invite' (the visible text carries a ▾) |
| `js/08a-quality-governor.js:502` | write | setAttribute | 'Dismiss' on the x button |
| `js/15-layer-masking.js:153` | write | innerHTML template | aria-label="Close" on .mask-close-btn |
| `js/20-mixer-layout.js:673` | both | setAttribute / getAttribute | name, not state. Writes: arm tip square L673 ('Brush N tip: ...'), bar fader inputs L1042 (channel name; only when getAttribute('aria-label') L1041 is empty and no <label> is associated), .ch-seg-switch L1265 ('Color of… |
| `js/20-mixer-layout.js:2475` | write | setAttribute | .lsb-toggle (2475), .rsb-toggle (2591), .anim-lib-rename-input 'New name' (4054), .fx-thumb 'Preview <label>' (4431). x4 |
| `js/20-mixer-layout.js:5718` | write | setAttribute | names, not state: radiogroup 'Paint Type (Fluid / Pressure / Collider)' (5718), #textOverlayClearAsk 'Clear all text?' (7042); x2 |
| `js/20-mixer-layout.js:8873` | write | setAttribute | 'Arm N color' on input.arm-picker 8873 and on .arm-mode-wrap (role=radiogroup) 8890 |
| `js/26-layer-transform.js:409` | write | innerHTML template | aria-label="Moving layer" on the transform .draw-toolbar |
| `js/40b-audio-cue-editor.js:745` | write | setAttribute | set to '' (empty string) on the focusable .ace-canvas; see open items |
| `js/44-recipes.js:1176` | write | innerHTML | parked 44: search (1176), close (1178), Topics (1180), Recipes (1182) |
| `js/46-strip-more.js:182` | write | setAttribute | moreBtn 'More: <names>' (182); panel 'More faders' (279) |
| `js/47-pen-window.js:339` | write | markup attribute | pen window: 'Guides' on #guidesMenu |
| `js/48-hotkeys.js:596` | write | setAttribute | 'Remove this hotkey' on the clear button |
| `js/49-hotkey-binds.js:193` | both | getAttribute/setAttribute | read: part of the persisted signature (193) and nameOf (310); write: bar 'Bind a hotkey' (740), row delete button (1548) |
| `js/52-demo-clock.js:183` | write | setAttribute | name, not state: the clock button 'Demo time left, m:ss. Wishlist Swirl Together on Steam.' |
| `js/54-phone-pads.js:451` | write | setAttribute / innerHTML template | name, not state: #phonePadQr 'QR code hidden' \| 'QR code: opens …' (451-452); .phone-pad-ways 'How the phone paints' (340) |
| `js/58-radial-menu.js:472` | write | setAttribute | 'Radial menu' on #radialMenu (472); 'Label for a new key item' on .radial-add-label (896); per-row delete name on .hk-row-del (1034) |
| `js/64-colour-picker.js:214` | both | setAttribute / getAttribute | written on .cp-hex 214, .cp-space 219, .cp-drop 230, .cp-track 412 (channel name), .cp-pal-select 550, .cp-pop 619, .cp-pop-close 625; read from the opening input 530 to title the popover (x8) |
| `js/65-palette-from-image.js:442` | write | setAttribute | on .pfi 442 ('New palette from <label>'), .pfi-close 450 / 533, .pfi-method 465, .pfi-step 478 / 483, .pfi-regen 491 (x7) |

### `aria-labelledby` — both (+4 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:302` | write | html aria-labelledby= | #photoWarn -> #pwTitle; static markup; on div; css rules: 0 |
| `js/00b-dialog-focus.js:116` | both | hasAttribute / setAttribute | set to the title's id when the dialog has neither aria-labelledby nor aria-label (116-121) |
| `js/05e-effect-controls.js:244` | write | setAttribute | points at #photoSafeOffTitle (id reference) |
| `js/20-mixer-layout.js:2809` | write | setAttribute | .qub-dd-btn -> '#<selectId>DdCap #<selectId>DdVal' (2809); .qub-dd-list -> #<selectId>DdCap (2811). x2 |
| `js/43-ui-visibility.js:495` | write | setAttribute | #uiForkModal -> 'uiForkTitle' (id reference) |
| `js/44-recipes.js:1171` | write | setAttribute | parked 44: #recipeModal -> 'recipeTitle' |
| `js/51-open-in-desktop.js:87` | write | setAttribute | -> #openDesktopTitle (an id reference: the title id must keep its name) |
| `js/52-demo-clock.js:196` | write | setAttribute | -> #demoWishlistTitle |
| `js/54-phone-pads.js:336` | write | setAttribute | -> #phonePadTitle |
| `js/60-reset-app.js:258` | write | setAttribute | -> #resetAppTitle |
| `js/66-skip-menu.js:93` | write | setAttribute | nav#skipMenu -> #skipMenuTitle |

### `aria-live` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:315` | write | html aria-live= | p="polite"; #paletteNote="polite"; #mpActivity="polite"; #recStripStatus="polite"; x4 in static markup (lines 315, 656, 1423, 1588); on p, div, span; css rules: 0 |
| `js/44-recipes.js:1177` | write | innerHTML | parked 44: 'polite' on .recipe-count |
| `js/48-hotkeys.js:602` | write | setAttribute | 'polite' on the picker note |
| `js/54-phone-pads.js:353` | write | innerHTML template | 'polite' on #phonePadStatus |
| `js/65-palette-from-image.js:480` | write | setAttribute('aria-live', 'polite') | on .pfi-count-val so the count announces as it steps |

### `aria-modal` — both (+4 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:302` | write | html aria-modal= | #photoWarn="true"; static markup; on div; css rules: 0 |
| `js/00b-dialog-focus.js:115` | both | setAttribute / closest('[aria-modal="true"]') | written "true" on every held dialog root (115); read back by closest at 86 (focus that lands in another modal stays) and 197 (popup stays for a dialog it opened) |
| `js/05e-effect-controls.js:243` | write | setAttribute | 'true' on #photoSafeOffModal |
| `js/43-ui-visibility.js:494` | write | setAttribute | 'true' on #uiForkModal |
| `js/44-recipes.js:1170` | write | setAttribute | parked 44: 'true' on #recipeModal |
| `js/51-open-in-desktop.js:86` | write | setAttribute | 'true' on #openDesktopModal |
| `js/52-demo-clock.js:195` | write | setAttribute | 'true' on #demoWishlistModal |
| `js/54-phone-pads.js:335` | write | setAttribute | 'true' on #phonePadModal |
| `js/60-reset-app.js:257` | write | setAttribute | 'true' on #resetAppModal |
| `js/66-skip-menu.js:323` | read | closest('[aria-modal="true"], #photoWarn') | focus inside a dialog is not remembered as 'where you were' |

### `role` — both (+6 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/00b-dialog-focus.js:114` | both | hasAttribute / setAttribute | hold(): role="dialog" set when the root has none (114); menu(): role="menu" on the menu (234) and role="menuitem" on each enabled button in it (240) |
| `js/05e-effect-controls.js:242` | write | setAttribute | role='alertdialog' on #photoSafeOffModal |
| `js/06e-mp-panel.js:457` | write | setAttribute | 'status' on the created #mpRoomToast |
| `js/15-layer-masking.js:209` | write | innerHTML template | role="tablist" on .mask-tools-row (the tabs themselves carry no role=tab / aria-selected; the active tab is the class active) |
| `js/20-mixer-layout.js:719` | write | setAttribute | menu on .arm-tip-menu L719; group on .ch-seg-switch L1264; button on .ch-ignite-lock L1488 (a <div>, tabIndex 0); status on #presetPathToast L1686 |
| `js/21-focus-mode.js:53` | write | setAttribute('role', 'status') | #focus-mode-hint |
| `js/26-layer-transform.js:409` | write | innerHTML template | role="toolbar" on the transform .draw-toolbar |
| `js/39-qrcode.js:311` | write | SVG string ' role="img" aria-label="QR code"' | the only DOM-facing text in js/39: the QR <svg> it returns carries role=img + aria-label; no selector query in the file |
| `js/43-ui-visibility.js:493` | write | setAttribute | role='dialog' on #uiForkModal (role, not a state) |
| `js/44-recipes.js:986` | write | setAttribute/innerHTML | parked 44: status (#recipePill 986), dialog (#recipeModal 1169), group (.recipe-tags 1180), listbox (.recipe-results 1182), option (.recipe-row 1263) |
| `js/46-strip-more.js:278` | write | setAttribute | role='group' on #mixer-more-panel (role, not a state) |
| `js/47-pen-window.js:339` | write | markup attribute | pen window: role=group on #guidesMenu |
| `js/49-hotkey-binds.js:637` | both | closest/setAttribute | read: '[role="button"]' bindable (637); write: role='status' #hkWheel (561) and #hkToast (1562), role='dialog' #hkBindBar (739) |
| `js/50-look-links.js:823` | write | setAttribute | 'status' on #look-toast |
| `js/51-open-in-desktop.js:85` | write | setAttribute | 'dialog' on #openDesktopModal |
| `js/52-demo-clock.js:194` | write | setAttribute | 'dialog' on #demoWishlistModal |
| `js/54-phone-pads.js:334` | write | setAttribute / innerHTML template | 'dialog' on #phonePadModal (334); 'group' on .phone-pad-ways (340); 'status' on #phonePadStatus (353) |
| `js/58-radial-menu.js:404` | write | setAttribute | role=status on #radialNote (404); role=menu on #radialMenu (471); role=menuitem on each .radial-label (518) |
| `js/59-brush-type-key.js:66` | write | setAttribute('role', 'status') | #brushTypePill |
| `js/60-reset-app.js:256` | write | setAttribute | 'dialog' on #resetAppModal (256), 'note' on #resetAppHint (369) |
| `js/61-room-report.js:172` | write | setAttribute | 'menuitem' on the report item (its parent is role=menu) |
| `js/64-colour-picker.js:64` | write | setAttribute('role', ...) | status on .cp-toast 64; slider on .cp-track 268; button on .cp-chip 437, 576; dialog on .cp-pop 618 (x5) |
| `js/65-palette-from-image.js:441` | write | setAttribute('role', 'group') | on the .pfi panel root |

### `role="alert"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1408` | write | html role= | #mpError .mp-error, the multiplayer error line (static markup, display:none until set) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="alertdialog"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/05e-effect-controls.js:242` | write | setAttribute | offModal #photoSafeOffModal .delete-modal, the PhotoSafe-off confirm - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="application"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1205` | write | html role= | Dither 'Draw your own' pattern pad, 16 by 16 squares (static markup; arrow keys move, Space draws or erases) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="button"` — both

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/01-config.js:900` | write | setAttribute | chip .palette-chip, each palette swatch (arrows move along the row, Enter/Space paints, menu key opens its menu) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the… |
| `js/20-mixer-layout.js:1488` | write | setAttribute | igniteLock, the square lock button by Ignite; also 9329 titleEl (.section-title, the section header made the button) - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already… |
| `js/49-hotkey-binds.js:637` | read | closest | bindableFrom(t): t.closest('input, select, button, textarea, label, [role="button"], .btn') decides what Ctrl+Shift+H can bind a hotkey to - B critic addition (role value row; bare role and role="img"/"listbox"/"option"… |
| `js/64-colour-picker.js:437` | write | setAttribute | chip .cp-chip, colour-picker swatch chips (437 and 576, two chip rows) - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="checkbox"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:8926` | write | setAttribute | pushBtn .arm-push-btn, the per-arm Pressure (push) switch under the Paint Into radio group - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="combobox"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/01-config.js:439` | write | setAttribute | trig #paletteSelect .palette-select-trigger, the palette dropdown trigger (tabIndex 0) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="dialog"` — both

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:302` | write | html role= | #photoWarn, the PhotoSafe dialog (aria-modal, aria-labelledby pwTitle); also 1445 #mpInvitePop .mp-pop Invite popover - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were… |
| `js/00b-dialog-focus.js:114` | write | setAttribute | dialog-focus helper: gives a focus-trapped root role=dialog when it has none (every modal routed through 00b) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/43-ui-visibility.js:493` | write | setAttribute | m #uiForkModal .delete-modal .ui-fork-modal, the Simple\|Everything startup fork - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/44-recipes.js:1169` | write | setAttribute | m #recipeModal .delete-modal .recipe-modal (How-do-I modal; js/44 is parked, not loaded today) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/49-hotkey-binds.js:739` | write | setAttribute | bar #hkBindBar, the Ctrl+Shift+H hotkey bind bar - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/51-open-in-desktop.js:85` | write | setAttribute | m #openDesktopModal .delete-modal .open-desktop-modal - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/52-demo-clock.js:194` | write | setAttribute | modal #demoWishlistModal .delete-modal .demo-wishlist-modal (Steam demo clock) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/54-phone-pads.js:334` | write | setAttribute | m #phonePadModal .delete-modal .phone-pad-modal - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/60-reset-app.js:256` | write | setAttribute | modal #resetAppModal .delete-modal .reset-app-modal - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/64-colour-picker.js:618` | write | setAttribute | wrap .cp-pop, the colour picker popover (data-group copied from the nearest [data-group]) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/66-skip-menu.js:305` | read | closest | skip menu (js/66): a.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]'); a tabindex=-1 element inside one of these widgets is not "focus on… |

### `role="grid"` — read

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/66-skip-menu.js:305` | read | closest | skip menu (js/66): a.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]'); a tabindex=-1 element inside one of these widgets is not "focus on… |

### `role="group"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1449` | write | html role= | .mp-share-modes 'How to share this room'; also 1568 and 1577 .rec-strip-chips (recorder Length / What a take records) - 3 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were… |
| `js/20-mixer-layout.js:1264` | write | setAttribute | segWrap, the colour-mode segmented control in the colour channel; also 7041 clearAsk #textOverlayClearAsk - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the… |
| `js/44-recipes.js:1180` | write | template role= | .recipe-tags 'Topics' in the recipe modal template - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/46-strip-more.js:278` | write | setAttribute | panel .arm-colors-panel .mixer-more-panel, the strip's More popover (portaled to body) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/47-pen-window.js:339` | write | template role= | #guidesMenu 'Guides' in the pen window template (separate window document) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/54-phone-pads.js:340` | write | template role= | .phone-pad-ways 'How the phone paints' in the phone-pad modal template - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/65-palette-from-image.js:441` | write | setAttribute | panel .pfi, the palette-from-image panel (tabIndex -1) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="img"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:4430` | write | setAttribute | .fx-thumb |

### `role="listbox"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:2810` | write | setAttribute | .qub-dd-list |

### `role="menu"` — both

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1477` | write | html role= | #mpRoomMenu .brush-shape-menu .mp-pop .mp-room-menu 'Room options' (static markup, hidden) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/00b-dialog-focus.js:234` | write | setAttribute | menu(m, trigger, close) helper: every right-click menu routed through it (palette chip, brush shape) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/20-mixer-layout.js:719` | write | setAttribute | m .brush-shape-menu .arm-tip-menu, the per-arm tip menu - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/58-radial-menu.js:471` | write | setAttribute | root #radialMenu, the E / mouse-button radial menu - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/66-skip-menu.js:305` | read | closest | skip menu (js/66): a.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]'); a tabindex=-1 element inside one of these widgets is not "focus on… |

### `role="menuitem"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/00b-dialog-focus.js:240` | write | setAttribute | every enabled, visible <button> inside a menu() helper menu - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/58-radial-menu.js:518` | write | setAttribute | lab .radial-label (+ .is-slider), one per radial wedge - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/61-room-report.js:172` | write | setAttribute | b #roomReportBtn .btn--ghost .mp-menu-item .mp-room-report in the room menu - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="menuitemcheckbox"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:1478` | write | html role= | #lockRoomBtn .btn--ghost .mp-menu-item (aria-checked) inside #mpRoomMenu - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="note"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/60-reset-app.js:369` | write | setAttribute | hint #resetAppHint .reset-app-hint - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="option"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:2829` | write | setAttribute | .qub-dd-opt |

### `role="radio"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:5736` | write | setAttribute | TYPE_BTNS, the three brush-type buttons in targetRow; also 9005 btn .brush-mode-btn .arm-mode-btn (per-arm Paint Into) - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were… |

### `role="radiogroup"` — both

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:5717` | write | setAttribute | targetRow .brush-mode-row .brush-radio-row (brush type Fluid/Pressure/Collider); also 8889 modeWrap .brush-radio-row .arm-mode-wrap - 2 hits - B critic addition (role value row; bare role and… |
| `js/66-skip-menu.js:305` | read | closest | skip menu (js/66): a.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]'); a tabindex=-1 element inside one of these widgets is not "focus on… |

### `role="slider"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/64-colour-picker.js:268` | write | setAttribute | track .cp-track, the colour picker's slider rows (tabIndex 0) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="status"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:656` | write | html role= | #paletteNote .palette-note (aria-live polite, hidden); also 1418 #multiplayerStatus 'Connecting...' - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/06e-mp-panel.js:457` | write | setAttribute | el #mpRoomToast .mp-room-toast (showRoomToast) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/20-mixer-layout.js:1686` | write | setAttribute | presetPathToastEl #presetPathToast - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/21-focus-mode.js:53` | write | setAttribute | hint #focus-mode-hint - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/44-recipes.js:986` | write | setAttribute | p #recipePill, the recipe modal folded down while guiding - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/49-hotkey-binds.js:561` | write | setAttribute | hudEl, the hotkey-maker HUD; also 1562 toastEl #hkToast - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/50-look-links.js:823` | write | setAttribute | toastEl #look-toast (look links) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/54-phone-pads.js:353` | write | template role= | #phonePadStatus .phone-pad-status (aria-live polite) in the phone-pad modal template - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/58-radial-menu.js:404` | write | setAttribute | noteEl #radialNote (radial menu note) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/59-brush-type-key.js:66` | write | setAttribute | pill #brushTypePill (the ~ brush-type key pill) - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/64-colour-picker.js:64` | write | setAttribute | toastEl .cp-toast, window.showToast - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="switch"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `index.html:926` | write | html role= | #kaleidoToggle checkbox; also 930 #mandalaToggle - 2 hits - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="tablist"` — both

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/15-layer-masking.js:209` | write | template role= | .mask-tools-row .mask-tool-tabs in the mask editor template - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |
| `js/66-skip-menu.js:305` | read | closest | skip menu (js/66): a.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]'); a tabindex=-1 element inside one of these widgets is not "focus on… |

### `role="toolbar"` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/26-layer-transform.js:409` | write | template role= | .draw-toolbar[data-group=core] 'Moving layer' in the layer-transform template - B critic addition (role value row; bare role and role="img"/"listbox"/"option" were already on the contract) |

### `role="tree"` — read

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/66-skip-menu.js:305` | read | closest | skip menu (js/66): a.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]'); a tabindex=-1 element inside one of these widgets is not "focus on… |

## Tag and attribute selectors

Element, attribute and role selectors script queries (`input[type=range]`, `label[for]`, `[role="dialog"]`, focusable-element lists) and inline `onclick="…"` handlers the markup depends on (global function names in the purpose column). A few rows are conventions rather than selectors (`class`, `tabindex`, `title`, `zoom (computed)`); kept as the slices recorded them.

65 selectors.

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `#sidebar-right .sidebar-section, #sidebar-left .sidebar-section` | read | `js/58-radial-menu.js:853` | settingsSection(): every section in either sidebar, picked by its .section-title TEXT; sliderHome 961 names a slider's section the same way |
| `.mask-editor-header h3` | read | `js/15-layer-masking.js:3276` | the editor title element (x3: 3276, 3735, 3766); created at template 152 |
| `:hover` | read | `js/65-palette-from-image.js:680` | after a marker drag ends, keeps the hot highlight only if the pointer is still over it |
| `[contenteditable]` | read | `js/06-slider-updater.js:180` | INTERACTIVE = 'input, select, button, a, textarea, [contenteditable], .fader-scale, label, .value-display' |
| `[disabled]` | write | `js/15-layer-masking.js:269`, `js/20-mixer-layout.js:5225`, `js/24-path-layers.js:607`, `js/64-colour-picker.js:756`, `js/65-palette-from-image.js:607` | disabled attr on #samSegmentBtn in the template; .disabled set on #smartSelectBtn (1759-1864), #samSegmentBtn (1775, 1844, 1917, 2042), .mask-apply-btn (1955),… |
| `[draggable="true"]` | write | `js/24-path-layers.js:603` | attribute on .path-layer-header; no [draggable] rule in css/ |
| `[draggable]` | write | `js/05k-layers-render.js:27` | header .layer-item-header draggable true/false (27, 142, 143, 301, 346, 488, 660, 667); row div false 288; .layer-title and every fader setAttribute('draggable','false')… |
| `[hidden]` | write | `js/20-mixer-layout.js:8680` | on .arm-mirror-note: true at build 8680, !sides.length in updateMirrorNote 8715 |
| `[onchange="importPalettesFluidFromFile(…)"]` | read | `index.html:664` | global window.importPalettesFluidFromFile; static markup; on input[type=file] |
| `[onclick="applyPreset(…)"]` | read | `index.html:1359` | global window.applyPreset (data-preset=opal); global window.applyPreset (data-preset=bloom); global window.applyPreset (data-preset=currents); global window.applyPreset… |
| `[onclick="clearCanvas(…)"]` | read | `index.html:1483` | global window.clearCanvas; static markup; on button |
| `[onclick="confirmDeletePalette(…)"]` | read | `index.html:1997` | global window.confirmDeletePalette; static markup; on button |
| `[onclick="exportAllPalettesFluid(…)"]` | read | `index.html:662` | global window.exportAllPalettesFluid; static markup; on button |
| `[onclick="exportCurrentPaletteFluid(…)"]` | read | `index.html:661` | global window.exportCurrentPaletteFluid; static markup; on button |
| `[onclick="hideDeleteModal(…)"]` | read | `index.html:1996` | global window.hideDeleteModal; static markup; on button |
| `[onclick="playChimeraAnimation(…)"]` | read | `index.html:1494` | global window.playChimeraAnimation; static markup; on button |
| `[onclick="playPortraitAnimation(…)"]` | read | `index.html:1489` | global window.playPortraitAnimation; static markup; on button |
| `[onclick="toggleFreeze(…)"]` | read | `index.html:1484` | global window.toggleFreeze; static markup; on button |
| `[onclick="togglePause(…)"]` | read | `index.html:1482` | global window.togglePause; static markup; on button |
| `[onmouseenter="showPreview(…)"]` | read | `index.html:1551` | global window.showPreview; static markup; on div |
| `[onmouseleave="hidePreview(…)"]` | read | `index.html:1551` | global window.hidePreview; static markup; on div |
| `[role="alert"]` | write | `index.html:1408` | #mpError; static markup; on div |
| `[role="application"]` | write | `index.html:1204` | #ditherPad; static markup; on canvas |
| `[role="button"]` | write | `js/01-config.js:900`, `js/20-mixer-layout.js:9329` | on .section-title (with tabIndex 0 at 9328) |
| `[role="checkbox"]` | write | `js/20-mixer-layout.js:8926` | on .arm-push-btn |
| `[role="combobox"]` | write | `js/01-config.js:439` | on #paletteSelect (div acting as the palette dropdown) |
| `[role="dialog"]` | write | `index.html:302` | #photoWarn; #mpInvitePop; x2 in static markup (lines 302, 1445); on div |
| `[role="group"]` | write | `index.html:1449`, `js/20-mixer-layout.js:7041` | div; x3 in static markup (lines 1449, 1568, 1577); on div |
| `[role="listbox"]` | write | `js/01-config.js:478` | on .palette-list |
| `[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]` | read | `js/66-skip-menu.js:305` | nothingFocused(): a tabindex=-1 item inside one of these widgets is a real focus, not 'nothing' |
| `[role="menu"]` | write | `index.html:1477` | #mpRoomMenu; static markup; on div |
| `[role="menuitemcheckbox"]` | write | `index.html:1478` | #lockRoomBtn; static markup; on button[type=button] |
| `[role="option"]` | write | `js/01-config.js:602` | on .palette-option |
| `[role="radio"]` | write | `js/20-mixer-layout.js:5736` | Fluid / Pressure / Collider buttons (still <button>s lit by .active; state in aria-checked) |
| `[role="radiogroup"]` | write | `js/20-mixer-layout.js:5717` | Paint Into row (.brush-mode-row.brush-radio-row); arrow keys move the choice (5738) |
| `[role="status"]` | write | `index.html:656` | #paletteNote; #multiplayerStatus; x2 in static markup (lines 656, 1418); on div, span |
| `[role="switch"]` | write | `index.html:926` | #kaleidoToggle; #mandalaToggle; x2 in static markup (lines 926, 930); on input[type=checkbox] |
| `a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable=""], [contenteditable="true"]` | read | `js/00b-dialog-focus.js:23`, `js/66-skip-menu.js:38` | what counts as a Tab stop inside a held dialog / popup (51); the same list is js/66:38 |
| `button` | read | `js/00b-dialog-focus.js:236`, `js/06e-mp-panel.js:872`, `js/10-draggable.js:79`, `js/64-colour-picker.js:652` | click delegation in #mpRoomMenu: any button without data-stay closes the menu; a non-button item would not |
| `button, input, textarea, select, a, .layer-btn` | read | `js/13-drag-scroll.js:19` | interactive descendants that must not start a drag-scroll (19, 75) |
| `button[onclick*="clearCanvas"]` | read | `js/20-mixer-layout.js:1526` | finds the Clear button in .controls by its inline onclick text; renaming the handler or dropping the inline attribute breaks the lookup |
| `class` | read | `js/46-strip-more.js:327` | re-measures when any candidate cell's class (ui-hidden from 43) or body's class (compact-ui from 13) changes |
| `disabled` | write | `js/20-mixer-layout.js:3004` | native disabled state on #mutationUndo/#mutationRedo (3004, 3010, 3564-3565) and #flattenLayersBtn (3654-3655); CSS :disabled is the only styling hook for it. x6 |
| `html.boot-cursor *` | write | `js/00a-boot.js:368` | the one rule in the injected boot sheet; !important cursor on every element during boot |
| `input` | read | `js/20-mixer-layout.js:3770` | the first <input> inside a .control-group must be the slider: texGroup (6070), setGroupEnabled (6113), steadyGroup (6242) disable/enable it; x3 |
| `input, button, select` | read | `js/24-path-layers.js:730` | a click on a row selects the layer unless it landed on a control |
| `input, button, select, textarea, label` | read | `js/05k-layers-render.js:627` | header click collapses the row unless the press landed on a control (627); handleDragStart refuses drags from closest('button') / 'input' / 'select' (770) |
| `input[name="mandalaFill"]` | both | `index.html:949`, `js/34-mandala-mode.js:332` | value="off"; value="fit"; value="full"; x3 in static markup (lines 949, 950, 951); on input[type=radio] |
| `input[name="maskMode"]` | both | `js/15-layer-masking.js:174` | the two radios (values show \| hide); read 515 (change -> maskState.maskMode) and 1527 |
| `input[type="checkbox"]` | both | `js/06-slider-updater.js:228`, `js/20-mixer-layout.js:7246` | #audioReactToggle 7246, #audioTimingToggle 7292, arMap* 7825, #focusModeToggle 7942, #streamFormatLock 8002 |
| `input[type="color"]` | write | `js/20-mixer-layout.js:8871` | input.arm-picker; css/23-colour-picker.css:241 styles input[type="color"].cp-open |
| `input[type="number"]` | write | `js/20-mixer-layout.js:8190` | #exportVideoDuration 8190, #exportGifDuration 8232, ComfyUI capture W/H 8485/8490 (no ids); all styled by inline cssText |
| `input[type="range"]` | both | `js/05d-input-replay.js:1764`, `js/05k-layers-render.js:877`, `js/05l-layers-transform.js:545`, `js/06-slider-updater.js:74`, `js/20-mixer-layout.js:7264`, `js/67-slider-keys.js:26` | sliders CSS selects by type: #audioSeek 7264, #audioVolume 7267, #audioSensitivity 7722, #audioBeatThreshold 7739, #audioKaleidoSpin 7779 |
| `input[type=color]` | read | `js/64-colour-picker.js:724` | every colour well in the app opens this picker instead of the native dialog; the well also gets class cp-open while open |
| `input[type=radio]` | read | `js/47-pen-window.js:650`; +2 test/bake files | the screen radios (name=penWindowScreen, 561); checked synced to the live screen |
| `label` | read | `js/17-hotkey-reminder.js:48`, `js/20-mixer-layout.js:6857` | '.control-group > label' is the cap host; g.querySelector('label') (81,98); ':scope > label' (95) |
| `label[for="<paramId>"]` | read | `js/06e-mp-panel.js:355` | controlName's fallback name: the text nodes of the control's <label for>; a label wrapping its input with no for= is not found |
| `label[for="kaleidoSegments"]` | read | `js/05f-kaleido-controls.js:250` | the Segments label; its FIRST text node is rewritten (Segments/Facets/Layers/Reflections/Rings) and the .value-display span inside it must stay (L278-288) |
| `label[for]` | both | `js/20-mixer-layout.js:1041` | id references: audioMode 7213, audioTimingToggle 7295, audioSensitivity 7719, audioBeatThreshold 7736, audioKaleidoSpin 7775, audioColorEvery 7799, arMap* (m.id) 7829,… |
| `option[value="borderless"]` | read | `js/36-display-mode.js:221` | the Borderless option is REMOVED from #windowMode in the browser build (222) |
| `reset-app-btn, .demo-clock, .playtest-label` | read | `js/08a-quality-governor.js:526`, `js/62-canvas-readout.js:83` | underbar ORDER contract: the size cell goes before Reset app / the demo clock / the playtest label (same list in js/08a:526) |
| `script[src*="06d-mp-paint-wire"]` | read | `js/61-room-report.js:87` | the report's 'bundle' field is the src of the 06d script tag: renaming or bundling that file changes the diagnostic text only |
| `select` | read | `js/05d-input-replay.js:1774`, `js/06e-mp-panel.js:344` | a strip channel whose label is a menu (the Material Type picker on the Curl channel): the first <select> inside .mixer-channel names the control |
| `tabindex` | both | `js/00b-dialog-focus.js:123` | a held dialog root gets tabindex=-1 when it has none, so it can take focus itself; '[tabindex]' is also part of FOCUSABLE (23) |
| `title` | read | `js/49-hotkey-binds.js:193` | signature(): a control's title is part of how a saved binding finds it again (193, 208, 242); nameOf fallback (310) |

## Custom properties with a JS side

CSS tokens script writes (`style.setProperty`) or reads (`getPropertyValue`, `var()` inside JS-written `cssText`). The semantic-token step must keep each name; `--val`/`--min`/`--max` are the slider fill contract, `--i`/`--rows` are the per-section ramp (**name collision with the theme's per-control `--i`**, see Open questions).

14 selectors, 39 tier-1 references.

### `--accent` — read

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/35-zoom-view.js:155` | read | var() inside style.cssText / style.background 171 | the app's accent token read from JS-written inline styles on #zoomModeFrame (155) and #zoomBadge (171) with fallback #ec3013; the semantic-token step must keep --accent resolvable or the badge falls back to the old red |

### `--app-height` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/01-config.js:1557` | write | documentElement.style.setProperty | visualViewport height in px, on resize/orientationchange only (no per-frame write); read by css/22-overlays.css:40,49 (var(--app-height, 100dvh)) for the mobile/focus #canvas-area height |

### `--i` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:2666` | write | style.setProperty | on each .sidebar-section: its row index within the group run (integer). NAME COLLISION with the theme's per-control --i brightness 0..1 (README CSS prep step 5); see open items |
| `js/43-ui-visibility.js:293` | write | style.setProperty | per visible section: its index within the visible run of its group (ramp slice); 20-mixer-layout stamps the same props at build |

### `--max` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/06-slider-updater.js:15` | write | style.setProperty | on every input[type=range] from its max attribute |
| `js/20-mixer-layout.js:5001` | write | style.setProperty | 5001, 5243, 6433; x3 |

### `--min` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/06-slider-updater.js:14` | write | style.setProperty | on every input[type=range] from its min attribute (setSliderVars; refreshed on attribute mutations L152); slider-styles.css fill gradient reads it |
| `js/20-mixer-layout.js:5000` | write | style.setProperty | slider fill range for css/slider-styles.css: alt Own-size slider (5000), ramp sliders (5242), Text sliders (6432); x3 |

### `--mp-peer` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/06e-mp-panel.js:376` | write | face.style.setProperty('--mp-peer', col) | the peer's colour on the control face that glows (.mp-peer-touch); css/21-sidebar.css:1469, 1473 read it; stays on the element after the class fades |

### `--peer` — both (+1 test/bake ref)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/06e-mp-panel.js:171` | write | tag.el.style.setProperty('--peer', col) | a peer's colour on their .remote-cursor (the paint they last laid, else hsl from the id hash); css/21-sidebar.css:1515, 1521 read it for the ring and label |

### `--rows` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:2665` | write | style.setProperty | on each .sidebar-section: how many sections share its data-group run (section-title gradient slice, css/21-sidebar.css) |
| `js/43-ui-visibility.js:292` | write | style.setProperty | per visible section: count of visible sections in its group (css/21-sidebar.css ramp size); re-stamped on every apply(), not per frame |

### `--sec-c` — read

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/38-button-audit.js:136` | read | getPropertyValue('--sec-c') | per-section chroma token reported by auditButtonTint() |

### `--sec-h` — read

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/38-button-audit.js:135` | read | getComputedStyle(el).getPropertyValue('--sec-h') | per-section hue token (css/01-buttons / 21-sidebar) reported by auditButtonTint() |

### `--sidebar-width` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:227` | write | documentElement.style.setProperty | right sidebar width while dragging .sidebar-resize-handle, clamped 220-420px (base px, divided by the zoom) |

### `--ss-frame-ratio` — write

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/04d-anim-ascend-star.js:475` | write | style.setProperty | canvas aspect written on #ssOriginFrame on resize; consumed by css/21-sidebar.css:630 aspect-ratio: var(--ss-frame-ratio, 16 / 9) |

### `--ui-scale` — both

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/20-mixer-layout.js:181` | write | documentElement.style.setProperty | UI zoom factor (1.0 to 1600px wide, ramp to 1.8 at 3840; 1.15 at dpr>=2 and >=1200px); CSS applies zoom: var(--ui-scale) in init-responsive.css; written on resize and DPR change only; window.UIScale exposes it |
| `js/20-mixer-layout.js:3425` | read | window.UIScale.get() (not getPropertyValue) | hover-card placement divides screen px by the scale (3425-3449, 4388-4397): .fx-tip and .mutation-tip must keep zoom: var(--ui-scale) or they land in the wrong place. x2 |
| `js/58-radial-menu.js:434` | read | getComputedStyle(documentElement).getPropertyValue('--ui-scale') | the wheel's radii (R_HUB 26, R_IN 34, R_OUT 124 ...) are CSS px at scale 1 and multiply by this (clamped 0.8-2); js/20:181 writes the property |

### `--val` — write (+3 test/bake refs)

| File:line | Mode | API | Element / purpose |
|---|---|---|---|
| `js/04f-canvas-actions.js:123` | write | style.setProperty | slider fill on #multiplier when an animation resets the multiplier without an input event |
| `js/05d-input-replay.js:1978` | write | s.style.setProperty('--val', v) | on #brushSize during a pinch so the fader fill follows |
| `js/05e-effect-controls.js:434` | write | style.setProperty | on #multiplier when a digit hotkey sets the arm count (the slider fill var 06 maintains on input) |
| `js/05f-kaleido-controls.js:49` | write | style.setProperty | on #multiplier (L49, L67) and #kaleidoSegments (L55) at kaleido bootstrap, on #kAngle (L151) and #kSpinSpeed (L166) when sticky zero rewrites the value; x5 |
| `js/05h-slider-bindings.js:379` | write | style.setProperty | slider fill var kept in step whenever script moves a range by value (x21: L379, 402, 428, 465, 490, 523, 591, 605, 651, 666, 674, 683, 691, 701, 708, 715, 722, 729, 736, 751, 760) |
| `js/05n-hotkeys-init.js:147` | write | style.setProperty | on #brushSize when undo restores a size (L147) and when [ ] steps the ladder (L286); x2 |
| `js/06-slider-updater.js:16` | write | style.setProperty | on every input[type=range]: seeded L16, rewritten on every input/change event L23 (onInput); the canonical writer of the fill var the other files mirror |
| `js/06c-mp-glide.js:108` | write | el.style.setProperty('--val', el.value) | glideWrite keeps the slider fill in step on every glide frame (css/slider-styles.css:21, 28) because the input event it dispatches next is synthetic |
| `js/12-save-load.js:11` | write | style.setProperty('--val', value) | setVal writes it on every input it restores (all registry sliders, both colour wells, #kaleidoMode / #kaleidoSegments); also on #brushAngle 1795. The slider fill in CSS reads it; js/06-slider-updater keeps it current on… |
| `js/13-light-source.js:323` | write | style.setProperty('--val') | on #lightSpeed, #lightIntensity, #lightAmbient when settings load (323, 328, 333) so the slider fill matches the restored value |
| `js/14-light-shift.js:623` | write | style.setProperty('--val') | on the four Light Shift ranges when settings load (623, 628, 633, 638) |
| `js/15-layer-masking.js:690` | write | style.setProperty('--val', v) | setRangeValue: the heat-bar fill css/slider-styles.css paints from; written on #maskRotationSlider (705), #filterThreshold (2388), #maskFeatherSlider (3049), #touchUpSize (3053) whenever a value is set from state… |
| `js/20-mixer-layout.js:1083` | write | input.style.setProperty | slider fill position on input[type=range]: the canonical's value L1083 (so its hidden track stays in step) and the proxy's 0-1 position L1101; the slider stylesheet reads it (06-slider-updater owns the general case) |
| `js/20-mixer-layout.js:5002` | write | style.setProperty | slider fill position: 5002, 5244, 5476 (pSlider SETTERS), 5595 (#brushSize on preset apply), 6434; written by hand because js/06-slider-updater.js refreshes it only on real input/change events; x5 |
| `js/20-mixer-layout.js:7443` | write | style.setProperty | slider fill position written by script when .value is set programmatically (the input event does not fire): #audioSeek 7443 (every 200 ms while a file plays), #audioSensitivity 7905, #audioBeatThreshold 7910,… |
| `js/29-material-modes.js:120` | write | style.setProperty | on the three side sliders (L120) and on #curl when the mode changes or a snapshot applies (L222, L228, L299); x4 |
| `js/34-mandala-mode.js:88` | write | style.setProperty | mirrorRange paints a slider's fill without dispatching input (js/06 only refreshes --val on real events): on the panel proxies and #mandalaWedges / #kaleidoSegments (88, via 108, 408) and on #kAngle (161); consumed by… |
| `js/44-recipes.js:67` | write | style.setProperty | parked 44: setCtl() on range inputs (same contract as 12-save-load setVal) |
| `js/49-hotkey-binds.js:366` | write | style.setProperty | on a range input after setting its value (366) and on each wheel notch (511): the fill-track variable the slider CSS reads |
| `js/58-radial-menu.js:315` | write | style.setProperty('--val', value) | on the slider FACE (the fader js/20 shows, or the slider itself) each time the wheel moves it, before dispatching 'input' - keeps the fader's CSS fill in step because js/06-slider-updater only writes --val on real input… |

## String-built selector patterns

Selectors assembled from strings or template literals. `<…>` marks the variable part; the purpose column says what it resolves to. Readout ids follow `#<param>Value` with exceptions (`densityValue`, `velocityValue`, `pressureValue`, `iterationValue`, `opacityValue`, `dimmingValue`, `kaleidoValue`, `ss*Val`).

71 selectors.

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `#<id minus 'Dissipation'>Value` | read | `js/05h-slider-bindings.js:653` | loadSavedSliderValues (L653-655) and updateSliderValues (L752-754, no null guard); resolves to the same 12 spans as the L548 pattern; all 12 exist in index.html today |
| `#<id>` | read | `js/49-hotkey-binds.js:234`; +2 test/bake files | resolve(): a binding whose target has an id is found by that id alone |
| `#<id>Perceptual` | read | `js/49-hotkey-binds.js:416` | faceOf(): the perceptual fader in front of a raw slider (20's FADER_CURVES); reverse at 656 (.ch-perceptual id minus 'Perceptual' = the real slider) |
| `#<id>Value` | both | `js/05e-effect-controls.js:43`, `js/05h-slider-bindings.js:548`, `js/20-mixer-layout.js:5444`, `js/49-hotkey-binds.js:344` | label template in pSlider (5444) and the Text section's slider() (6410), plus the literal #replaySpeedValue (5095); read back with lbl.querySelector('.value-display')… |
| `#<mappings[i].id>` | both | `js/20-mixer-layout.js:7826` | resolved: arMapAutoSplat \| arMapSize \| arMapKaleido \| arMapColor (array 7758-7766; read back 7914-7918), listed as id rows above |
| `#<param>` | read | `js/20-mixer-layout.js:3321` | snapshot diff key -> its control: label fallback 3321, select option text 3345, optionText 3273; keys are ParamRegistry/snapshot ids (kaleidoSegments, ridges, lightMode… |
| `#<param>Value` | write | `index.html:731` | 61 static .value-display readouts; NOT uniform: densityDissipation->densityValue, velocityDissipation->velocityValue, pressureDissipation->pressureValue,… |
| `#<paramId>` | read | `js/06b-mp-look.js:472`, `js/06e-mp-panel.js:339`, `js/50-look-links.js:973`; +1 test/bake file | the element id of the control that fired input/change IS the registry key and the room-look key (_roomKeyTouched 'sec.id', 472-476). The same ids are sync POLICY:… |
| `#<ParamRegistry checkbox id>` | read | `js/12-save-load.js:167` | CHECKBOX_IDS (129; fallback FALLBACK_CHECKBOX_IDS 120); .checked read 167 / 681; setCheck 353- writes .checked and dispatches change |
| `#<ParamRegistry key>` | read | `js/01a-param-registry.js:334` | the registry is keyed by DOM control id (L9-10): _hydrate L334 (SLIDERS, dynamic ui:null entries read min/max/step/defaultValue), coerceSelect L374 (SELECTS with… |
| `#<ParamRegistry select id>` | read | `js/12-save-load.js:171`, `js/25-mutation-engine.js:362` | for a ParamRegistry.toMutationSchemas().selects entry with no options list, Mutate reads the live <select>'s option values 363-364 to pick one at random; read-only, no… |
| `#<ParamRegistry slider id>` | read | `js/12-save-load.js:163` | SLIDER_IDS (128) is derived from the registry (fallback literal list FALLBACK_SLIDER_IDS 119); .value read via valEl 163 / 677 when the registry has no configKey;… |
| `#<selectId>DdCap` | write | `js/20-mixer-layout.js:2803` | ddId = sel.id + 'Dd' (2802) -> #visualResolutionDdCap, #physicsResolutionDdCap, #shadeFormResolutionDdCap; aria-labelledby target for the pill button and list |
| `#<selectId>DdList` | write | `js/20-mixer-layout.js:2805` | -> #visualResolutionDdList, #physicsResolutionDdList, #shadeFormResolutionDdList; aria-controls target of .qub-dd-btn |
| `#<selectId>DdVal` | write | `js/20-mixer-layout.js:2804` | -> #visualResolutionDdVal, #physicsResolutionDdVal, #shadeFormResolutionDdVal; second aria-labelledby id of .qub-dd-btn |
| `#<sliderConfig id>` | read | `js/05h-slider-bindings.js:535` | sliderConfig = ParamRegistry.toSliderConfig(): every SLIDERS entry with simSlider && configKey = densityDissipation, velocityDissipation, pressureDissipation,… |
| `#<sliderId>` | read | `js/06c-mp-glide.js:143`; +3 test/bake files | mpSetSliderNow (143), mpGlideTo (157), glideFrame re-lookup when the element was rebuilt (127); the release listener matches e.target.id against the gliding ids… |
| `#<sliderId>Perceptual` | write | `js/20-mixer-layout.js:1070` | proxy range id for every key in FADER_CURVES (L943): brushSize, densityDissipation, timeScale, colorBlend -> the four resolved id rows |
| `#<SLIDERS id>` | read | `js/30-audio-scenes.js:88` | sliderValueFor(key): every registry slider id (js/01a-param-registry.js SLIDERS; 107 params in scripts/test/inventory/params.json) is looked up by id to read the live… |
| `#<toggleCheckbox id>` | read | `js/05n-hotkeys-init.js:244` | letter hotkeys flip a checkbox by id: cursorToggle (C), showCanvasHandles (H), lockCanvasBorders (L), randomColor (R), stepPalette (P), kaleidoToggle (K, soft) at… |
| `#altSizeOn_<side>` | write | `js/20-mixer-layout.js:4835` | buildButtonRole(side) (4744); side is left\|right\|middle (js/41-button-modes.js:107 BM.SIDES), so it resolves to #altSizeOn_left, #altSizeOn_right, #altSizeOn_middle:… |
| `#buttonMode_<side>` | write | `js/20-mixer-layout.js:4755` | side in left\|right\|middle (js/41-button-modes.js:107 SIDES) -> #buttonMode_left/_right/_middle; label for= at 4750; inline cssText = SECTION_SELECT_CSS (4590,… |
| `#dialogTitle<N>` | write | `js/00b-dialog-focus.js:119` | id minted on a dialog's first .delete-modal-title / h1 / h2 / h3 that has no id, so aria-labelledby can point at it |
| `#guide-<id>` | both | `js/47-pen-window.js:320` | pen window: id in kaleido \| mandala \| strokeLock (GUIDES 153-175); each svg's <g> children are the marks and (strokeLock) the hand group, found by… |
| `#layer<index>` | read | `js/24-video-export.js:334` | image-layer divs (created js/04f-canvas-actions.js:355 and js/12-save-load.js:1516); their inline display, backgroundImage, (webkit)maskImage and opacity are read to… |
| `#layer<N>` | both | `index.html:566`, `js/04f-canvas-actions.js:352`, `js/05k-layers-render.js:179`, `js/05l-layers-transform.js:19`, `js/05m-layer-masks.js:20`, `js/12-save-load.js:1513`; +3 more; +2 test/bake files | window.ensureLayerDiv: returns the static #layer0-9 slot or creates the div in #layers-container (fallback #canvas-wrapper); the upload path then writes… |
| `#palettePreview .palette-chip-wrap[data-hex="<hex>"]` | read | `js/01-config.js:730` | flashes .is-added on the chip just added |
| `#recLen<seconds>` | read | `js/03-recording.js:1107` | REC_LENGTHS = [4000, 8000, 15000, 30000] (L1043) resolves to #recLen4, #recLen8, #recLen15, #recLen30 (index.html:1569-1572); aria-pressed and disabled written… |
| `#remote-cursor-<clientId>` | both | `js/06e-mp-panel.js:182`; +1 test/bake file | one div per peer (makeCursorTag); removed when the peer's cursor is older than 5 s or on leaving; the id is informational (nothing queries it) |
| `#sidebar-right .sidebar-section, #sidebar-left .sidebar-section` | read | `js/20-mixer-layout.js:9204` | SECTION_SEL defined js/20:2383 (outside this range); persistSectionState walks it to save title -> collapsed into settings 'sidebar.sections' |
| `#sidebar-right [data-ui-key="Color"]` | read | `js/20-mixer-layout.js:2573` | compact rail's Color button scrolls the Color strip cell parked in the right sidebar (js/46) into view after UIVisibility.show('strip:Color') |
| `#stat-<name>` | both | `index.html:589`, `js/08-stats-panel.js:27` | 24 static readout ids in #statsPanel (stat-fps, stat-frametime, stat-updatetime, stat-budget, stat-displayhz, …); readers in js/05i / js/08 (other slices) |
| `.<rowCls> .layer-slider-host` | read | `js/05k-layers-render.js:135` | mountLayerSlider; rowCls is one of layer-row-opacity (186), layer-row-key (490), layer-row-strength (525), layer-row-cthresh (533); the sibling readout is '.' + rowCls +… |
| `.layer-btn[data-action="collapse"]` | read | `js/49-hotkey-binds.js:619` | OPENERS: the layer row fold button (class layer-btn + data-action value) |
| `.layer-item[data-layer-index="<N>"]` | read | `js/05k-layers-render.js:82` | find one layer's row: revealLayerRow 82 (scrollIntoView), collider colour undo 237 (' .collider-colour-input'); js/05l:976 appends ' .layer-thumbnail' |
| `.layer-item[data-layer-index="<N>"] .layer-thumbnail` | read | `js/23-depth-collision.js:1165` | updates the Layers-panel thumbnail in place after a collider re-bake (style.backgroundImage 1166), falling back to window.renderLayers(); the classes and attribute are… |
| `.layer-item[data-layer-index]` | read | `js/44-recipes.js:90`, `js/49-hotkey-binds.js:164` | ROW_IDS: a binding made in a layer row is stored as '.layer-item[data-layer-index="<n>"]' (173) and looked up inside it (183); persisted |
| `.palette-chip-wrap[data-hex="<hex>"]` | read | `js/01-config.js:932` | restores keyboard focus to the same colour after the row re-renders |
| `.palette-option[data-index="<idx>"] .palette-option-name` | read | `js/01-config.js:371` | renameInline finds the name cell of palette <idx> in the open list |
| `.path-layer-item[data-id="<id>"]` | read | `js/24-path-layers.js:464` | updatePlayheadPreviews finds one row per playback tick and repaints its .path-preview-canvas without a full rebuild |
| `.path-layer-item[data-id="<id>"] .path-layer-info` | read | `js/24-path-layers.js:251` | flashPathCapHint finds one layer's info row by its numeric id (el.dataset.id written at 597) and writes style.color #ffb74d for 1.6 s |
| `.sidebar-section[data-group="<key>"] .section-title` | read | `js/37-nav-idle-glow.js:178` | key in core \| expressive \| system (RUNS 51-58); each label's inline style.backgroundImage is written while idle (99) and CLEARED on wake (112) so it falls back to… |
| `<options.handle>` | read | `js/10-draggable.js:41` | the drag handle selector a caller passes; the one caller in this slice passes '.stats-drag-handle' (js/08-stats-panel.js:43). Handle gets inline cursor:move,… |
| `@keyframes fadeIn\|fadeOut` | both | `js/16-sam-integration.js:269`, `js/23-depth-collision.js:205` | fadeIn 269, fadeOut 273: the only definition of these animation names in the app (none in css/); used by this modal (262, 347) and js/23 (205, 223) |
| `[class*="chev"]` | read | `js/49-hotkey-binds.js:624` | isOpener(): ANY descendant whose class contains 'chev' (mixer-more-chev, qub-dd-chev, preset-group-chev, ui-vis-trigger-chev, hk-list-trigger-chev...) makes the control… |
| `[data-overlay-id="<id>"]` | read | `js/23-text-overlays.js:293` | string-built from the overlay's id (a number or key); 293, 349 (x2) |
| `[id]` | both | `js/46-strip-more.js:125`, `js/49-hotkey-binds.js:145` | probe clone: removeAttribute('id') on itself (125) and every '[id]' descendant (128-129) so duplicate ids never exist |
| `atv-rz-<dir>` | write | `js/40-audio-timing.js:848` | DIRS = n, s, e, w, ne, nw, se, sw (L828); resolves to .atv-rz-n ... .atv-rz-sw, one per handle; css/22-overlays.css:1813-1814 |
| `body.className` | read | `js/61-room-report.js:140` | the whole body class string goes into the report as 'format' (the stream-format classes js/21 sets); any new body class (a theme class, edition-demo) shows up there |
| `button[onclick*="clearCanvas"]` | read | `js/44-recipes.js:440` | parked 44: the Clear button is found by its inline onclick text (index.html handler) |
| `className (wordless controls)` | read | `js/49-hotkey-binds.js:195` | signature(): for a wordless control the full className string is persisted and must match exactly on lookup (209, 253) |
| `input, select, button, textarea, label, [role="button"], .btn` | read | `js/49-hotkey-binds.js:637` | bindableFrom(): what counts as a control under the pointer |
| `input:not([type="hidden"]), button, [tabindex]:not([tabindex="-1"])` | read | `js/64-colour-picker.js:644` | first focusable inside the popover for DialogFocus.popup's initial focus (falls back to the close button) |
| `input\|textarea\|select` | read | `js/48-hotkeys.js:427` | isTyping(): tag-name test only (no selector); a focused input[type=range] keeps arrow/Home/End keys (438) |
| `label[for="<checkboxId>"]` | read | `js/20-mixer-layout.js:4424` | fxRow rewrites the label's textContent for enableLighting, enableLightShift, glowToggle, scatterToggle, displayShadingToggle, ditherToggle, pressureConstant,… |
| `label[for="<id>"]` | read | `js/49-hotkey-binds.js:277`; +1 test/bake file | labelText(): CSS.escape(el.id); also el.labels / label.control (276, 286, 647) so for= associations are a contract |
| `label[for="<param>"]` | read | `js/20-mixer-layout.js:3322` | fallback label for a changed param when el.labels is empty; .value-display stripped from a clone before reading the text (3325) |
| `layer-resize-<dir>` | write | `js/05l-layers-transform.js:449` | layer-resize-nw, -n, -ne, -e, -se, -s, -sw, -w (449-456); CSS places each handle by this class |
| `makeSection(<title>, <group>)` | write | `js/20-mixer-layout.js:9302` | builds .sidebar-section[data-group] > .section-header > (.section-title[role=button][aria-expanded] + .section-chevron) + .section-body; the title text becomes the… |
| `moveCheckboxGroup(<inputId>)` | read | `js/20-mixer-layout.js:9378` | helper; in-range caller passes statsToggle 8401; earlier callers in other slices |
| `moveControlGroup(<inputId>)` | read | `js/20-mixer-layout.js:9366` | helper that moves an input's .control-group and clears its inline cssText; no callers inside this range (callers in earlier slices of js/20) |
| `moveEl(<id>)` | read | `js/20-mixer-layout.js:9360` | helper; callers in this range pass userPresetBulkRow, userPresetStatus, openPresetsFolderBtn (8421-8423); earlier callers belong to the other js/20 slices |
| `onclick (inline handler)` | read | `js/49-hotkey-binds.js:676` | clickableAncestor(): plain elements with an onclick property (index.html inline handlers, carousel palettes, colour chips) are bindable; moving them to addEventListener… |
| `openSidebarSection(<selector\|element>)` | read | `js/20-mixer-layout.js:9292` | window.openSidebarSection accepts a selector string or an element; callers elsewhere pass '.sidebar-section.section-layers' (js/05k-layers-render.js:76),… |
| `option[value="<mode>"]` | read | `js/47-pen-window.js:214` | mode in light \| smooth \| off (MIRROR_MODES 103-107); checks the saved mode still exists as an option |
| `resize-<n\|s\|e\|w\|nw\|ne\|se\|sw>` | read | `js/02-palettes.js:81` | the drag direction is READ from the handle's class name; the eight classes are listed as their own rows |
| `section:<title>` | both | `js/43-ui-visibility.js:151` | registry key for a sidebar section = 'section:' + .section-title text; SIMPLE_KEEP names 'Mutate shader','Swirl Together','Export','Brush' (49-57), SIMPLE_NEW_HIDDEN… |
| `skip-menu-<key>` | write | `js/66-skip-menu.js:108` | key in left \| top \| right \| bottom (REGIONS 29-34); CSS has one grid-area rule per name |
| `strip:<data-ui-key>` | both | `js/43-ui-visibility.js:138` | registry key for a top-bar cell = 'strip:' + el.dataset.uiKey; SIMPLE_KEEP pins 'strip:Presets','strip:Color','strip:Transport' (50-52); 44 reveals through… |
| `style.backgroundColor` | read | `js/49-hotkey-binds.js:194` | a wordless control (palette chip) is told apart by its INLINE background colour (194, 309); moving chip colours from inline style to CSS would break saved chip bindings |
| `zoom (computed)` | read | `js/49-hotkey-binds.js:988` | cssZoom() multiplies the computed zoom of every ancestor to size the native colour chooser; depends on css zoom: var(--ui-scale) staying a zoom, not a transform |

## Text keys

Persisted or matched text that doubles as a selector: section titles (collapse state in `sidebar.sections`, `ui.hiddenSections` as `section:<title>`, hotkey scopes, recipes, deep links), `data-ui-key` values (`strip:<key>`), button labels tests click by, window names and titles. A copy change here is a behaviour change for stored settings.

47 selectors.

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `01-buttons.css` | read | `js/38-button-audit.js:22` | the audit SANCTIONS colour rules by stylesheet FILENAME; renaming or inlining css/01-buttons.css, or adding a theme sheet that colours buttons, makes auditButtons()… |
| `<section title text>` | both | `js/12-save-load.js:486` | drawer collapse state persists by title text: captured 827, applied 486 and 1409 (x3). Also written by js/20-mixer-layout.js:9208 and js/43-ui-visibility.js:212.… |
| `Animations` | write | `js/20-mixer-layout.js:3787` | section title / collapse-state key |
| `Audio` | write | `js/20-mixer-layout.js:7206` | section title; persisted as a key of settings 'sidebar.sections' via .section-title textContent (9205-9208) |
| `Color` | read | `js/20-mixer-layout.js:2573` | data-ui-key value of the Color strip cell |
| `Colors and palettes` | write | `js/20-mixer-layout.js:4525` | section title / collapse-state key |
| `data-ui-key:"Brush Size"` | write | `js/20-mixer-layout.js:815` | stored by 43 as 'strip:Brush Size'; the cell moves into #sidebar-left .lsb-head |
| `data-ui-key:"Color Blend"` | write | `js/20-mixer-layout.js:836` | key stays 'Color Blend' while the printed label is 'Laminar / Blend' (CHANNEL_NAMES L899) |
| `data-ui-key:"Color"` | write | `js/20-mixer-layout.js:1207` | the colour cell (buildColorChannel) |
| `data-ui-key:"Density"` | write | `js/20-mixer-layout.js:852` | stored by 43 as 'strip:Density' |
| `data-ui-key:"Fluid"` | write | `js/20-mixer-layout.js:829` | key stays 'Fluid' while the cell is labelled by #materialMode and data-ui-label='Material Type' |
| `data-ui-key:"Isolation"` | write | `js/20-mixer-layout.js:835` | stored by 43 as 'strip:Isolation' |
| `data-ui-key:"Multi-Brush"` | write | `js/20-mixer-layout.js:837` | the channel lives inside the left sidebar's Multi-Brush section (L848), not the strip |
| `data-ui-key:"Presets"` | write | `js/20-mixer-layout.js:1736` | Presets cell; the Simple layout keeps this one (comment L1736) |
| `data-ui-key:"Time"` | write | `js/20-mixer-layout.js:851` | stored by 43 as 'strip:Time' |
| `data-ui-key:"Transport"` | write | `js/20-mixer-layout.js:1520` | Clear / Pause / Stop cell (.mixer-actions) |
| `data-ui-key:"Velocity"` | write | `js/20-mixer-layout.js:853` | stored by 43 as 'strip:Velocity' |
| `data-ui-key:"Viscosity"` | write | `js/20-mixer-layout.js:834` | stored by 43 as 'strip:Viscosity' |
| `data-ui-label:"Laminar / Blend"` | write | `js/20-mixer-layout.js:1166` | display label only; the stored key is data-ui-key 'Color Blend' |
| `data-ui-label:"Material Type"` | write | `js/20-mixer-layout.js:1155` | display label only (Settings > Interface, hotkey binds, the More list); the stored key is data-ui-key 'Fluid' |
| `Display` | write | `js/20-mixer-layout.js:4542` | section title / collapse-state key |
| `Effects` | write | `js/20-mixer-layout.js:4456` | section title / collapse-state key |
| `Export` | write | `js/20-mixer-layout.js:8023` | section title = persisted collapse key |
| `Focus` | write | `js/20-mixer-layout.js:7936` | section title = persisted collapse key |
| `hotkeys.controls` | both | `js/49-hotkey-binds.js:45` | persisted user bindings; each target is { id } (any control id, 214) OR { scope:{section:<.section-title text>}\|{id:<nearest ancestor id>}, tag, text, title,… |
| `Kaleidoscope` | write | `js/20-mixer-layout.js:4134` | section title / collapse-state key |
| `Layers` | write | `js/20-mixer-layout.js:3618` | section title / collapse-state key |
| `Mutate shader` | write | `js/20-mixer-layout.js:2916` | .section-title text = collapse-state key (settingsManager) + Sidebars.find/open target |
| `section-title:"Brush"` | write | `js/20-mixer-layout.js:819` | section title doubles as the collapse-state key (settingsManager, per README); the Brush section is unshifted to the top of the left sidebar |
| `section-title:"Multi-Brush"` | write | `js/20-mixer-layout.js:847` | section title = collapse-state key; the same word is also the Multi-Brush channel's data-ui-key (L837) |
| `section-title:"Swirl Together"` | read | `js/51-open-in-desktop.js:279` | a desktop deep link opens the room panel by its visible title; renaming the section silently stops the panel opening (js/44-recipes.js:535 also keys on section: 'Swirl… |
| `section:<title>` | read | `js/44-recipes.js:113` | parked 44: section titles hard-coded in the registry (see section-title row); renaming a section breaks its recipes |
| `section:Colors and palettes` | read | `js/65-palette-from-image.js:553` | js/43-ui-visibility.js keys sections as 'section:' + title text (43:151, 624); the Colors section title (js/20:4525 makeSection('Colors and palettes', ...)) is therefore… |
| `Settings` | both | `js/20-mixer-layout.js:8391`, `js/58-radial-menu.js:856` | section title = persisted collapse key |
| `sidebar.sections` | write | `js/20-mixer-layout.js:9208`, `js/43-ui-visibility.js:212` | the persisted map { <section title text>: collapsed } written by persistSectionState after every toggle; its reader (restore) is outside this range |
| `Simulation` | write | `js/20-mixer-layout.js:4157` | section title / collapse-state key |
| `Stabilization` | write | `js/20-mixer-layout.js:2426` | data-ui-key value on .lsb-steady (How-do-I tour / js/43 key) |
| `strip:<data-ui-key>` | read | `js/44-recipes.js:786` | parked 44: 'strip:' + target.strip and 'chrome:Quality bar' (792) are 43's registry keys |
| `strip:Color` | read | `js/20-mixer-layout.js:2572` | js/43 visibility key for the Color strip cell |
| `strip:Presets` | read | `js/20-mixer-layout.js:2577` | js/43 visibility key for the Presets strip cell |
| `Stroke and replay` | write | `js/20-mixer-layout.js:5027` | section title; collapse state persists by this text (settingsManager) and anything that finds a section by name reads it |
| `Swirl Together` | both | `js/20-mixer-layout.js:2582` | section title = persisted collapse key |
| `Swirl Together - Pen input` | both | `js/47-pen-window.js:274` | findChildWindow() locates the Electron BrowserWindow by its TITLE text; renaming the popup title breaks Fullscreen / Screen moves in the desktop build |
| `swirl-pen-input` | both | `js/47-pen-window.js:88` | NOT a DOM selector: the popup's window name. electron-main.js:338 PEN_WINDOW_FRAME must equal it (setWindowOpenHandler 891-892, 930) or the desktop build refuses the… |
| `Text` | write | `js/20-mixer-layout.js:6316` | section title; js/44-recipes.js:625-628 targets 'section: 'Text''; collapse state persists by this text |
| `ui.hiddenSections` | both | `js/43-ui-visibility.js:29` | persisted array of item keys: 'strip:<data-ui-key>' (138), 'section:<.section-title text>' (151), 'chrome:Quality bar' (155); renaming a strip key or a section title… |
| `ui.layoutChoice` | both | `js/43-ui-visibility.js:30` | 'simple'\|'full' once the fork was answered; ui.simpleVersion (64) stamps the Simple set version |

## Tier 2 (tests and bakes only)

Selectors that appear **only** in `scripts/test/**`, `scripts/bake-*.js`, `scripts/shot-helpers.js` or `scripts/copy-sink*`: 145. Not shipped, but renaming breaks a gate. Selectors the tests share with shipped code are in the tier-1 sections above (their test references are counted in the files column). Most tier-2-only ids are harness probes (`window.__test`, `__stage`), the copy-sink review page, the phone/ PWA, or ids the tests expect to be absent.

### Ids (71)

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `#btText1` | both | `scripts/test/brush-type/run.js:101` | TEST-CREATED scratch input (101); read 104; removed 106 |
| `#callReturnBtn` | read | `scripts/test/mp/mp-panel-e2e.js:248`, `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI must not come back) |
| `#chipLeft` | read | `scripts/test/mp/mp-phone-e2e.js:173` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#chipMain` | read | `scripts/test/mp/mp-phone-mouse.js:185` | phone/ pad page (PWA; outside the reskin but a gate): chip text |
| `#chipRight` | read | `scripts/test/mp/mp-phone-e2e.js:173` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#chipSub` | read | `scripts/test/mp/mp-phone-mouse.js:185` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#clearBtn` | read | `scripts/test/mp/mp-phone-e2e.js:360`, `scripts/test/mp/mp-phone-mouse.js:389` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#codeInput` | read | `scripts/test/mp/mp-phone-mouse.js:480` | phone/ pad page (PWA; outside the reskin but a gate): placeholder 480, 483; value 486, 506 |
| `#codeLabel` | read | `scripts/test/mp/mp-phone-e2e.js:458` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#collisionStrength` | read | `scripts/test/inventory/params.json:1032` | per-layer control with NO DOM id (encapsulated range in the Layers row); listed by id for the sweep |
| `#confirmSheet` | read | `scripts/test/mp/mp-phone-e2e.js:361`, `scripts/test/mp/mp-phone-mouse.js:390` | phone/ pad page (PWA; outside the reskin but a gate): hidden state |
| `#confirmText` | read | `scripts/test/mp/mp-phone-mouse.js:390` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#confirmYes` | read | `scripts/test/mp/mp-phone-e2e.js:362`, `scripts/test/mp/mp-phone-mouse.js:392` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#cs-review` | write | `scripts/copy-sink/review.js:538` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): the tour card (CSS in the injected #cs-review-style,… |
| `#cs-review-spot` | write | `scripts/copy-sink/review.js:300` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): the ring around the current control |
| `#cs-review-style` | write | `scripts/copy-sink/review.js:534` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): injected, UNLAYERED stylesheet; also the existence check 533 |
| `#editMenuDoor` | both | `scripts/test/radial-menu/settings.js:53` | test-assigned id on the 'Edit the menu' button (53), clicked by '#editMenuDoor' 55 |
| `#focus-hint` | read | `scripts/bake-trailer-scenes.js:53` | hidden |
| `#focus-mode-badge` | read | `scripts/bake-trailer-scenes.js:53`, `scripts/test/inventory/hotkeys.json:366` | element named by the hotkey inventory (handler target, assertion or effect); run-inputs evaluates the assertion exprs |
| `#fullscreenBtn` | read | `scripts/test/mp/mp-phone-e2e.js:458` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#guide-kaleido` | read | `scripts/test/pen-window/guides.js:248` | pen window document (written by js/47): kaleido guide SVG 248 ('#guide-kaleido > g'), 252, 256, 285, 291, 295 |
| `#guide-mandala` | read | `scripts/test/pen-window/guides.js:303` | pen window document (written by js/47): mandala guide SVG 303, 308, 320 |
| `#guide-strokeLock` | read | `scripts/test/pen-window/guides.js:178` | pen window document (written by js/47): stroke-lock guide SVG 178, 205, 230, 239 ('#guide-strokeLock g') |
| `#installBtn` | read | `scripts/test/mp/mp-phone-e2e.js:397` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#installCard` | read | `scripts/test/mp/mp-phone-e2e.js:397` | phone/ pad page (PWA; outside the reskin but a gate): 397, 458 |
| `#installMenuBtn` | read | `scripts/test/mp/mp-phone-e2e.js:405` | phone/ pad page (PWA; outside the reskin but a gate): hidden state |
| `#installText` | read | `scripts/test/mp/mp-phone-e2e.js:398` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#joinBtn` | read | `scripts/test/mp/mp-phone-mouse.js:480` | phone/ pad page (PWA; outside the reskin but a gate): text 480, 483; tapped 507 |
| `#landing` | read | `scripts/test/mp/mp-phone-e2e.js:391`, `scripts/test/mp/mp-phone-mouse.js:429` | phone/ pad page (PWA; outside the reskin but a gate): hidden state 391, 424, 442, 448 |
| `#landingNote` | read | `scripts/test/mp/mp-phone-mouse.js:469` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#lead` | read | `scripts/test/mp/mp-phone-e2e.js:483` | phone/ pad page (PWA; outside the reskin but a gate): lead text |
| `#leaveBtn` | read | `scripts/test/mp/mp-phone-e2e.js:390`, `scripts/test/mp/mp-phone-mouse.js:265` | phone/ pad page (PWA; outside the reskin but a gate): text 265; tapped 422, 428, 505, 512 |
| `#mask-editor` | read | `scripts/copy-sink/harvest-page.js:38` | copy-sink harvest walker (evaluated in the app page): scope root |
| `#maskEditorModal` | read | `scripts/copy-sink/harvest-page.js:38` | copy-sink harvest walker (evaluated in the app page): scope root |
| `#meDot` | read | `scripts/test/mp/mp-phone-mouse.js:301` | phone/ pad page (PWA; outside the reskin but a gate): backgroundColor = computer colour |
| `#menuHead` | read | `scripts/test/mp/mp-phone-mouse.js:265` | phone/ pad page (PWA; outside the reskin but a gate): menu heading |
| `#moreBtn` | read | `scripts/test/mp/mp-phone-e2e.js:359`, `scripts/test/mp/mp-phone-mouse.js:388` | phone/ pad page (PWA; outside the reskin but a gate): 388, 421, 427, 504, 511 |
| `#moreMenu` | read | `scripts/test/mp/mp-phone-e2e.js:466` | phone/ pad page (PWA; outside the reskin but a gate): '#moreMenu a' count |
| `#mpRhythm` | read | `scripts/test/mp/mp-panel-e2e.js:248`, `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI must not come back) |
| `#mpTurnChip` | read | `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI) |
| `#pad` | read | `scripts/test/mp/mp-phone-e2e.js:159`, `scripts/test/mp/mp-phone-mouse.js:163` | phone/ pad page (PWA; outside the reskin but a gate): pad rect 159, 173 |
| `#passBtn` | read | `scripts/test/mp/mp-phone-e2e.js:352`, `scripts/test/mp/mp-phone-mouse.js:265` | phone/ pad page (PWA; outside the reskin but a gate): must be absent (no turns) |
| `#qualityBar` | read | `scripts/copy-sink/harvest-page.js:41` | copy-sink harvest walker (evaluated in the app page): scope root |
| `#recPlaybackSpeed` | read | `scripts/test/inventory/features.json:317` | element named by a feature activation recipe or its shared-state notes |
| `#rejoinBtn` | read | `scripts/test/mp/mp-phone-e2e.js:396`, `scripts/test/mp/mp-phone-mouse.js:429` | phone/ pad page (PWA; outside the reskin but a gate): hidden 396; tapped 426 |
| `#rejoinCode` | read | `scripts/test/mp/mp-phone-e2e.js:396` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#rejoinText` | read | `scripts/test/mp/mp-phone-mouse.js:429` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#rotateHint` | read | `scripts/test/mp/mp-phone-e2e.js:174` | phone/ pad page (PWA; outside the reskin but a gate): hidden state |
| `#savedColors` | read | `scripts/test/inventory/hotkeys.json:258` | element named by the hotkey inventory (handler target, assertion or effect); run-inputs evaluates the assertion exprs |
| `#secStroke` | both | `scripts/test/radial-menu/settings.js:71` | TEST-ASSIGNED id on the Stroke section header; read 71, 95, 96, 97, 98 |
| `#sendLinkBtn` | read | `scripts/test/mp/mp-phone-e2e.js:466` | phone/ pad page (PWA; outside the reskin but a gate): offsetParent 466; clicked 468 |
| `#settingsLockBtn` | read | `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI) |
| `#sizeRange` | read | `scripts/test/mp/mp-phone-e2e.js:174` | phone/ pad page (PWA; outside the reskin but a gate): must be absent on the pad-only page |
| `#skText` | both | `scripts/test/skip-menu/run.js:131` | TEST-CREATED scratch input appended to body (131), removed 136 |
| `#step2` | read | `scripts/test/mp/mp-phone-mouse.js:430` | phone/ pad page (PWA; outside the reskin but a gate): 430, 480, 483 |
| `#step3` | read | `scripts/test/mp/mp-phone-e2e.js:458` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#studioDrawer` | read | `scripts/copy-sink/harvest-page.js:37` | copy-sink harvest walker (evaluated in the app page): scope root |
| `#toast` | read | `scripts/test/mp/mp-phone-e2e.js:472` | phone/ pad page (PWA; outside the reskin but a gate): hidden + text |
| `#toast-container` | read | `scripts/bake-trailer-scenes.js:53` | hidden |
| `#togetherBtn` | read | `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI) |
| `#turnLength` | read | `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI) |
| `#turnPassBtn` | read | `scripts/test/mp/mp-panel-e2e.js:248`, `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI must not come back) |
| `#turnsBtn` | read | `scripts/test/mp/mp-panel-e2e.js:248`, `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI must not come back) |
| `#turnSkipBtn` | read | `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI) |
| `#turnStatus` | read | `scripts/test/mp/mp-panel-e2e.js:248` | asserted ABSENT (retired turns UI must not come back) |
| `#turnWheel` | read | `scripts/test/mp/mp-panel-e2e.js:248`, `scripts/test/mp/mp-share-e2e.js:167` | asserted ABSENT (retired turns UI must not come back) |
| `#veil` | read | `scripts/test/mp/mp-phone-mouse.js:186` | phone/ pad page (PWA; outside the reskin but a gate): hidden state |
| `#veilActions` | read | `scripts/test/mp/mp-phone-mouse.js:406` | phone/ pad page (PWA; outside the reskin but a gate): '#veilActions button' 406, 417 (chosen by text 'Use this phone') |
| `#veilText` | read | `scripts/test/mp/mp-phone-mouse.js:186` | phone/ pad page (PWA; outside the reskin but a gate) |
| `#wayMouse` | read | `scripts/test/mp/mp-phone-mouse.js:430` | phone/ pad page (PWA; outside the reskin but a gate): aria-pressed 430, 483; tapped 482 |
| `#wayRoom` | read | `scripts/test/mp/mp-phone-mouse.js:479` | phone/ pad page (PWA; outside the reskin but a gate): 479; aria-pressed 480 |

### Classes (29)

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `.channel-label` | read | `scripts/copy-sink/harvest-page.js:103` | copy-sink harvest walker (evaluated in the app page): label element inside a row |
| `.colour-now` | read | `scripts/test/mp/mp-phone-e2e.js:174` | phone/ pad page (PWA; outside the reskin but a gate) |
| `.copy-sink` | read | `scripts/copy-sink/harvest-page.js:129` | copy-sink harvest walker (evaluated in the app page): the sink's own nodes are skipped (129, 166) |
| `.focus-hint` | read | `scripts/bake-trailer-scenes.js:53` | hidden |
| `.fx-label` | read | `scripts/copy-sink/harvest-page.js:103` | copy-sink harvest walker (evaluated in the app page): label element inside a row |
| `.here` | write | `scripts/copy-sink/review.js:375` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): current dot |
| `.layer-name` | read | `scripts/copy-sink/harvest-page.js:103` | copy-sink harvest walker (evaluated in the app page): label element inside a row |
| `.mask-editor` | read | `scripts/copy-sink/harvest-page.js:38` | copy-sink harvest walker (evaluated in the app page): scope root |
| `.mixer-label` | read | `scripts/copy-sink/harvest-page.js:103` | copy-sink harvest walker (evaluated in the app page): label element inside a row |
| `.mp-hint` | read | `scripts/test/mp/mp-panel-e2e.js:220` | door prose |
| `.mp-or` | read | `scripts/test/mp/mp-panel-e2e.js:220` | door prose |
| `.mp-sub` | read | `scripts/test/mp/mp-panel-e2e.js:220` | door prose |
| `.quality-bar` | read | `scripts/copy-sink/harvest-page.js:41` | copy-sink harvest walker (evaluated in the app page): scope root |
| `.rv-dots` | write | `scripts/copy-sink/review.js:373` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-files` | write | `scripts/copy-sink/review.js:407` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-head` | write | `scripts/copy-sink/review.js:362` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-icon` | write | `scripts/copy-sink/review.js:364` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-label` | write | `scripts/copy-sink/review.js:388` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-list` | write | `scripts/copy-sink/review.js:496` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-mid` | write | `scripts/copy-sink/review.js:449` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-nav` | write | `scripts/copy-sink/review.js:444` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-note` | write | `scripts/copy-sink/review.js:403` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-quote` | write | `scripts/copy-sink/review.js:323` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-row` | write | `scripts/copy-sink/review.js:409` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.rv-where` | write | `scripts/copy-sink/review.js:383` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): card part |
| `.toast` | read | `scripts/bake-trailer-scenes.js:53` | hidden |
| `.toast-container` | read | `scripts/bake-trailer-scenes.js:53` | hidden |
| `.tools` | read | `scripts/test/mp/mp-phone-e2e.js:174` | phone/ pad page (PWA; outside the reskin but a gate): '.tools,.colour-now' must be absent |
| `.underbar` | read | `scripts/copy-sink/harvest-page.js:41` | copy-sink harvest walker (evaluated in the app page): scope root |

### Tag and attribute selectors (8)

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `[title]` | read | `scripts/copy-sink/review.js:23` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): byTitle() finds controls by tooltip prefix |
| `a[href*="full=1"]` | read | `scripts/test/mp/mp-phone-e2e.js:466` | phone/ pad page (PWA; outside the reskin but a gate): no link to the full app on a phone |
| `button, input, select` | read | `scripts/test/mp/mp-panel-e2e.js:139` | controls listed in the shown view |
| `button, input, select, [tabindex]:not([tabindex="-1"])` | read | `scripts/test/popup-focus/run.js:42` | first focusable in the Presets panel |
| `button, input:not([type=hidden]), select, textarea, a[href], [tabindex]` | read | `scripts/test/skip-menu/run.js:59` | focusable-element probe for the first/last Tab stop (59, 169) |
| `input[id],select[id],button[id]` | read | `scripts/bake-trailer-scenes.js:65` | probe(): every control id matching the trailer regex is listed |
| `input[type=file]` | read | `scripts/test/audio/probes/per-track.js:51` | cue file picker |
| `label[for="cursorToggle"]` | read | `scripts/test/focus-keys/run.js:68` | the checkbox's label (fallback closest('label')) |

### String-built patterns (23)

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `#<checkboxId>` | read | `scripts/test/pen-window/guides.js:143` | setMain('cursorToggle') 144 |
| `#<controlId>` | read | `scripts/test/pen-window/web-headless.js:36` | opens the section holding the control, scrolls it, hit-tests its centre |
| `#<dialogId>` | read | `scripts/test/dialog-focus/run.js:42` | dialog ids checked for role/aria-modal/aria-labelledby: resetAppModal 50, appConfirmModal 64, hotkeyOverlay 92, deletePaletteModal 116 |
| `#<padId>` | read | `scripts/test/mp/mp-phone-e2e.js:171` | phone/ pad page (PWA; outside the reskin but a gate): pad, chipLeft, chipRight (173) |
| `#<params[].id>` | read | `scripts/test/run-sweep.js:200` | slider min/max read from the DOM when the inventory has none |
| `#<popoverId>` | read | `scripts/test/mp/mp-panel-e2e.js:156` | POP('mpInvitePop') 262 |
| `#<q.id>` | read | `scripts/copy-sink/locate.js:15` | copy-sink locate.js (injected by 'copy-sink serve', never shipped): id from the #locate= hash |
| `#<registryId>` | read | `scripts/test/mp/mp-look-parity-e2e.js:116`, `scripts/test/mp/mp-share-e2e.js:146` | SET('kaleidoMode') 174; VAL ids sharpness, velocityInfluence, kaleidoSegments, brushSize 194, 254; burst ids 295-297: densityDissipation… |
| `#<selectId>` | read | `scripts/bake-demo-capsules.js:199`, `scripts/bake-og-card.js:65` | visualResolution 211, physicsResolution 212 |
| `#buttonMode_<left\|right\|middle>` | read | `scripts/test/radial-menu/wheel.js:279` | per-mouse-button role selects |
| `#guidesMenu input[data-guide="<kaleido\|mandala>"]` | read | `scripts/test/pen-window/guides.js:284` | pen window document (written by js/47) |
| `#palettePreview .palette-chip-wrap[data-hex="<HEX>"] .palette-chip` | read | `scripts/test/palette-picker/run.js:146` | chip located by its hex |
| `#penWindowScreens input[value="<displayId>"]` | read | `scripts/test/pen-window/electron-probe.js:146` | string-built from the Electron display id |
| `/modal\|overlay/ on class` | read | `scripts/copy-sink.js:359` | inDialog(): any ancestor class matching modal\|overlay |
| `<hotkeys.json assertion.expr>` | read | `scripts/test/run-inputs.js:13` | evaluates each binding's assertion expression (today: document.getElementById('hotkeyOverlay').style.display) |
| `<keySpec.target>` | read | `scripts/test/harness.js:445` | key(spec) dispatches on a scenario-supplied selector (none supplied today; default body) |
| `<popupSelector>` | read | `scripts/test/popup-focus/run.js:23` | popups probed: '#mpRoomMenu' 91, 94; '#mpInvitePop' 98, 101; '#mixer-more-panel' 113, 116 (and the Presets panel through s) |
| `<selector>` | read | `scripts/test/palette-extract/ui.js:51`, `scripts/test/palette-picker/run.js:15` | '#canvas' 43, '#colorPicker' 82, '#backgroundColorPicker' 105, '#paletteAddChip' 116, '#palettePickerHost .cp-hex' 121, '#palettePickerHost… |
| `[<q.attr>]` | read | `scripts/copy-sink/locate.js:32` | copy-sink locate.js (injected by 'copy-sink serve', never shipped): attribute named in the hash (title, placeholder, aria-label, data-tip) |
| `[class*="hint"], [class*="help"], [class*="note"], [class*="desc"], [class*="caption"], [class*="empty"], [id*="Hint"], [id*="hint"]` | read | `scripts/copy-sink/harvest-page.js:136` | copy-sink harvest walker (evaluated in the app page): hint-like elements by substring |
| `[data-peer-line="<key>"]` | read | `scripts/test/mp/mp-text-e2e.js:341` | string-built from the peer line key |
| `document.getElementById('hotkeyOverlay').style.display` | read | `scripts/test/inventory/hotkeys.json:13` | the one machine-readable assertion today (run-inputs evaluates it) |
| `HINT_RE /hint\|help\|note\|desc\|caption\|tip\|pw-\|footer\|splash\|warn\|empty\|status\|message\|blurb\|sub\|intro\|lead/i on class or id` | read | `scripts/copy-sink.js:318` | classifies hint-like text blocks (436) |

### Text keys (14)

| Selector | Mode | Files (first line each) | Purpose |
|---|---|---|---|
| `#copyRoomBtn text 'Copied'` | read | `scripts/test/mp/mp-panel-e2e.js:276` | copy feedback label asserted |
| `#multiplayerStatus text 'Waiting for friends · just you'` | read | `scripts/test/mp/mp-share-e2e.js:312` | alone-again status asserted |
| `#pauseBtn text '▶'` | read | `scripts/bake-demo-capsules.js:592`, `scripts/bake-headless.js:67`, `scripts/bake-og-card.js:114`, `scripts/bake-trailer.js:183`, `scripts/test/pen-window/device-switch.js:104`, `scripts/test/pen-window/guides.js:93`; +2 more | paused glyph recognised by text |
| `button text 'Add another'` | read | `scripts/test/radial-menu/settings.js:111` | bind-bar action chosen by label |
| `button text 'Canvas'` | read | `scripts/test/palette-extract/ui.js:224` | palette-list button found by label |
| `button text 'Edit the menu'` | read | `scripts/test/radial-menu/settings.js:53` | the Button modes door is found by its label |
| `button text 'Reset'` | read | `scripts/bake-screenshots.js:82` | the Mutate panel's Reset is found by its label and clicked |
| `button text 'Use this phone'` | read | `scripts/test/mp/mp-phone-mouse.js:417` | phone/ pad page (PWA; outside the reskin but a gate) |
| `hint text 'Drag on the canvas to paint'` | read | `scripts/bake-og-card.js:90` | the first-run hint element is found by its words and REMOVED before the shot |
| `menu item text 'Rename'` | read | `scripts/test/palette-picker/run.js:224` | palette menu item found by label |
| `section header text (label, case-folded)` | read | `scripts/shot-helpers.js:210` | section(label) opens the section whose header contains the label |
| `section title 'Colors and palettes'` | read | `scripts/test/palette-picker/run.js:112` | section found by its title text |
| `section title 'Stroke and replay'` | read | `scripts/test/radial-menu/settings.js:71` | tagSection finds the section by its title text |
| `tooltips 'Chisel brush', 'Swirls paint', 'Controls for left mouse', 'Photosensitivity protection'; button texts 'From Image', 'Ignite'` | read | `scripts/copy-sink/review.js:106` | copy-sink review tour (?review; injected by 'copy-sink serve', never shipped): controls located by their copy (106, 117, 146, 170, 189, 198) |

## Classes script writes that no stylesheet mentions

Tier-1 classes with a `write` side whose token (`.name` followed by a non-word character) appears in none of the 12 files in `css/` nor in the 1 inline `<style>` block of `index.html`: **104 of 1043** written classes. These are safe to leave alone (renaming them changes nothing on screen), and they are free hooks if a theme rule wants one; the *writer* column says whether only static markup declares the class (then only HTML, no JS, carries it). The *injected* column is a hint: the class token appears in one of the four JS files that inject a `<style>` (`js/00a`, `16`, `32`, `47`), so it may be styled by an unlayered sheet; not verified. Classes matched only through `[class*=…]` attribute selectors would be missed by this grep (none of today's CSS uses one).

| Class | Writer | Files (first line each) | Injected sheet? | Purpose |
|---|---|---|---|---|
| `.ace-wrap` | JS | `js/40b-audio-cue-editor.js:671` |  | root of the cue editor, mounted into #audioCueEditorHost (js/20-mixer-layout.js:7673-7677); no stylesheet rule mentions it |
| `.anim-lib-rename` | JS | `js/20-mixer-layout.js:4031` |  | rename button |
| `.app-close-safe` | JS | `js/04f-canvas-actions.js:637` |  | on #appCloseQuit after a successful save (the go-ahead is now safe); no rule in css/ (write-only) |
| `.ar-sub-control` | JS | `js/20-mixer-layout.js:7773` |  | 'control-group ar-sub-control' on the Spin speed (7773) and Change colour every (7797) rows; NO stylesheet mentions it |
| `.arm-mode-btn` | JS | `js/20-mixer-layout.js:9004` |  | modifier on the arm mode radios; carries data-mode; NO stylesheet mentions it |
| `.arm-sym-note` | JS | `js/20-mixer-layout.js:8656` |  | symmetry note div, inline cssText; updateSymNote always sets textContent '' (8693) so it renders empty; NO stylesheet mentions it |
| `.arm-tip-same` | JS | `js/20-mixer-layout.js:728` |  | 'Same as the brush' option |
| `.atv-cue-files` | JS | `js/40-audio-timing.js:1695` |  | Save/Open .swirlcues row (with atv-foot); no stylesheet rule mentions it |
| `.boot-cursor` | JS | `js/00a-boot.js:365` | `js/00a-boot.js` | on <html> while the boot cursor is up (removed 395); styled ONLY by the injected #boot-cursor-style sheet, no rule in css/ |
| `.boot-error-card` | markup + JS | `index.html:152` |  | global error card: read at 152 (cap at 3 concurrent), created at 163; styled only by inline cssText, no stylesheet rule |
| `.brush-ghost-group` | static markup only | `index.html:1067` |  | static markup; on div; css rules: 0 |
| `.brush-shapes-area` | JS | `js/20-mixer-layout.js:6022`, `js/32-file-drop.js:57` | `js/32-file-drop.js` | wrapper of the shape row + actions + hidden file input; the comment names it as js/32-file-drop.js's drop target (not verified in this slice) |
| `.button-roles-lock` | JS | `js/20-mixer-layout.js:4629` |  | 'No button set to paint' notice; inline cssText with hard-coded colours (4630-4632); inline display toggled (4636) |
| `.ch-canonical` | JS | `js/20-mixer-layout.js:1062` |  | display:none (inline) wrapper around a curved fader's canonical <input>; hides the printed scale 06 wraps around it |
| `.ch-material` | JS | `js/20-mixer-layout.js:1152` |  | Fluid cell whose label is the material picker; kept as a hook per comment L1151 |
| `.ch-perceptual` | JS | `js/20-mixer-layout.js:1071`, `js/49-hotkey-binds.js:655` |  | visible 0-1 proxy range of the four curved faders (#<id>Perceptual); --val written on it |
| `.close` | static markup only | `index.html:539` | `js/47-pen-window.js` | static markup; on button; css rules: 0 |
| `.close-btn` | static markup only | `index.html:1613` |  | static markup; on button[type=button]; css rules: 0 |
| `.collapsible` | static markup only | `index.html:815` |  | x8 in static markup (lines 815, 845, 858, 933, 979, 1146, …); on div; css rules: 0 |
| `.collider-colour-input` | JS | `js/05k-layers-render.js:481` |  | collider <input type=color>; read 217 and via '.layer-item[data-layer-index="N"] .collider-colour-input' 237 (undo writes its value); no rule in css/… |
| `.collision-invert-cb` | JS | `js/05k-layers-render.js:457` |  | depth-collider Invert checkbox (data-cinv); read 546; no rule in css/ matches it |
| `.cp-swatch-new` | JS | `js/64-colour-picker.js:209` |  | the 'now' half; inline style.background = hex 405. No stylesheet mentions this class |
| `.cp-swatch-old` | JS | `js/64-colour-picker.js:208` |  | the 'before' half; inline style.background = original 404; click reverts 448. No stylesheet mentions this class (styled via .cp-swatch > span?) |
| `.delete-modal-cancel` | markup + JS | `index.html:1996`, `js/01-config.js:1078`, `js/04f-canvas-actions.js:658`, `js/05e-effect-controls.js:252`, `js/20-mixer-layout.js:375`; +2 more |  | no rule in css/ (write-only; the button is styled as a plain .delete-modal-actions button) |
| `.delete-modal-confirm` | markup + JS | `index.html:1997`, `js/04f-canvas-actions.js:660`, `js/05e-effect-controls.js:253`, `js/20-mixer-layout.js:376`, `js/24-path-layers.js:878`; +1 more |  | no rule in css/ (write-only); the look comes from btn--destructive |
| `.dither-draw` | static markup only | `index.html:1202` |  | static markup; on div; css rules: 0 |
| `.edition-demo` | JS | `js/52-demo-clock.js:356` |  | body marker for the demo edition; no stylesheet rule mentions it today (a free theming hook, and it shows up in js/61's 'format' field) |
| `.electron-mode` | JS | `js/00-window-controls.js:16` |  | platform tag on <body> in the Electron renderer (17-19). NO rule in css/ or index.html mentions it today; only its sibling .web-mode is styled |
| `.engaged` | JS | `js/15-layer-masking.js:1758` |  | on #smartSelectBtn while Instant Roto mode is on (1758 add, 1871 remove); no rule in css/ matches it |
| `.eraser` | JS | `js/20-mixer-layout.js:5637` |  | modifier on .brush-preset-btn for presets saved with BRUSH_ERASER on |
| `.file-drop-hover` | JS | `js/32-file-drop.js:69` | `js/32-file-drop.js` | drop-hover highlight on the zone under the pointer; styled ONLY by the <style> this file injects at 76-80 (unlayered; outline and background-color… |
| `.grid-line` | static markup only | `index.html:1251` |  | x2 in static markup (lines 1251, 1252); on div; css rules: 0 |
| `.grow` | JS | `js/47-pen-window.js:296` | `js/47-pen-window.js` | pen window: the status span's flex-grow class |
| `.guide` | JS | `js/47-pen-window.js:307` | `js/47-pen-window.js` | pen window: the three guide <svg>s over the mirror (display:none until marks exist; style.display toggled 1370) |
| `.has-preset` | JS | `js/20-mixer-layout.js:1748` |  | .mixer-presets-trigger-label when a saved preset name is shown |
| `.hk-binding` | JS | `js/49-hotkey-binds.js:1073` |  | on <body> for the whole of bind mode (add 1073, remove 1123) |
| `.hk-offer-lead` | JS | `js/49-hotkey-binds.js:951` |  | 'Hotkey to' / 'Add' lead-in |
| `.hk-step-label` | JS | `js/49-hotkey-binds.js:746` |  | step label |
| `.hk-wheel-name` | JS | `js/49-hotkey-binds.js:563` |  | slider name in the wheel pill |
| `.horizontal` | static markup only | `index.html:1252` |  | static markup; on div; css rules: 0 |
| `.hotkey-credits` | static markup only | `index.html:1717` |  | static markup; on span; css rules: 0 |
| `.idle` | JS | `js/47-pen-window.js:1333` | `js/47-pen-window.js` | pen window: #bar auto-hide state (rule 294) |
| `.img-clip-invert` | JS | `js/05k-layers-render.js:426` |  | picture layer Clip Inv checkbox; read 505; no rule in css/ matches it |
| `.img-clip-select` | JS | `js/05k-layers-render.js:426` |  | picture layer Clip <select>; read 496; no rule in css/ matches it |
| `.layer-delete-btn` | JS | `js/05k-layers-render.js:52`, `js/44-recipes.js:335` |  | second class on the header trash button; no rule in css/ matches it (grep), left for scripts/tests |
| `.layer-mask-check` | JS | `js/05k-layers-render.js:387` |  | mask / collision enable checkbox (data-layer); read 601 to wire change -> toggleImageLayerMask |
| `.layer-row-blend` | JS | `js/05k-layers-render.js:330` |  | paint layer Blend field row |
| `.layer-row-clip` | JS | `js/05k-layers-render.js:126` |  | Clip dropdown + Inv row (paint 341, picture 426) |
| `.layer-row-colour` | JS | `js/05k-layers-render.js:481` |  | collider Color field row |
| `.layer-row-cthresh` | JS | `js/05k-layers-render.js:456` |  | depth-collider Threshold slider row; read via mountLayerSlider 533 |
| `.layer-row-invert` | JS | `js/05k-layers-render.js:457` |  | depth-collider Invert field row |
| `.layer-row-key` | JS | `js/05k-layers-render.js:401` |  | Feather / Threshold slider row; read via mountLayerSlider 490 |
| `.layer-row-mode` | JS | `js/05k-layers-render.js:448` |  | collider Mode field row |
| `.layer-row-opacity` | JS | `js/05k-layers-render.js:329` |  | Opacity slider row (329 paint, 479 picture); read via mountLayerSlider 186 |
| `.layer-row-strength` | JS | `js/05k-layers-render.js:453` |  | collider Strength slider row; read via mountLayerSlider 525 |
| `.layer-vis-check` | JS | `js/05k-layers-render.js:62` |  | header show/hide checkbox (data-vis); read 572 to wire change -> toggleSimLayer / toggleLayer; no rule in css/ matches it (styled via .layer-vis… |
| `.light-gradient-overlay` | static markup only | `index.html:1255`, `js/13-light-source.js:202` |  | inline style.background = radial-gradient(... rgba(255,255,200,.3) ...) follows the dot (204-207). NO rule in css/ mentions this class: it is styled… |
| `.light-grid` | static markup only | `index.html:1250` |  | static markup; on div; css rules: 0 |
| `.locked` | JS | `js/20-mixer-layout.js:1391` |  | Ignite button while latched on (add L1434, L1451; remove L1391) |
| `.look-link-copy` | JS | `js/50-look-links.js:1099` |  | mount-once guard (1099) and the 'Link to current settings' button's identity class (1104); no stylesheet rule mentions it (btn--sm carries the skin) |
| `.lsb-panel` | JS | `js/20-mixer-layout.js:5406` |  | Brush panel root, left-sidebar panel marker (css/21-sidebar.css undoes the popup skin inside the sidebar) |
| `.mask-clear-btn` | JS | `js/05k-layers-render.js:430` |  | Clear Mask button (430, 466); no rule in css/ matches it |
| `.mask-create-btn` | JS | `js/05k-layers-render.js:437` |  | Create Mask button (437, 467); no rule in css/ matches it |
| `.mask-rotation-control` | JS | `js/15-layer-masking.js:314` |  | on #maskRotationControl; styled only by its inline style attribute |
| `.mask-tools-row` | JS | `js/15-layer-masking.js:209` |  | the step-1 tab strip (also mask-tool-tabs, role=tablist); display toggled 2946, 3001, 3300; no rule in css/ matches .mask-tools-row (CSS uses… |
| `.mixer-more-panel` | JS | `js/46-strip-more.js:272` |  | 'arm-colors-panel mixer-more-panel' |
| `.mp-owner-dot` | JS | `js/06e-mp-panel.js:162`, `js/20-mixer-layout.js:6584` |  | owner dot on a room text line (inline size/colour); js/06e-mp-panel.js:153-164 queries the class and repaints by data-peer |
| `.mp-room-report` | JS | `js/61-room-report.js:171` |  | identity class on the report item; no stylesheet rule mentions it |
| `.mp-share-mode` | static markup only | `index.html:1450` |  | x3 in static markup (lines 1450, 1451, 1452); on button[type=button]; css rules: 0 |
| `.mutation-btn-primary` | JS | `js/20-mixer-layout.js:2997` |  | Mutate button emphasis |
| `.mutation-crumb-arrow` | JS | `js/20-mixer-layout.js:3554` |  | arrow between crumbs |
| `.muted` | JS | `js/20-mixer-layout.js:7473` |  | on #audioMuteBtn while playback is muted; NO stylesheet mentions it (glyph change carries the state) |
| `.palette-menu` | JS | `js/01-config.js:239` |  | marks the palette context menu; outside-click guard of the list keeps clicks inside it; css rules: 0 |
| `.path-brush-slider` | JS | `js/24-path-layers.js:622` |  | range input, wired by data-action=brush; no rule in css/ (write-only) |
| `.path-flow-slider` | JS | `js/24-path-layers.js:627` |  | range input, wired by data-action=flow; no rule in css/ (write-only) |
| `.path-mode-select` | JS | `js/24-path-layers.js:637` |  | loop / pingpong / once select, data-action=mode; no rule in css/ (write-only) |
| `.path-speed-slider` | JS | `js/24-path-layers.js:617` |  | range input, wired by data-action=speed; no rule in css/ (write-only) |
| `.pfi-cancel` | JS | `js/65-palette-from-image.js:497` |  | Cancel button; no stylesheet mentions .pfi-cancel (styled only through btn--ghost) |
| `.pfi-save` | JS | `js/65-palette-from-image.js:500` |  | Save palette button; no stylesheet mentions .pfi-save (styled only through btn--emphasis) |
| `.pinned` | JS | `js/12-save-load.js:139` |  | pinned state of #statsPinBtn (read 139, written 334); unreachable today because #statsPinBtn does not exist; no stylesheet mentions .pinned |
| `.pr-dot` | JS | `js/47-pen-window.js:1231` | `js/47-pen-window.js` | pen window: hotspot dot svg inside #ring; style.display toggled against .pr-p (1264-1266) |
| `.pr-p` | JS | `js/47-pen-window.js:1234` | `js/47-pen-window.js` | pen window: the P badge for pressure mode |
| `.pw-symptoms` | static markup only | `index.html:316` |  | static markup; on p; css rules: 0 |
| `.qub-dd-val` | JS | `js/20-mixer-layout.js:2773` |  | current value span; id #<selectId>DdVal |
| `.raster-blend-select` | JS | `js/05k-layers-render.js:330` |  | paint layer Blend <select>; read 348 to wire change; no rule in css/ matches it |
| `.raster-clip-invert` | JS | `js/05k-layers-render.js:341` |  | paint layer Clip Inv checkbox; read 362; no rule in css/ matches it |
| `.raster-clip-select` | JS | `js/05k-layers-render.js:341` |  | paint layer Clip <select>; read 354; no rule in css/ matches it |
| `.raster-paint-btn` | JS | `js/05k-layers-render.js:337`, `js/05l-layers-transform.js:827` |  | 'Paint into this layer' button, rendered with class active when it is the paint target; js/05l:827 toggles active in place; no rule in css/ matches… |
| `.rec-close` | static markup only | `index.html:1605` |  | static markup; on button; css rules: 0 |
| `.rec-strip-length` | static markup only | `index.html:1566` |  | static markup; on div; css rules: 0 |
| `.rec-strip-source` | static markup only | `index.html:1575` |  | static markup; on div; css rules: 0 |
| `.rec-take-ask` | JS | `js/03-recording.js:317` |  | question text span; read L327 to set textContent; no stylesheet rule mentions it |
| `.recipe-foot-hotkeys` | JS | `js/44-recipes.js:1185` |  | parked 44: 'recipe-foot-hotkeys btn--ghost btn--sm' Hotkeys (F1) (1217) |
| `.recipe-pill-again` | JS | `js/44-recipes.js:993` |  | parked 44: Point again (1000, 1035) |
| `.recipe-pill-back` | JS | `js/44-recipes.js:995` |  | parked 44 (1004, 1036) |
| `.recipe-pill-demo` | JS | `js/44-recipes.js:994` |  | parked 44 (1010, 1031) |
| `.recipe-pill-key` | JS | `js/44-recipes.js:989` |  | parked 44 (1021) |
| `.recipe-pill-next` | JS | `js/44-recipes.js:996` |  | parked 44: 'recipe-pill-next btn--emphasis' (1008, 1034) |
| `.reset-app-hint-text` | JS | `js/60-reset-app.js:371` |  | the protip paragraph; no stylesheet rule mentions the class |
| `.studio-drawer` | static markup only | `index.html:1599` |  | static markup; on div; css rules: 0 |
| `.ui-fork-content` | JS | `js/43-ui-visibility.js:497` |  | fork dialog content variant |
| `.ui-vis-row-name` | JS | `js/43-ui-visibility.js:448` |  | item label span |
| `.vertical` | static markup only | `index.html:1251` |  | static markup; on div; css rules: 0 |
| `.zoom-mode` | JS | `js/35-zoom-view.js:195`, `js/44-recipes.js:460` |  | body state class for Zoom Mode; no rule in css/; read by js/44-recipes.js:460, 462 (bodyClass / noBodyClass until-conditions) and by… |

## Coverage and validation

| Check | Result |
|---|---|
| Slice files read | 16: `B01-js20-a.json`, `B02-js20-b.json`, `B03-js20-c.json`, `B04-js20-d.json`, `B05-layers.json`, `B06-html-config.json`, `B07-visibility.json`, `B08-multiplayer.json`, `B09-audio-recording.json`, `B10-bindings.json`, `B11-settings-colour-text.json`, `B12-canvas-features.json`, `B13-chrome-misc.json`, `B14-tier2-tests.json`, `B15-merge-gaps.json`, `critique-additions.json` |
| Rows kept / skipped | 5104 / 0 |
| Ids normalised to `#` | 408 rows lacked the prefix and were merged with their prefixed twins |
| `js/*.js` files with no rows | 11 of 106: `js/02a-layer-xform.js` (0 DOM-API hits), `js/05a-shader-core.js` (0 DOM-API hits), `js/05b-shader-sim.js` (0 DOM-API hits), `js/05c-programs-framebuffers.js` (0 DOM-API hits), `js/05i-sim-stats.js` (0 DOM-API hits), `js/09-settings-manager.js` (0 DOM-API hits), `js/11-settings-interface.js` (1 DOM-API hits, check), `js/24a-mp4-writer.js` (0 DOM-API hits), `js/33-brush-shapes.js` (1 DOM-API hits, check), `js/57-mutation-thumbs.js` (0 DOM-API hits), `js/64a-colour-math.js` (0 DOM-API hits) |
| Electron main-process files | `electron-main.js` / `electron-pen-cursor.js` have no rows; a grep for querySelector/getElementById/executeJavaScript/insertCSS in them finds nothing, so they do not reach into the page by selector. They do depend on the pen window's name and title (see Text keys `swirl-pen-input`, `Swirl Together - Pen input`). |
| Tier-2 files with rows | 73 |

