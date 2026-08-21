# Fluid-UI Refactor-Readiness Audit — 2026-08-20

Compiled from five parallel audit passes over the whole repo. Purpose: a solid
foundation for the final refactors. Sections land incrementally as each pass
completes.

Status of sections:
- [x] 1. Repo hygiene, dead files, globals, load order
- [x] 2. Core sim/render pipeline (01/02/04a/05a-c/05d0/05j/00*)
- [x] 3. Layers / masks / colliders (05k-o, 15, 16, 23-depth, 24-path, 26, 29, 25)
- [x] 4. UI / settings / mixer (20, 09/11/12/12b, 05e-h, 06-slider, 28, 21, 10, 13-drag, index.html, css)
- [x] 5. Multiplayer / recording / audio (06-mp, party/, 03, 05d, 24-video, 22/27/30, 07, 08*)

---

## 1. Repo hygiene, dead files, globals, load order

### 1.1 Dead js files (only 2 of 71)

- `js/07-cos-oscillator.js` — **not loaded by index.html**, but `window.cosOscillator`
  is referenced **26 times** across live js. Every call site is a silent no-op /
  latent `undefined` guard. Highest-value cleanup: either wire it back in or strip
  all 26 call sites. (Decision needed.)
- `js/14-radial-slider.js` — fully dead, zero references anywhere. Safe delete.

Both already excluded from the Electron build (`package.json:77-78`) and absent
from `dist/win-unpacked` — the exclusion list is doing the work a delete should do.

`js/vendor/transformers/` (12 MB) is NOT in index.html but is live via dynamic
`import()` at `16-sam-integration.js:52,72` and `23-depth-collision.js:40,48`.

### 1.2 Root cruft

| Item | Status |
|---|---|
| `tmp-cdp-*.js` (4), `tmp-preset-mask.json` (2.8 MB) | Untracked/gitignored, BUT `scripts/bake-boot-swirl.js:10` documents an invocation depending on untracked `tmp-cdp-driver.js`. Promote it into `scripts/` or drop the bake script. |
| `sam-test.html` / `sam-test.js` | Tracked, dev-only EdgeTAM harness, no inbound refs. Move to docs/ or delete. |
| `reset-pressure.html` | Tracked, zero refs. Delete candidate. |
| `restart-electron.bat` + `.lnk` shortcut | Machine-local convenience; `.lnk` should not be in VCS. |
| `Design system breakdown exploration/` + `.zip` | Both tracked; zip duplicates the dir. Drop the zip at minimum. |
| `server-relay.js` | Superseded by `party/`. Verify then delete. |

### 1.3 Root .md sprawl — 16 files, 2 active

Active: `TASKS-FINAL.md`, `TRIAGE-TODO.md`.
Keep: `README.md`, `RELEASE.md`, `CONTROL-MAPPING.md`, `LICENSE`, `THIRD-PARTY-NOTICES.txt`.
Stale (archive candidates): `LIGHT-SHIFT-FIX.md`, `LIGHT-SHIFT-PLAYHEAD-FIX.md`,
`LIGHT_SOURCE_FEATURE.md` (Feb), `TODO.md` (38 KB), `UX-fixes.md`, `UX-fixes-plan.md` (Jul),
`8-6-todo-pre-test.md`, `NEXT-FEST-PLAN.md` (Aug 06).
Confirm with Gabriel before archiving (edited Aug 18): `TODO-NEXT.md`,
`USERTEST-2026-08-15.md`, `USERTEST-2026-08-16.md`.

**Caveat:** `js/08a-quality-governor.js:36` and `js/08b-jank-monitor.js:2,12,388`
cite `TODO.md` as a normative principles doc — migrate that text before removing it.

### 1.4 Numbering collisions & real load order

index.html loads scripts via THREE mechanisms; the numeric prefix does NOT
predict order:
- Sync block A (`index.html:131`): `00a-boot.js` first.
- Sync block B (`index.html:1156-1161`): `00-window-controls`, `01`, `01a`, `02`, `03`, then **`28-studio-drawer`** (out of range).
- Async sequential chain (`index.html:1164-1191`): all `04*`, `05*` (note `05d0` loads BEFORE `05d`), `05o`, `06-slider-updater`, `06-multiplayer`, `29`.
- Sync block C (`index.html:1243-1278`): `09, 11, 10, 08, 08a, 08b, 12, 12b, 13-light-source, 14-light-shift, 17, 13-drag-scroll, 13-mobile-mode, 15`, modules `16`/`23-depth-collision`, then `21`→`36`.

Collisions: `00-` (×2, inverted order), `06-` (×2), `13-` (×3, split by 14/17),
`14-` (×2, one dead), `23-` (×2, inverted order), `24-` (×2, split by comfyui-bridge).
Renumbering is safe — no js file imports another by path — but must update all
index.html lists in the same commit.

### 1.5 Global namespace

- **521 `window.X =` assignment sites, 325 distinct global names.**
- Repeat-assigned (multi-file writers = coupling risk): `needsFramebufferReinit` (13 sites),
  `refreshAllPresetLists` (12), `kAngle` (11), `applyMultiSplatWith` (11),
  `animationMultiplier` (11), `fpsCap` (9), `__unsavedWork` (9).
- Top refs: `settingsManager` (220), `config` (217), `lightShift` (96),
  `audioReactive` (82), `Settings` (79), `lightSource` (72), `collisionLayers` (70),
  `BrushShapes` (66), `layers` (59), `Masks` (50), `BrushEngine` (46),
  `rasterLayers` (42), `QualityGovernor` (39), `focusMode` (32), `fluidExport` (29),
  `cosOscillator` (26 — **dangling, never assigned**).
- `window.settingsManager` vs `window.Settings` look like two overlapping settings
  surfaces worth reconciling.

### 1.6 TODO/FIXME/HACK scan

Clean: 4 hits total, all prose citations of `TODO.md` in 08a/08b, zero actionable
code markers.

### 1.7 build / dist / public / scripts

- `public/` verified current (`diff -rq js public/js` empty) — the stale-public
  hazard is absent today but nothing prevents recurrence; consider making
  `npm run serve` depend on `build:web`.
- `dist/win-unpacked` current as of Aug 19 (differs only by the 2 excluded dead files).
- `scripts/cachebust.js` and `scripts/bake-boot-swirl.js` have no npm script entries.

### 1.8 package.json scripts — broken/stale

- `publish:itch` — unfilled `YOUR_ITCH_USER/YOUR_GAME` placeholders.
- `publish:steam` — unfilled `YOUR_STEAM_BUILDER`; `%CD%` is cmd.exe-only syntax.
- `electron-build` vs `dist:win` — redundant (both produce the same `dir` target).
- `serve` uses `http-server` not in devDependencies (npx fetches at runtime).

### 1.9 Recommended hygiene order

1. Delete `14-radial-slider.js`; decide `07-cos-oscillator.js` (wire in vs strip 26 call sites).
2. Renumber collisions (`00/06/13/14/23/24`) + update index.html lists atomically.
3. Migrate quality/jank principle text out of `TODO.md`, then archive stale .md files.
4. Fix/delete placeholder publish scripts; add `cachebust` npm entry.
5. Untrack the zip, the `.lnk`, `reset-pressure.html`.

---

## 4. UI / settings / mixer

### 4.1 Structure map

| File | Lines | Role |
|---|---|---|
| `js/20-mixer-layout.js` | 5304 | One IIFE; builds the entire mixer strip + sidebar + ~10 floating panels by *moving* existing DOM nodes. The de-facto UI god-file. |
| `js/09-settings-manager.js` | 365 | `SettingsManager` class → `window.settingsManager`. localStorage KV with namespace/cache/validators/migrations. Only `get/set/watch/remove/clear` are actually used (`:78-168`). |
| `js/11-settings-interface.js` | 411 | `window.Settings` — typed sugar over settingsManager. ~15 of 25 methods have zero callers. |
| `js/12-save-load.js` | 2176 | Real persistence engine: `scanAppState` `:91`, `applyFromSettings` `:192`, `capturePresetSnapshot` `:538`, `applyPresetSnapshot` `:880`, user-preset CRUD `:1689-1855`. |
| `js/12b-preset-vault.js` | 337 | Electron on-disk vault; monkey-patches `Settings.savePreset/deletePreset` `:258-275` to mirror writes. |
| `js/05e/05f/05g/05h` | 293/249/600/718 | Literal unwrapped fragments (slices 5-8/14) of the deleted `05-fluid-sim.js`; top-level code, order-dependent, "do not reorder". Files, not modules. |
| `js/06-slider-updater.js` | 267 | Generic range-input enhancer: CSS vars, tick scale, row-drag forwarding, MutationObserver auto-init `:138`. |
| `js/28-studio-drawer.js` | 105 | Small, clean tab controller for the shared bottom drawer. Good module. |
| `js/21-focus-mode.js` | 265 | Focus toggle + aspect-ratio presets. Self-contained. |
| `js/10-draggable.js` | 248 | `Draggable` class w/ zoom-aware offsets + position persistence. Only 3 consumers. |
| `js/13-drag-scroll.js` | 141 | Drag-to-scroll for two hardcoded selectors; own MutationObserver. |
| `index.html` | 1291 | ~1015 lines of markup (499 element tags), 2 inline scripts (`:11-125` boot globals, `:1163-1242` sequential loader), 43 script tags, 9 stylesheets. |
| `css/` | 9 files ~7.5k lines | All 9 linked (`index.html:132-140`). None orphaned. |

### 4.2 20-mixer-layout.js decomposition plan (5304 lines, one IIFE)

Extraction order matters — utils first, then pure logic, then panels:

| Lines | Section | Extract to |
|---|---|---|
| 5210-5304 | `makeSection`, `moveEl`, `moveControlGroup`, `moveCheckboxGroup`, `divider`, `fmtSlider`, collapse persistence | `20-layout-utils.js` — **extract FIRST; everything depends on it** |
| 816-964 | perceptual fader math (`baseOfHalfLife`, `attachPerceptualProxy`, poll loop) | `20d-fader-curves.js` — pure logic, zero DOM coupling |
| 1690-2121 | mutation section + `wireMutationUI` | `20g-mutation-ui.js` — cleanest large cut (talks only to `window.mutationEngine`) |
| 4788-5209 | `buildArmColorsDropdown` (420 lines, self-contained) | `20n-arm-colors-ui.js` — second-cleanest |
| 2755-3357 | `buildBrushPanel` (600 lines) | `20j-brush-panel.js` — biggest single win |
| 4288-4560 | export section | `20m-export-ui.js` |
| 35-318 | layout shell (`initMixerLayout`, responsive scale, sidebar resize, entrance) | `20a-layout-shell.js` |
| 367-694 | brush-tip swatch + shape flyout | `20b-tip-swatch.js` |
| 695-815, 965-1253 | mixer strip, fader/color channels + ignite drag | `20c-mixer-strip.js` |
| 1254-1525 | actions + presets channel | `20e-preset-ui.js` |
| 1526-1689, 4192-4287 | sidebar shell, quality underbar, focus/recording | `20f-sidebar-shell.js` |
| 2122-2267 | layers section | `20h-layers-ui.js` |
| 2268-2428 | thin `moveEl` shims (animations/kaleido/sim/effects/colors/display) | collapse into one declarative table |
| 2429-2754 | `buildBrushSection` | `20i-brush-ui.js` |
| 3358-3586 | branding overlays | `20k-branding-ui.js` |
| 3580-4191 | audio section + mini-timeline canvas | `20l-audio-ui.js` — start at 3580, NOT 3587: the preamble vars (`audioDrawerBuilt`, `audioMiniRaf`, :3580-3586) would otherwise be stranded in the branding row and silently break drawer/mini-loop state. Verified 2026-08-20. |
| 4561-4787 | multi-artist + settings + `renderSidebarPresets` | `20e`/`20f` |

Stats: 275 `createElement`, 220 inline style writes, 35 `innerHTML`.

### 4.3 Settings/persistence flow — THREE unlayered write paths

```
ParamRegistry (01a)  — SLIDERS/CHECKBOXES/SELECTS + bounds, keyed by DOM id
   ├─ toSliderConfig()    → 05h:11
   ├─ toMutationSchemas() → 25:21
   ├─ clampConfigObject() → 04b:82, 12:895/1664
   └─ id lists            → 12:53-64 (with frozen fallback lists)
settingsManager (09) — localStorage `fluidUI:<key>` — 110 direct call sites
   └─ Settings (11) — typed prefixes (slider./checkbox./color./preset./layout.)
        └─ PresetVault (12b:258) monkey-patches savePreset/deletePreset → disk
```

1. `Settings.saveSlider/loadSlider` (05h:588-685, 05d-input-replay).
2. Direct `settingsManager.set/get` — **36 sites inside 20-mixer-layout.js alone**
   (e.g. `:3244` `brush.splatMode`), bypassing the prefix convention.
3. `12-save-load.js` bulk `scanAppState`/`applyFromSettings` re-reads the DOM and
   re-writes via `Settings.saveSliders` `:126`.

Consequences: same value can persist under two keys; boot ordering between
`applyFromSettings` and `loadSavedSliderValues` is implicit in script order.
`Settings.getAllPresets()` (11:204) reads only the settingsManager **cache** —
races PresetVault's startup re-seed (12b:314) with no guard.
`ParamRegistry.verifyDom` only runs under `localStorage.debugParams='1'` (01a:390);
registry/DOM drift is silent in production.

### 4.4 Dead code & duplication

- `14-radial-slider.js` (233 lines) fully dead (also §1.1).
- `07-cos-oscillator.js` dead-with-live-guards: probes at `05j:77`, `06-multiplayer:386/533`,
  `12-save-load:364/810` are permanently false; presets serialize a null `cosOscillator` slot forever.
- **Preset list rendering exists ×3**: `20:1468` (`renderMixerUserPresets`), `20:4713`
  (`renderSidebarPresets`), `12:1777` (`renderUserPresets`) — glued by `refreshAllPresetLists`.
- `window.Settings` ~40% unused (`resetPanel`, `loadSliders`, `loadColor`, `loadPreset`,
  `saveLayout/loadLayout`, `saveAppState/loadAppState`, `exportToFile/importFromFile`, `clearAll`).
- `SettingsManager` unused: session cache, migrations (never run, version hardcoded 1),
  export/import, `has`. `getSession` (09:54-63) is inverted vs its own docstring (harmless — no callers).
- **4 duplicate `positionPanel()` closures** in the mixer file (`:1383`, `:2769`, `:4819`, `place` at `:1587`).
- **4 independent drag implementations**: `10-draggable.js`, `13-drag-scroll.js`,
  `06-slider-updater.js:213`, inline pointer capture at `20:1189`.

### 4.5 Ranked plan for this slice

Quick wins: delete 14-radial-slider; resolve 07-cos-oscillator both ways is better
than half-wired; prune unused Settings/SettingsManager surface; extract mixer utils
+ fader curves; unify the three preset renderers into one `renderPresetList()`.

Medium: split the four self-contained panels (~1700 lines out); make `Settings.*`
the only persistence writer (forbid direct settingsManager.set in UI files); run
`verifyDom` unconditionally in dev and drop the frozen fallback lists.

Risks: (a) 05e-05h correctness IS their concatenation order — module-ize in one
step, not incrementally; (b) the mixer file MOVES DOM authored in index.html —
splitting changes when moves happen vs other modules' getElementById; add a
post-layout assertion that every expected id landed before splitting; (c) 12b
monkey-patches Settings.savePreset at load time — a preset write before 12b loads
silently skips the disk vault; (d) `initMixerLayout` is gated by an 800ms
setTimeout tied to splash animation length (`20:28`) — timing-coupled, don't move casually.

---

## 2. Core sim/render pipeline

### 2.1 Structure map

| File | Owns | Key exports |
|---|---|---|
| `00a-boot.js` | Launch choreography: readiness gates (`scripts`/`layout`/`frame`), quiet-layout detector, Electron fade handshake, boot cursor veil. IIFE. | `Boot` |
| `00-window-controls.js` | electron/web body class; frameless window controls + resize-edge dragging. | none |
| `01-config.js` | **Misnamed** — actually palette model + canvas geometry: palettes CRUD/import/export, `updateCanvasSize`, canvas position/ResizeObserver, corner locking. | `layers`, `savedColors`, palette fns, `updateCanvasSize`, `needsFramebufferReinit` |
| `01a-param-registry.js` | Single source of truth for control bounds/defaults/mutation scopes; clamping; `CONFIG_BOUNDS`. | `ParamRegistry`, `__isTypingTarget` |
| `02-palettes.js` | **Misnamed** — actually canvas resize-handle drag, `getCanvasCoordinates`, `colorStorage`, custom cursor, recording state declarations. | `colorStorage` |
| `04a-canvas-gl-config.js` | Swatch UI, legacy mouse-trail replay (dead), WebGL2 context + fatal-GPU screen + iGPU banner, `config` (~120 keys), mobile overrides. | `gl`, `config`, `baselineConfig`, `linearExt` |
| `05a-shader-core.js` | `compileShader`, `Program`, display/blur/sharpen/microdetail/lighting frags. | lexical globals |
| `05b-shader-sim.js` | All sim GLSL: splat, advection+MacCormack, wetness, vorticity, pressure+MG, obstacle, glow. | lexical globals |
| `05c-programs-framebuffers.js` | ~28 program instances, FBO factories, state-preserving `initFramebuffers`, MG pyramid, obstacle upload pipeline, `blit`. | obstacle fns, `exposeSimStats` |
| `05d0-brush-engine.js` | D1 stroke pipeline: stabilizer, distance walker, coalescing, dab queue. IIFE. | `BrushEngine` |
| `05j-update-loop.js` | `update()`: fps cap, sub-steps, sim clock, dab drain, physics pass order, post-FX chain, display uniforms, governor feed. | `__simDtMs`, `__stats`, ... |

### 2.2 Coupling & load-order fragility

- Everything except `00a/00/01a/05d0` is **unwrapped top-level code sharing one lexical scope**; `const gl`/`let config` (04a:180,328) and `let density...` (05c:84) are read directly by later chunks. Correctness = concatenation order.
- **TDZ trap:** `01-config.js:178,270` guard `colorStorage` with `typeof`, but it is a `const` in `02-palettes.js:276` — `typeof` on a TDZ binding THROWS; works only because the first call comes late (from 05g).
- **`05c:666` `buffer = gl.createBuffer()` is an undeclared implicit global** — any future `'use strict'` wrapper breaks the vertex buffer. Declare it.
- Loader continues after a chunk fails (`index.html:1219-1228` onerror → loadNext) — a missing 05a cascades into ReferenceError storms rather than a clean stop.
- `01-config.js:724,758` run at parse time against live DOM — file can never move into `<head>`.
- Boot gates cleared from three owners; `00a-boot.js:60` hardcodes `pending = 3` next to the gates literal — derive from `Object.keys(gates).length`.
- `BLOOM_CEILING`/`GATE_WHITE_MULT` are read in 05j but **not declared in the config literal** — injected by `05h:77`; anything reading config before 05h sees undefined.

### 2.3 Dead / vestigial code

- **Dead legacy mouse-trail replay subsystem (~105 lines):** `04a:73-112 trackMouseMovement` + `04a:116-176 replayMovements` (never started) + state `01:35 mousePositions`, `:38 FADE_START`, `:39 FADE_END`. Pure deletion.
- Write-only: `01:103 currentTrailColorCss` (+ producer `hexToRgbaCss`), `01:135 colorsKey`, `04a:829 baselineConfig`, `04a:330 TEXTURE_DOWNSAMPLE`, `05j:658 _simLong` + stale 8-line comment, `02:275 window.colorStorage=null` stub, `02:355 recRecordSource`.
- Debug leftover: `02-palettes.js:171` `console.log('West drag:',...)` fires on every west-edge drag pointermove.
- **Pen-pressure remnants in 05d0:** `lastP` + p0→p1 interpolation at `:216,243,266,294,308,339,342` but `move()` hardcodes `p = 1` (`:320-330`) and the consumer `stampSketchDab` (05i:270) ignores the param; header still says "with pressure". Half-a-feature that looks live — remove or wire, don't leave. (Gabriel removed pen pressure deliberately 2026-07-22; do not re-wire without asking.)
- `displayFrag`: `uniform vec2 texelSize` (05a:144) declared + uploaded every frame (05j:1213) but never read; `vL,vR,vT,vB` varyings (05a:92) likewise.
- Console-knob tail (no UI, mostly finished experiments): `DEBAND`, `SPLAT_SCISSOR(_K)`, `MG_OBS_MAXPOOL` (refuted per 05b:1423-1430 but branch still compiled), `MG_MAX_DEPTH`, `CURL_EDGE_GATE`, `VEL_SOURCE_GATE`, `CURL_WALL_GATE`, `COLLIDER_FLOW_KEEP`, `COLLIDER_DRAIN_DILATE`, `WALL_SLIP`, `GLOW_KNEE`, `GATE_WHITE_MULT`, `STAMP_RADIUS_SCALE`. `COLLIDER_GAP_FILL=0` means `morphObstacleProg`+`closeObstacleGaps` (05c:561-584) are compiled and never run.

### 2.4 Duplication

1. **Obstacle coverage/strength curve ×3** (05b:63-66, 05b:344-390 snippet, 05b:1574-1577) — "must match" enforced by prose comments. Correctness-critical; extract into the shared snippet.
2. Value noise ×2 (`sn_hash/sn_noise` 05b:35-45 vs `sw_hash/sw_noise` 05b:303-313).
3. Separable obstacle blur ×2, line-identical (05c:593-603 vs 636-645).
4. Raster-vs-mask store handling: 4 parallel pairs in `initFramebuffers` (stash/recreate/copy-free) — one `{store, prevMap}` helper collapses all.
5. Palette export ×2 (01:457-483); status-toast pattern ×5 in 01-config.
6. Glow blur shaders differ only by `* intensity` (05b:1672-1693).
7. **Two dab-consumption paths in 05j**: engine loop `:396-467` vs legacy one-splat-per-frame `:473-487` — legacy branch unreachable since 05d0 always loads.
8. Electron detection ×3 spellings (index.html boot IIFE, 00a:38, 00-window-controls:14-23).
9. 05j's three dye-pass uniform blocks (`:926-939`, `:960-972`, `:1003-1012`) set the same six snippet uniforms — a `setDyePassUniforms(prog)` helper makes "all three must match" mechanical.

### 2.5 Ranked plan for this slice

Safe mechanical: delete dead replay subsystem + write-only vars + debug log; declare `buffer` (05c:666); fix boot `pending` derivation; extract toast/export helpers; rename or re-split the misnamed 01/02 files.

Medium (needs visual A/B): resolve 05d0 pressure remnants (removal, per Gabriel's standing decision); collapse 05c raster/mask + blur duplication (touches the load-bearing state-preserving reinit — test resize/governor changes); retire refuted knobs + shader branches; delete unreachable legacy splat branch 05j:473-487.

High risk (pixel A/B only): unify the obstacle-solidity triplication as a string-substitution refactor producing **byte-identical GLSL** (hash compiled sources to verify); never reorder displayFrag's Light-Shift-before-Glow; treat the defensive `gl.disable(gl.BLEND)` calls and unconditional sampler binds in 05c/05j as invariants (each guards a past regression), not removable noise. Module scope / `'use strict'` per chunk is the real endgame refactor; everything above is preparation.

---

## 3. Layers / masks / colliders

### 3.1 Structure map

| File | Owns | Key exports |
|---|---|---|
| `05k-layers-render.js` (685) | `renderLayers()` — entire layer-panel DOM: per-layer template, opacity/blend/clip/threshold, drag-reorder. | `layerOrder`, `__onMaskListChanged` |
| `05l-layers-transform.js` (907) | Layer visibility/delete, D6 layer-op undo, **legacy in-DOM resize/rotate handles (:227-551, DEAD)**, `updateLayerPosition`, `LayerGeometry`, **D2 raster paint layers (:626-907)**. | `toggleLayer`, `deleteLayer`, `__layerHistory`, `LayerGeometry`, `rasterLayers` |
| `05m-layer-masks.js` (501) | Two unrelated things: D3 CSS-mask clip of DOM layers by a `Masks` FBO, and the legacy shape-mask baker (`applyLayerMask` → backgroundImage) + canonical shape renderer. | `applyLayerClip`, `applyLayerMask`, `_drawMaskShape`, ... |
| `05o-masks.js` (241) | D3 Mask registry over `maskStore` FBOs: create/clear/rename/serialize/restore, coverage readback, import-from-layer. | `Masks` |
| `15-layer-masking.js` (3758) | The mask editor overlay: shapes, stamps, SAM UI, background-key, touch-up brush, feather, 3-step wizard, 4 entry modes. | `enterImageLayerMaskMode`, `enterColliderMaskMode`, `enterAdhocMaskMode`, `exitMaskMode`, ... |
| `16-sam-integration.js` (1396) | `SAMSegmenter` (ES module): Transformers.js load, EdgeTAM embed/prompt, download modal, brightness fallback. | `samSegmenter` |
| `23-depth-collision.js` (1549) | `DepthEstimator` + collision layers: mask→collider builders, live source binding, obstacle-texture compositor (GPU + CPU). | `collisionLayers`, `depthEstimator`; wraps `deleteLayer` |
| `24-path-layers.js` (1343) | Path/stroke layers: draw capture, RDP simplify, playback, panel UI, **own draw + transform overlays**. | `pathLayers` |
| `26-layer-transform.js` (344) | Canvas-overlay move/resize/rotate for image & collision layers (amber chrome). | `LayerTransform` |
| `29-material-modes.js` (332) | Material presets driving config + brush params off one slider. | `MaterialModes` |
| `25-mutation-engine.js` (646) | Parameter-schema mutation of preset snapshots + undo chain. | `mutationEngine` |

### 3.2 Overlap resolution

- **Transform: 26 is live, 05l's handles are dead.** `05k:192` is the only call site: `LayerTransform ? LayerTransform.open(i) : toggleActiveLayer(i)` — 26 always loads, so the fallback never runs. `05l:227-551` (~325 lines: `toggleActiveLayer`, handle create/remove, resize/rotate/drag handlers, pointer-event gating) is dead. `updateLayerPosition` (05l:552) and `LayerGeometry` (05l:580) ARE live. `24-path-layers.js:1074` is a third, independent transform overlay (path points) — structurally near-identical to 26 on different data.
- **Masks: three layers of one stack, all live, composing by intersection** — 05o `Masks` (D3 model, FBO coverage, persisted via 12:771/1526); 05m `applyLayerClip` (Mask → CSS mask-image); 05m `applyLayerMask` (legacy shape mask → backgroundImage; documented orthogonal at 05m:15, both multiply). 15 is the EDITOR authoring `layer.mask.shapes`, not a competing model; `05o:196 importFromLayer` is the migration bridge ("⤓ Mask" at 05k:209).
- **Hook chaining:** `__onMaskMutated` owned by 23:1084, chained by 05m:83-96 which POLLS `__scriptsReady` up to 10s to wrap-not-clobber; `deleteLayer` similarly wrapped by 23:1529 retrying every 250ms. Ordering guaranteed only by those polls.

### 3.3 Dead / vestigial code

- **The whole recLayers mask path in 15 is dead (~250 lines).** `window.recLayers` is never assigned (it's a scope-local `let` in 02-palettes.js:347). Therefore `initLayerMasks` (15:95, never called), `enterMaskMode` (15:109, called from 03-recording.js:704 — silently no-ops), `checkMaskPoint` (15:2253, called from 03:449 — always returns true, the recording-mask gate does nothing), `isPointInShapeMask` (15:2284), `originalExitMaskMode` (15:139) — all unreachable.
- `05l:227-551` legacy transform handles (see §3.2).
- 15:3711 re-defines `window.exitMaskMode` over the 15:139 definition in the same IIFE (self-monkeypatch wrapping the dead path); 15:3722 similarly re-wraps `updateMaskEditorTitle`.
- `23:517-536` `_drawMaskShape` fallback branch unreachable in practice.
- `15:3251 colliderMaskId` defined, never referenced.

### 3.4 Duplication

1. **Adaptive-band luminance/depth cut ×5** (`bandCap`, gradient, smoothstep + the `bandCap*8` preview cap): 05m:222-249, 05m:474-495, 15:1646-1670, 15:2479-2496, 23:1369-1387. Comments admit drift has already caused preview/collider edge mismatch. Extract one `__softCut()` helper — highest bug-prevention value per line.
2. **Shape rotation wrap + white-fill rasterize loop ×4-5**: 05m:131-146, 05m:158-172, 15:2401-2416, 23:510-539, 23:1195-1206 — the wrap belongs inside `_drawMaskShape` (note 15:2402/23:1195 set fillStyle outside it; keep that).
3. Shape drawing itself: 05m `drawMaskShape` (canonical) vs 15:1618 `drawShape` (editor) — separate switches over the same shape vocabulary, plus duplicate polygon/star helpers.
4. **Layer transform → canvas matrix ×4**: 05o:212-223, 23:414+compositor, 26:43 `geom()`, 15:1204 `getLayerViewMatrix` — CSS↔buffer px conversion re-derived each time.
5. Overlay scaffolding: 26:262-305 and 24:1082-1105 build the same toolbar/canvas-area/Done-Cancel/Escape-Enter structure.
6. `05k` slider-drag guard rewritten inline ×4 (:149, 275, 324, 347).

### 3.5 Ranked plan for this slice

Safe/high value: (1) delete the dead recLayers mask path in 15 + its 03-recording call sites; (2) extract the adaptive-band cut helper for all 5 sites; (3) move rotation wrap inside `_drawMaskShape`; (4) delete 05l:227-551 after confirming no CSS targets `.layer-resize-handle`/`.layer-rotate-handle`; (5) factor the shared editor-overlay scaffold (24+26); (6) extract 05k's slider guard + the ~400-line per-layer template out of `renderLayers`.

Risky: the `__onMaskMutated`/`deleteLayer` poll-chaining — convert to a real multi-subscriber event bus BEFORE touching load order, not after; 05l/02/03 share lexical scope (wrapping in IIFEs breaks silently); `applyLayerMask` is async (img.onload) while `applyLayerClip` is sync — merging changes load-bearing ordering; 15's `maskState` is one mutable object across 4 entry modes with dispatch scattered across 3 functions — centralize the mode dispatch before splitting 15; `24:1327 Object.assign(layer, d)` is sensitive to property renames (alias accessors).

---

## 5. Multiplayer / recording / audio / perf

### 5.1 Structure map

| File | Lines | Role |
|---|---|---|
| `js/06-multiplayer.js` | 2165 | Everything client-side MP: transport, matchmaking, look-mirror, take-turns, turn UI, cursors, dab batching, stroke chunking. Classic script, ~25 top-level globals. |
| `party/index.ts` | 725 | Play-room DO: room kinds, capacity, lock allowlist, host election, turn rotation + alarm, zombie reaping, message gating. |
| `party/lobby.ts` | 187 | Singleton matchmaker, waiting-pointer critical section, TTL alarm, `/vacate`. |
| `party/shared.ts` | 57 | Constants, `roomKind`, code gen, `uidFromRequestUrl`, `internalSecret`. |
| `server-relay.js` | 110 | Local ws dev relay — **pure passthrough, zero validation**; diverges completely from production semantics. |
| `js/03-recording.js` | 1667 | Timeline recorder (sim-clock playhead); its state lives in `02-palettes.js:346-353`. |
| `js/05d-input-replay.js` | 1046 | `pointer`, splat envelopes, strokeEvents/history, right-click replay, pointer/touch listeners. |
| `js/24-video-export.js` | 1273 | IIFE: compositor, MediaRecorder video, inline GIF encoder, stills, EBML WebM fixer. |
| `js/22-audio-reactive.js` | 1280 | IIFE: analyser, feature bus, beat detection, transports, mappings. |
| `js/27-audio-composer.js` / `js/30-audio-scenes.js` | 464/768 | Each hand-rolls own DOM, persistence (30 = raw localStorage :23, 27 = settingsManager :385), own rAF loops on top of 22's bus. |
| `js/08-stats-panel.js` / `08a` / `08b` | 213/550/521 | Three owners of one stats panel; 08b runs its own whole-app rAF loop alongside 05j. |

### 5.2 Multiplayer protocol — validation gaps

- Handling: one 170-line switch at 06:1272-1441; server gating party/index.ts:211-416. Good: SERVER_AUTHORED drop, TURN_HOLDER_ONLY, size cap, turn-state forgery check, /vacate secret.
- **GAP: `settings-lock` is unauthenticated** — no host check server-side (only dropped while turns run, index.ts:400). Any guest can rewrite every other guest's sliders/palette. Fix: host check next to the `lock` handler (index.ts:251-262), ~6 lines.
- **GAP: uid is client-supplied and leaks** — `host-changed` broadcasts the raw host uid (index.ts:467), contradicting the invariant stated at index.ts:82-83; lock allowlist keyed on it; lobby takes uid from message body (lobby.ts:70) → spoofed uid can hijack a waiting slot. Fix: send connection id as turn-state already does (index.ts:685).
- GAP: `turn-invite-offer`/`turn-invite-result` lack the client-side forgery guard that turn-state has (06:1387).
- **Known gap confirmed: brush tip/shape not on the wire** — recorded (05d:216-217), restored locally (05d:432-447), but `broadcastReplayStroke`'s quantizer drops both (06:1786-1795) and the dab path never had them (06:1526 carries `sym` only); `handleRemoteSplat` force-sets `__remoteStroke` (06:1680). Fix pattern: additive field + `ParamRegistry.coerceSelect`, as `sym` did (06:1691-1701); rehydrate in `scheduleStrokeReplay` (05d:474).

### 5.3 Recording/replay/export — three unrelated systems sharing only the splat sink

- 03 (timeline recorder): `recLayers[].timeline.interactions`, **sim clock** (03:385-389), drained from 05j:574.
- 05d (stroke replay): richer schema incl. tip/shape, **wall clock**, drained from 05j:225; re-feeds 03 (05d:449) but not vice versa.
- 24 (export): fully decoupled — rAF-samples the composited canvas; its wall-clock loop (24:526) desyncs from 03's sim-clock playhead at any timeScale ≠ 1.
- Duplication: two "apply one recorded dab" blocks (03:472-482 vs 05d:438-443); double normalize/denormalize hop for the wire; two blob-download impls (03:1176-1182 vs 24:101-124 `saveBlob` — keep the latter); timeline canvas drawing ×2 (03:895 vs 03:968); three reads of `__lastPaintRadius` (03:298, 05d:205, 06:1517).

### 5.4 Dead / vestigial

- `07-cos-oscillator.js` dead with live call sites in 05j/12/20/06 (see §1.1) — including a documented MP-snapshot "fix" (06:386) for a feature that cannot run.
- Legacy turn banner `#mpTurnBanner` only ever removed, never created (06:692,734); `renderTurnWheel`/`_wheelKey`/`#turnWheelClock` names describe a wheel that no longer renders.
- Hot-path console.logs: 06:1629, 06:1672-1676 (throttled remote-splat log), 06:1844.
- Legacy splat path in `handleRemoteSplat` (06:1726-1767) — two live code paths for one message type.
- 03:1306 `cy = 0.75 * (h/h)`, unused cx/cy; partly-unused w/h at 03:1235,1277.
- 05d:12-24 `splatOut*` module state reached into by 05j with no accessor.

### 5.5 Ranked plan for this slice

Quick wins: resolve 07-cos-oscillator; server-side host check on `settings-lock`; stop broadcasting host uid; carry tip/shape through the replay wire; share `saveBlob`; forgery guards on the two invite messages; strip hot-path logs; rename the wheel/banner leftovers; fold 08b's rAF loop into 05j's frame callback (it already calls `QualityGovernor.onFrame` at 05j:1332).

Risks: 06-multiplayer has five overlapping reset paths whose exact ordering is load-bearing (own comments at 06:1136-1141, 1278-1286 document past bugs) — any split must preserve it; protocol has no shared schema (literal objects in 06 + party/index.ts + server-relay.js); two replay engines with divergent clocks — unifying changes playback timing that 03:363-384 warns is load-bearing; server-relay.js divergence means local testing can't exercise lock/turns at all.

---

## 6. Cross-cutting synthesis — the refactor roadmap

Themes every slice independently surfaced:

1. **The `07-cos-oscillator` decision blocks several cleanups** (05j, 06-mp, 12-save-load, 20-mixer all carry dead plumbing for it). Decide first: wire in or strip.
2. **Shared-lexical-scope classic scripts are the load-bearing constraint.** 01/02/03, 04a-05j, 05e-05h, 05l are unwrapped fragments; correctness = concatenation order. Every "wrap it in an IIFE / add 'use strict' / reorder scripts" instinct breaks something silently (TDZ guards, implicit `buffer` global, poll-chained hooks). Module-ization is the endgame, done in one step per cluster, never incrementally.
3. **Prose-enforced invariants → mechanical helpers**: obstacle-solidity curve ×3 (GLSL), adaptive-band cut ×5, dye-pass uniforms ×3, preset renderers ×3, positionPanel ×4, transform matrix ×4. Each is a "must match" rule kept in sync by comments today.
4. **Persistence has three writers** (Settings, raw settingsManager, save-load bulk scan) plus a monkey-patching vault; make Settings the single writer.
5. **Poll/retry-based init chaining** (05m→23 hooks, 12b patch timing, 20's 800ms splash timeout, 08a underbar race) should become an explicit event bus before any load-order change.

Suggested phase order:
- **Phase A (pure deletion, ~1,000+ lines, near-zero risk):** 14-radial-slider; cos-oscillator decision + fallout; dead recLayers mask path (15 + 03 call sites); 05l:227-551 legacy handles; 04a mouse-trail replay; write-only vars; debug/hot-path logs; root cruft + .md archive.
- **Phase B (mechanical hardening):** declare `buffer`; boot `pending` derivation; renumber file collisions + index.html; loader fail-fast; verifyDom in dev; MP security trio (settings-lock host check, uid → connection id, invite forgery guards); tip/shape on the wire.
- **Phase C (dedup extraction):** __softCut, _drawMaskShape wrap, saveBlob, toast/export helpers, preset renderer, positionPanel, mixer utils + fader curves, obstacle-solidity GLSL (byte-identical + hash verify).
- **Phase D (structural):** split 20-mixer-layout per §4.2 table (utils first); unify persistence writers; event bus for init hooks; fold 08b rAF into 05j.
- **Phase E (endgame, one cluster at a time, pixel A/B):** module-ize the shared-scope chunks; unify the two replay engines; protocol schema shared between client and party/.

---

## 7. Cross-check vs TODO-NEXT.md (2026-08-20)

Independent convergence and additions found by comparing this audit with the
TODO-NEXT.md handoff:

- **settings-lock forgery**: found independently by this audit (SS5.2, code-level,
  with the ~6-line fix at party/index.ts:251-262) and by TODO-NEXT item 5
  (share-lock), which needs the same hardening as its foundation. These are ONE
  work item: build share-lock's grant/arbitration/release on top of the host
  check. Only item needing a relay deploy.
- **Dead code TODO-NEXT knew that this audit also found**: `replayMovements`
  (SS2.3).
- **Dead code TODO-NEXT adds that this audit missed**: `mapBassToSplat` (never
  read), registry id `audioAutoSplatMode` pointing at a removed element, the
  composer's two permanently-disabled buttons, the collider `Mode` select
  (Block/Slow/Deflect — read by nothing), `#colorBar` CSS.
- **Collision warning — RETRACTED, see SS8.** TODO-NEXT.md:112's audio range
  (~2935-3530) is WRONG and this bullet originally repeated it. Item 2's real
  range is 3580-4191; item 3 touches 20-mixer-layout barely at all. There is no
  meaningful feature/refactor collision.
- **Ordering synergy — RETRACTED, see SS8.** Deleting the js/15 recLayers half
  leaves 03-recording.js byte-identical (its call sites are `typeof` guarded and
  simply stop firing). The synergy claim was wrong.

---

## 8. VERIFIED CORRECTIONS — 2026-08-20 (supersede earlier sections)

An adversarial verification pass (4 fact-checkers + 3 independent judges) tested
the load-bearing claims in this audit and in TODO-NEXT.md. Where this section
conflicts with anything above, **this section wins**.

### 8.1 Errors in THIS document

- **SS4.2 audio row was 3587, corrected to 3580.** Lines 3580-3586 hold the audio
  preamble vars (`audioDrawerBuilt`, `audioMiniRaf`); a verbatim 3587-4191 cut
  strands them in `20k-branding-ui.js` and silently breaks drawer/mini-loop state.
- **SS7's collision warning and ordering-synergy bullets were wrong** — both
  retracted in place.
- **SS3.3 / Phase A "pure deletion, near-zero risk" is FALSE for 2 of 3 items:**
  - `initLayerMasks` is NOT "never called" — `15-layer-masking.js:2247` and `:2249`
    call it every boot; it no-ops on `if (!window.recLayers) return;` at `:96`.
  - `exitMaskMode` (15:139) and `updateMaskEditorTitle` (15:271) are **live
    fallback dispatch**, captured as `originalExitMaskMode` (15:3709) /
    `originalUpdateMaskEditorTitle` (15:3733) and invoked at `:3722` / `:3752`.
    Deleting the bases without rewriting both wrappers throws a TypeError on
    every mask-editor close.
  - `03-recording.js` has **~12** call sites, not 2: `:188-192, :220-222, :449,
    :575, :586, :589, :591-599, :696-714, :1164-1168, :1202-1208` — including the
    `✂️ Create Mask` button rendered on every recorded-layer card today (`:598`)
    and a `mask` field in the **persisted v2.1 timeline export/import format**.
  - `05l-layers-transform.js:377` sets `canvasWrapper.style.touchAction='none'`
    mid-range — an unrelated global side effect that must be preserved. Line
    **552** (`updateLayerPosition`) is LIVE, called by `26-layer-transform.js:144,
    :331`; an off-by-one there breaks layer move/resize/rotate entirely.
  - Root premise still holds (`02-palettes.js:347` `let recLayers` is script-scope,
    never a window property) — the paths ARE dead, they are just not CHEAP.
    Realistic cost: 4-6 hours with a regression tail, not "near-zero".
- **cos-oscillator "blocks several cleanups" is overstated.** It blocks a
  DECISION, not code — all 26 sites are guarded; the only executing code is one
  truthiness check per frame at `05j:77`. It was **born unloaded** (c31a094,
  2026-04-05; no committed index.html ever carried the tag), tagged `// NOT
  LOADED` in cd58890. Audit line numbers for it have drifted (`12-save-load`
  343/720/1323 and `20-mixer-layout:121` now point at unrelated code).
- **SS1.8 is half-stale**: `steam/app_build.vdf` and `depot_build.vdf` ARE
  correctly filled (appid 5068940, depot 5068941). Only `package.json:17`
  `publish:steam` is still a placeholder (and uses cmd-only `%CD%`).

### 8.2 Errors in TODO-NEXT.md

- **`TODO-NEXT.md:112` cites the audio work at 20-mixer-layout `~2935-3530`.
  That range contains ZERO audio code** (grep -in audio over 2935-3530 → 0 hits;
  over 3587-4191 → 137). Line 2935 is `applyBrushPreset` inside `buildBrushPanel`;
  3530 is inside `buildBrandingSection`. Correct range: **3580-4191**. It was
  never right, even at the commit that authored the doc.

### 8.3 Corrected settings-lock facts

- Genuinely ungated server-side, but ONLY while turns are off (`index.ts:400`
  drops it when `turnsOn`). Host is immune (client guard `06:1375`), and `pub-`
  stranger rooms are `PUBLIC_CAP=2` — so forgery is **inert 1:1**; it needs a
  private code room with host + ≥2 guests.
- Impact is worse than "sliders/palette": a forged snapshot sets
  `__mpSettingsLocked` (locking the victim's own edits + an undismissable banner)
  and can **pause/freeze their simulation** via the transport section.
- **The fix does NOT go near the `lock` handler (251-262)** — `lock` returns
  terminally, `settings-lock` must still be relayed. It belongs as a fall-through
  inside the managed block at **`party/index.ts:397-410`**, folding in line 400.
  Use `st.role === "host" || st.uid === this.hostId`; the uid fallback is
  load-bearing because `onClose` (461-470) updates `hostId` but never rewrites
  `conn.state.role`, so a promoted host fails a role-only test.
- **The honest reason to ship it is a live bug, not the exploit:**
  `resetSettingsLock()` is not called on the plain auto-reconnect branch
  (`06:1450-1488`), so a host whose network blips reconnects as a guest with
  `settingsLockOn` still true, and the 2s poll at `:494` rebroadcasts forever.
  Budget ~3 client lines at `06:1273-1288` to clear it.
- Minimal gate IS a strict subset of share-lock (~1 line changes later) **provided
  you add no client-side host gate** in `toggleSettingsLock()` — share-lock exists
  to let non-hosts call it, so that line would be thrown away.
- The gate does **not** fix the stranded-lock bug (host leaves while locked →
  guests keep an undismissable banner); only share-lock's relay-authored release
  does. A one-line local dismiss is the stopgap if it bites.

### 8.4 Things no planning doc had captured

1. **DATE CONTRADICTION — Gabriel's call, worth more than any ordering.**
   `NEXT-FEST-PLAN.md` (most recent strategy doc, Aug 10) says "demo-first…
   Launch lands after the fest", makes **Aug 31 11:59pm PDT a hard Next Fest
   registration deadline**, Sep 7 the trailer cutoff, Sep 21 the demo build
   deadline — and leaves decision #3 "launch date relative to the fest"
   unanswered at line 155. The Sep 1 date traces to older planning. Under the
   fest reading the long pole is the **lite/demo client**, which has *zero*
   scaffolding today (grep for lite/liteMode/LITE_MODE/isLite → 0 hits).
2. **Ship path unproven**: `package.json:3` still `1.0.0`; nobody has verified
   `dist/win-unpacked` since 67 commits landed post-usertest.
3. **The live relay's deployed version is unknowable from the repo.** If the
   worker predates 7cadf0b, **Take Turns is already broken in production** — and
   Steam clients ship their own JS against that shared live worker.
4. **Items 2 and 3 collide with EACH OTHER** over `#recDrawer`
   (`28-studio-drawer.js`, `.rec-drawer` height in `css/styles.css`, and
   `.studio-tab-panel[data-tab="audio"]`). Agree the drawer height up front.
5. **The feel-test batch is EIGHT tunables, not six** — add the Density/Time
   fader curve (`DENSITY_FADER_TAU_MIN/TAU_MAX` + detent) and P15-1's mobility
   curve + 3s dry half-life. Plus three more defaults that are also Gabriel's:
   **Mandala Fill=off + wedge-only** (`index.html:522`/`:533` — 11 of 12 wedges
   silently refuse paint on an opt-in lotus feature), **BRUSH_SPACING 0.35**, and
   the **kZoom label** (`index.html:599`, registry-backed with `mut` scope
   `basic`, so Mutate randomizes it and peers rewrite it via the look-mirror —
   the leading remaining suspect for "the zoom keeps changing by itself").
6. **cos-oscillator RE-WIRE HAZARD — strip the wiring, KEEP the module.**
   `07-cos-oscillator.js:527` reads a persisted settingsManager key, and a real
   profile on this machine carries **enabled oscillators with accumulated phase**
   (`tmp-preset-mask.json`: brushSize enabled 0.1-10.4, timeScale enabled
   0.57-3). Re-enabling would ship a self-animating brush size and time scale to
   a returning user, with the only off switch in a `~ COS` pill they have never
   seen. Delete the 26 guarded sites + the `package.json:77` exclusion, but keep
   the 538-line module and `css/styles.css:1645-1780` with a header note. Do NOT
   add a migration deleting that stored key — it is the only surviving record.
7. **Audio — a stated product pillar — has no visible way to load a track**
   (`20-mixer-layout.js:3680-3695`: select source=File, then tick a checkbox
   labelled "Enable", which fires a hidden input). `grep "Load track"` → nothing.
8. **The silent-failure class is this codebase's real hazard.** `typeof
   window.X === 'function'` guards turn a missing function into a dead button
   rather than an exception — exactly what hid the recLayers deadness for months.
   When deleting top-level symbols from unwrapped shared-scope files, grep for
   `window.<name>` SEPARATELY from bare `<name>`. And the Electron/Steam bundle
   cannot be hotfixed the way the web client can.

### 8.5 Corrected ordering (supersedes SS6's phase order for pre-launch)

0. **Ship-path verification** (half day, repeat weekly): build + launch
   `dist/win-unpacked`, click through the usertest surfaces, bump
   `package.json:3`, fix `publish:steam`, and establish what the live relay runs.
1. **The defaults sitting with Gabriel** — 8 tunables + the 3 extra defaults
   above. Gated on a human, ~zero implementation cost, 100% of players meet them.
2. **The `settings-lock` relay gate ALONE**, then one deploy from a known-good
   main. (Split from share-lock; verify with `partykit dev` + 3 browser profiles —
   `server-relay.js` is a passthrough and cannot exercise it.)
3. **TODO-NEXT items 3 then 2 as ONE branch** in the current file structure —
   recording first (sharper failure mode: `recRenderUI` rebuilds via innerHTML,
   all interaction delegated off class names / `data-action` / `data-id`, and
   `_getRecBtns` caches by id — ids must MOVE, not duplicate). Agree the
   `#recDrawer` height before writing a line. Pull the 🌐 Multiplayer button out
   of the transport strip (`index.html:1013`) as its own first commit.
4. **Only the 3 provably-safe deletions** (~1-2h, each its own commit):
   `14-radial-slider.js`; `04a:73-176` + orphaned globals `01-config.js:35,38,39`
   (the ONLY genuinely pure deletion — keep `isRightMouseDown`/`isReplayActive`
   at `01-config.js:36-37`, the live right-mouse replay is a separate newer
   engine in 05d); and the cos-oscillator **wiring** strip per 8.4#6.
5. **Post-launch**: recLayers path (4-6h + regression tail), `05l:227-551`
   (needs a touch-device smoke test), share-lock as a feature, the five extra
   dead items, then Phases B → C → D/E with the post-layout id assertion built
   BEFORE the first mixer extraction.

Rule that overrides everything: multi-file changes land as ONE commit — the dev
server serves the repo live.

---

## 9. Next Fest (October) & wishlist-prep audit — 2026-08-20

Consolidates four research passes (old-TODO mining, active-doc mining, web verification of Valve dates/rules, repo asset/demo state) against NEXT-FEST-PLAN.md. This section is the operative fest plan; where it conflicts with NEXT-FEST-PLAN.md or the task boards, this section wins.

### 9.1 Corrected timeline

Every date in NEXT-FEST-PLAN.md was verified against Valve's official October 2026 edition page (https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/2026october — public, verbatim timeline). **All plan dates are CONFIRMED.** Gabriel's re-framing is correct: end of August = registration + live store page; September = trailer + demo; October = fest.

| Date | Gate | Status as of Aug 20 |
|---|---|---|
| ~Aug 17 | Plan's own store-page submit target (NEXT-FEST-PLAN.md:50) | **BLOWN — 3 days past.** Zero store-page work since Jul 29 (sole asset commit 1efbab8). |
| Aug 18, 10-11am PDT | Valve live Q&A (CONFIRMED, official page) | **Passed.** No notes captured in any doc — UNVERIFIED whether Gabriel attended. Mine the recording/FAQ before submitting. |
| **~Aug 24 (Mon)** | **Real last-safe store-page submit.** Valve review = 3-5 business days, can bounce (https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/2026october). Aug 20 is a Thursday; only ~7-8 business days remain before Aug 31. Submit Fri Aug 21 → approval Wed 26-Fri 28 best case; one bounce consumes the entire margin. | **THE deadline. Submitting today/tomorrow is the only schedule with bounce room.** |
| ~Aug 28 | 30-day Steam Direct gate clears (started 2026-07-29, NEXT-FEST-PLAN.md:36) | Not binding. |
| **🔴 Aug 31, 11:59pm PDT** | **Registration deadline** (CONFIRMED verbatim). Requires store page "published and public" first (CONFIRMED — review required even if the demo has no separate page). | Store page is **NOT LIVE** — verified: https://store.steampowered.com/app/5068940 redirects to the storefront homepage; Steam search finds no "A Small Good Thing". Miss this → no October fest, and Next Fest is once-per-game (CONFIRMED). |
| **Sep 7** | Valve pulls trailers for the official compilation (CONFIRMED) | 18 days out. Zero trailer artifacts exist anywhere in the repo (grep + git log --all). Free placement, gone if missed. |
| Sep 7-21 | Lite-client user testing window (NEXT-FEST-PLAN.md:58) | Requires the lite client to exist by ~Sep 7. Zero scaffolding today. |
| **🔴 Sep 21** | Demo build + store page in review to make Press Preview (CONFIRMED as a "should"-date, soft but the one that matters — press-able story is the whole strategy, NEXT-FEST-PLAN.md:30-32) | Needs: lite build, demo Steam app, ledger, hardening list (§9.4). |
| Oct 5 | Hard backstop, all items submitted (CONFIRMED) | Do not plan against this — it forfeits press. |
| Oct 8, 10am PDT | Press Preview opens (CONFIRMED) | |
| **Oct 19-26** | The fest, 10am PDT to 10am PDT (CONFIRMED) | Fest-week ops: hand-updated ledger, matchmaking under load, griefing response. |
| Post-Oct 26 | Full launch (fest is unreleased-games-only, CONFIRMED) | Launch date = open decision #3. The old "release Sep 1" plan (steam-plan memory) is dead — see §9.6. |

UNVERIFIED items the web pass could not settle: whether October shows as opt-in-able on Gabriel's Steamworks dashboard (NEXT-FEST-PLAN.md:39 checkbox still unchecked — dashboard state is outside the repo); whether the live PartyKit relay serves current main (likely per TODO-NEXT.md:17's Aug 17 deploy record, but never smoke-tested).

### 9.2 Workstream status

| WS | What exists today (verified) | Realistic size | Critical path |
|---|---|---|---|
| **C — Store page** | **NOT LIVE (verified, see §9.1). All 11 steam/store-assets files are the OLD brand — art literally reads "Fluid Simulation / Creative Simulation Engine" (image-verified on main capsule, header, library capsule). No copy draft anywhere (grep). ZERO screenshots — Steam requires minimum 5 and Workstream C never listed them. The "icon generator in scratchpad" precedent (NEXT-FEST-PLAN.md:122) no longer exists — never committed, no surviving scratchpad copy.** | Assets: 1-2 agent days from scratch (no tooling head start). Copy: Gabriel, hours. Screenshots: need the rebranded app + a real two-painter session — couple with trailer capture. Submit: Gabriel, dashboard. | **Everything.** This is the registration prerequisite. Nothing else matters until it's in review. |
| **A — Lite client** | Zero scaffolding — no lite/liteMode/isLite anywhere (grep of js/, index.html, build-web.js). Favorable seams verified: scripts/build-web.js already rewrites the copied index.html post-copy (cache-bust, lines 71-78) so a lite flag injects the same way; body-class gate js/00-window-controls.js:13-20 (electron-mode/web-mode) is a ready pattern for lite-mode. Gaps: partykit.json serves ONE static path ("serve.path":"public"); **no demo app exists on Steam — demos are a separate APPID with their own depot/vdf pair and store widget, not "a separate depot" as the plan says (steam/*.vdf define only 5068940/5068941).** | Build flag + UI subtraction: days, agent-doable. Demo Steam app: Gabriel dashboard action + agent vdf work. Daily canvas + presence label: small. | Must exist ~Sep 7 for the test window; final Sep 21. Second-most urgent after the store page. |
| **B — Ledger** | Zero code (grep: no ledger/counter/wishlist refs in party/ or js/). The plan's sizing claim is credible: the durable-storage template exists exactly as described at party/lobby.ts:23-53 (waiting pointer hydrated from room.storage). | ~30-line counter + copy. Genuinely small. Copy gated on the Valve-rules answer (now in hand — §9.3). | Must be visible in the demo by Sep 21. Hand-update mechanism + morning habit needed before Oct 19. |
| **D — Backlog** | Matchmaking fix MERGED (f084af3 + 784e724, 2026-08-13, ancestors of main == origin/main) and likely live (TODO-NEXT.md:17 records Aug 17 deploy of bc59dd9, which postdates both). **Never re-verified live** — the 8-6 doc's two-device >60s test was never performed. Dab-train parity merged; peer-runs-hot residual (measured 281 vs 914 velocity sum, 8-6-todo-pre-test.md §1.3) never feel-tested. Settings-lock relay forgery gap OPEN — the relay forwards settings-lock from ANY sender (TODO-NEXT.md §5, USERTEST-2026-08-16.md C4); subtraction does NOT fix this, contra NEXT-FEST-PLAN.md:86-89. | Relay gate: ~6 server + ~3 client lines (8.5 item 2). Live verify: an evening with two devices. Feel-tests: Gabriel. | Matchmaking robustness IS the product during fest week. Bundle relay gate + verify with the demo's one relay deploy. |

### 9.3 Wishlist-prep strategy

**Valve rules verdict on "wishlists keep the canvas open" (NEXT-FEST-PLAN.md:104 checkbox — now answered):** plausible-allowed, not explicitly blessed. No rule prohibits wishlist solicitation or wishlist-linked promises — the official wishlist doc (https://partner.steamgames.com/doc/marketing/wishlist) contains no restrictions and actively encourages wishlist promotion. The explicit prohibitions are adjacent and must be steered around: (a) capsule art may carry only artwork + name/subtitle — the ledger copy must NOT appear in any capsule (https://partner.steamgames.com/doc/store/assets/rules); (b) no images mimicking Steam UI (fake wishlist buttons) and no external links in descriptions (https://steamcommunity.com/groups/steamworks/announcements/detail/4201376568915048836); (c) the review-manipulation rules cover reviews, not wishlists — keep the mechanic far from review language. Residual risk: store review is discretionary; "keep the canvas open" could read as feature-removal threat to a reviewer. **Have a softer fallback phrasing drafted before submitting.** Ledger copy in the store description and in-demo UI: green light with those constraints.

Dated strategy, from verified benchmarks:

- **Now (Aug 20-24):** Coming Soon page live ASAP — earlier pages accrue more; 6-12 months pre-release outperforms 60-90-day starts (https://presskit.gg/field-guides/indie-game-marketing-timeline; Valve: "as soon as you're ready and able"). Here the Aug 31 gate dominates anyway. A Coming Soon page needs no price — price decision does not block submission.
- **Sep 1 - Oct 19:** target **≥2,000 wishlists entering the fest**. Pre-fest momentum is the strongest fest-performance predictor (Spearman 0.825); Feb 2026 medians: 0-999 pre-fest → +322 gained, 1,000-9,999 → +1,006, 10,000+ → +5,215 (https://howtomarketagame.com/2025/03/26/benchmarks-how-many-wishlists-can-i-get-from-steam-next-fest/). The free web stranger client + the press-able ledger story are the accrual engines.
- **Demo live by Sep 21, not Oct 5:** demos shipped 2-4+ weeks pre-fest earned ~2.5x more fest wishlists, and creators can cover it before day 1 (same source; https://www.biggamesmachine.com/steam-next-fest-marketing-strategies/). This independently confirms Sep 21 as the real deadline.
- **During fest week:** rankings feed on demo playtime/engagement, pre-existing velocity, and streamer pickup; healthy demo→wishlist conversion ≈ 20% of players (benchmarks post). Two-stranger pairing IS the engagement mechanic — which is why matchmaking robustness and the solo-visitor answer (§9.4) are wishlist-prep, not polish.
- **Goal framing:** ~7,000 wishlists (velocity-sensitive, not a hard floor) ≈ Popular Upcoming threshold, which feeds New & Trending at launch (https://www.steampageanalyzer.com/blog/steam-popular-upcoming-list). Fest tiers: <1,000 gained = bronze, 1,000-6,999 silver, 7,000-9,999 gold, 10k+ diamond (https://howtomarketagame.com/benchmarks/). Fest-acquired wishlists convert ~0.75x normal, so launch soon after the fest while they're warm (https://newsletter.gamediscover.co/p/why-games-get-big-post-release-discovery) — consistent with the plan's fest-then-launch shape.

### 9.4 Merged ordering (reconciles 8.5 with demo-first)

Section 8.5 was written for a full-app launch; the demo-first strategy re-values it. Verdict per 8.5 item: **item 0 survives retargeted** (ship-path verification now means the DEMO app's path too); **item 1 splits** (fest-facing defaults jump up — every fest visitor has fresh localStorage, so default changes reach 100% of the audience, inverting TODO-NEXT's "won't reach existing users" deprioritization; studio-only defaults wait); **item 2 survives, folded into the demo relay deploy**; **item 3 (recording view + audio UI) DEMOTED to post-fest** — studio surfaces a lite visitor never renders; **item 4 (safe deletions) demoted to opportunistic**; **item 5 stays post-launch**. The 8.5 one-commit rule (dev server serves the repo live) still overrides everything.

1. **NOW → ~Aug 24: store-page bundle.** Agent: rebuild the 11 assets under "A Small Good Thing" + tagline (from scratch — no generator survives), capture ≥5 screenshots (needs a two-painter session — see #2). Gabriel: store description leading with the communal hook (rules answer in §9.3 — keep it out of capsules, draft a soft fallback), dashboard: confirm October opt-in shows (NEXT-FEST-PLAN.md:39, still unchecked), mine the Aug 18 Q&A recording, **submit for review**. Submit by Mon Aug 24 at the absolute latest; today/tomorrow preserves bounce margin.
2. **In parallel, this week: trailer + screenshot capture session (Gabriel, hard date Sep 7).** Two machines, two people painting on the deployed relay — Take Turns + dab-train parity make the footage look right. Export tooling verified ready (window.__exporting suppresses the mask film, js/24-video-export.js:82,97 — TODO.md:90's contrary claim is stale). One capture session feeds trailer AND screenshots AND the eventual store-page GIFs.
3. **By Aug 31: registration confirmed on the dashboard** (Gabriel; blocked on #1's approval).
4. **8.5 item 0, retargeted (agent + Gabriel, repeat weekly):** build + launch dist/win-unpacked, bump package.json version, fix publish:steam, **verify what the live relay actually runs** (two-device stranger-match >60s apart — the 8-6 §1.5 re-verify that was never done), and **verify the deployed web build carries the Ascend/Rainbow photosensitivity removal** (stale-public/ caveat, USERTEST-2026-08-15.md B1, USERTEST-2026-08-16.md logistics — a stale public/ silently re-ships strobe features).
5. **Sep 1-7: lite client core (agent).** Build flag in scripts/build-web.js (seams verified: index-rewrite lines 71-78, body-class pattern js/00-window-controls.js:13-20), join/paint-only UI, structural settings adoption, daily canvas, "someone is here" presence label. Gabriel: create the **demo app on Steamworks** (separate appid — the plan's "separate depot" is under-specified) + lite-scope decisions (open decision #5 below). Solve partykit's single serve path (second project or path routing).
6. **Sep 1-7, bundled with the lite client's ONE relay deploy (agent):** settings-lock relay forgery gate (~6 lines party/index.ts:397-410 + ~3 client, 8.5 item 2 — survives the subtraction argument because the relay serves all clients) + ledger durable counter (template party/lobby.ts:23-53) + hand-update admin path.
7. **Sep 1-7: fest-facing hardening (agent):** WebGL-unsupported/context-lost error screen (none exists — grep-verified), iGPU adapter user-facing hint (console-only today, js/04a-canvas-gl-config.js:262-272 — this bug hit Gabriel's own 4090 machine), MP_PERF_LOCAL_KEYS audio-key fix (remote painter can re-fire the mic prompt — trust-killer; TODO-NEXT §2 commit 3), fix the canvas-size force dependence OR force a fixed canvas aspect in lite (the plan's deprioritization rests on a false premise — strangers run arbitrary monitors, 8-6 §1.3), first-run lite onboarding (only a 12s toast exists, js/05n-hotkeys-init.js:534), **leave-a-bad-match affordance** (griefing story — in NO document today, largest unmitigated risk for a "tender" demo), solo-visitor waiting copy.
8. **8.5 item 1, fest slice (Gabriel, one sitting):** BRUSH_SPACING default, wheel-as-brush-size decision for lite, CURL_EDGE_GATE verified against the border-explosion symptom (mechanism fix never checked against the bug class — fatal if live fest week), dab-train peer-runs-hot feel-test (two machines; receive-side drain queue is the pre-designed fix if hot, 8-6 §1.3), Mandala/kZoom lite-scope calls. Studio-only tunables (Density/Time remap, shading, wetness) wait.
9. **Sep 7-21: lite-client user testing, in PAIRS** (Gabriel recruits — scheduling problem, start now; NEXT-FEST-PLAN.md:67-70). Write the lite test script (the 8-6 full-app script was superseded and never replaced). Answer the 90-second question. Iterate. **Sep 21: demo build + final store page in review.** Include a lite-scoped regression slice (multiplayer + web defaults + border soak) — the full CL-1 studio matrix stays parked.
10. **Sep 21 - Oct 19:** buffer, wishlist push, press outreach off the Oct 8 Press Preview. 8.5 item 4 (three safe deletions) only if idle.
11. **Post-fest:** 8.5 items 3 and 5 unchanged (recording view + audio UI branch, recLayers, 05l, share-lock feature, phases B-E), plus D3/D6/D7/P15, .fluid export, launch-day buyer's receipt, TRIAGE-TODO board.

### 9.5 Open decisions for Gabriel

Carried from NEXT-FEST-PLAN.md:146-156: **(1) Price** — $9.99 vs $14.99; does not block the Coming Soon page. **(2) Honest vs symbolic daily budget** for the ledger. **(3) Launch date** — must land after Oct 26 (fest is unreleased-only, CONFIRMED); benchmarks argue soon-after while fest wishlists are warm (§9.3). **(4) Week-7 checkpoint** on the calendar.

New, surfaced by this audit: **(5) Lite scope** — do Mutate (ships per the monetization plan, but kZoom's 4x zoom-look randomization reads as "broken" to cold visitors — rename + consider pulling from mut scope), Paint Collider (painted colliders don't replicate to peers — core-loop confusion if it ships), and any hotkeys survive in lite? **(6) Fixed canvas aspect in lite** — cheapest fix for the force-direction skew; makes the plan's deprioritization actually true. **(7) Griefing/leave-a-match policy** — how much of #7's affordance ships for the fest. **(8) Ledger fallback phrasing** if Valve review objects to "keep the canvas open". **(9) Demo app creation on Steamworks** — Gabriel's dashboard action, needed before any demo depot work.

### 9.6 Contradictions & stale docs

- **NEXT-FEST-PLAN.md is already self-broken on schedule:** its own first milestone (assets rebuilt week of Aug 10, submit ~Aug 17) never moved — every Aug 10-19 commit is studio work; steam/store-assets untouched since 1efbab8 (Jul 29). Update the plan's dates or supersede it with this section. Its "icon generator in scratchpad" precedent is fictional (never committed, no surviving copy); its "separate Steam depot" for the demo should read "separate demo APP"; its "subtraction beats gating" claim is wrong for the relay (USERTEST-2026-08-16.md C4); its canvas-size deprioritization rests on a false premise; its buyer's-receipt priority is untriggerable during the fest (nobody can buy — the wishlist-side moment is unspecced).
- **TODO-NEXT.md:** stale statuses — layers-vertical-space "not pushed" is merged to main; ranks studio items (audio restructure, recording view, share-lock, density/time remap) above fest work that has zero entries in it. Annotate with fest gates or mark superseded-for-sequencing by this section.
- **TASKS-FINAL.md:** P15-1 "awaiting merge" is stale (merged to main, off by default); carries no fest awareness; .fluid "IMPORTANT" flag is a post-fest-launch gate — say so explicitly to protect September runway.
- **UX-fixes.md / UX-fixes-plan.md:** ferrofluid (6.2) shown open/approved — CUT 2026-08-16 (js/30-audio-scenes.js:397); mark both.
- **TODO.md:90:** "video export bakes in the red mask film" is FALSE — fixed via window.__exporting (js/24-video-export.js:82,97). Strike it before someone re-fixes it.
- **8-6-todo-pre-test.md:** its "zero blockers" certified the FULL app; confidence does not transfer to the lite client, which nobody has cold-tested. Superseded as the test plan; its replacement (lite script, pairs) does not exist yet — write it in step 9.
- **Steam-plan memory (Coming Soon ~Aug 5, release Sep 1):** flatly incompatible with unreleased-only Next Fest; the fest plan supersedes it. Gabriel's "end of August" pressure was this fossil — end of August correctly maps to registration + store page only.
- **Three competing sources of truth** (TODO.md/UX-fixes vs TASKS-FINAL/TRIAGE-TODO vs NEXT-FEST-PLAN): this section is now the sequencing authority through Oct 26; the boards remain item-level references only.

### 9.7 NAME PIVOT — 2026-08-20 (later)

**"A Small Good Thing" → "Swirl Together"**, tagline unchanged ("A playful
painting game for two or more"). Everywhere this document says the former, read
the latter.

Done in code: all 11 store assets re-baked under the new name (type scaled up —
14 characters against the old 18 buys presence in every slot); `index.html`
title/splash/titlebar/F1 footer; `electron-main.js` crash + unresponsive
dialogs; `package.json` productName (so the exe becomes `Swirl Together.exe`);
GPU-failure screens in `04a`; `README`, `LICENSE`, `THIRD-PARTY-NOTICES`,
`RELEASE.md`, `steam/app_build.vdf`, `server-relay.js`, comfyui-node logging.
Verified live: app boots, title/titlebar correct, painting works, no errors.

**Deliberately NOT renamed** (frozen at D2, and renaming them orphans user data):
`build.appId` = `com.gabrielmtn.fluidsimulation`; the `fluidUI:` localStorage
namespace; the `.fluid` / `.fluidpreset` format ids; npm package `name`.

**Preset vault**: default moved to `Documents/Swirl Together/Presets`, with BOTH
former titles kept adoptable (`12b-preset-vault.js:165-183`). Verified on this
machine: it resolved to the original `Documents/Fluid Simulation/Presets`, so
existing presets are still found. Note a find-and-replace over the app title
will corrupt those legacy strings — they are history, not the name.

**Gabriel's Steamworks actions, all dashboard-side:**
1. **Rename the app** (5068940) and store item 1276064 to "Swirl Together".
   Valve re-screens names; do it BEFORE submitting the page for review, not after.
2. **Set the launch executable** to `Swirl Together.exe` (RELEASE.md:51) — the
   productName change renames the binary, and a stale launch config ships an app
   that cannot start.
3. Re-check the reserved name does not collide (screening was run for the old
   name; a new name needs the same pass).
