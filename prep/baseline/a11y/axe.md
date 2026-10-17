# axe-core report — the shipping UI, every surface

Generated 2026-10-17T08:17:14.896Z by `prep/baseline/scripts/a11y.js` (F3). Machine copy: `axe.json`. Engine: axe-core 4.14.0 (`prep/baseline/vendor/axe.min.js`, MPL-2.0), default rule set (no `runOnly`: WCAG 2.0/2.1/2.2 A and AA rules plus axe best-practice rules; every rule's tags are listed so the two can be told apart), `resultTypes: [violations, incomplete]`, run over `document` with the left bar open and all 17 sidebar sections expanded, then once more with each overlay / popover open. Notes and caveats: `NOTES.md`.

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

## Runs

| Run | State | Opened | Closed | Violations (rules / nodes) | Incomplete (rules / nodes) | Rules passed | Inapplicable | Violation nodes vs main | axe time |
|---|---|---|---|---|---|---|---|---|---|
| everything-open | left bar open, all 17 sections expanded, no overlay | n/a | n/a | 9 / 163 | 5 / 34 | 36 | 49 | — | 269 ms |
| hotkey-overlay | F1 hotkey sheet open (DialogFocus.hold) | yes | yes | 7 / 161 | 4 / 112 | 44 | 44 | 0 new / 2 gone | 190 ms |
| radial-menu | E radial menu open over the canvas | yes | yes | 9 / 164 | 5 / 53 | 38 | 47 | 1 new / 0 gone | 176 ms |
| colour-picker | colour picker popover open from the top bar well | yes | yes | 7 / 165 | 5 / 35 | 39 | 48 | 4 new / 2 gone | 172 ms |
| presets-popup | Presets panel open | yes | yes | 9 / 166 | 5 / 35 | 36 | 49 | 3 new / 0 gone | 164 ms |
| arm-tip-menu | arm 1 tip menu open (extra, not in the brief's list) | yes | yes | 10 / 167 | 5 / 48 | 36 | 48 | 5 new / 1 gone | 178 ms |

"Violation nodes vs main": violation (rule + target) pairs present with the overlay open that the main run did not have, and main-run pairs that disappeared while it was open (an overlay's scrim hiding the page, for instance). Full node lists for every run are in `axe.json`.

## Violations with everything open (main run), grouped by rule

| Rule | Impact | Nodes | Tags | Help |
|---|---|---|---|---|
| color-contrast | serious | 1 | wcag2aa wcag143 | Elements must meet minimum color contrast ratio thresholds |
| label-content-name-mismatch | serious | 2 | wcag21a wcag253 | Elements must have their visible text as part of their accessible name |
| label-title-only | serious | 3 | best-practice | Form elements should have a visible label |
| label | critical | 4 | wcag2a wcag412 | Form elements must have labels |
| landmark-one-main | moderate | 1 | best-practice | Document should have one main landmark |
| meta-viewport | moderate | 1 | wcag2aa wcag144 | Zooming and scaling must not be disabled |
| page-has-heading-one | moderate | 1 | best-practice | Page should contain a level-one heading |
| region | moderate | 145 | best-practice | All page content should be contained by landmarks |
| select-name | critical | 5 | wcag2a wcag412 | Select element must have an accessible name |

### `color-contrast` — serious — Elements must meet minimum color contrast ratio thresholds

Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds ([rule](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI)). Tags: cat.color, wcag2aa, wcag143, TTv5, TT13.c, EN-301-549, EN-9.1.4.3, ACT, RGAAv4, RGAA-3.2.1.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | .brush-presets-empty | <span class="brush-presets-empty">None saved yet</span> | Element has insufficient color contrast of 3.67 (foreground color: #676768, background color: #020203, font size: 7.5pt (10px), font weight: normal). Expected … |

### `label-content-name-mismatch` — serious — Elements must have their visible text as part of their accessible name

Ensure that elements labelled through their content must have their visible text as part of their accessible name ([rule](https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI)). Tags: cat.semantics, wcag21a, wcag253, EN-301-549, EN-9.2.5.3, RGAAv4, RGAA-6.1.5.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | button[aria-controls="visualResolutionDdList"] | <button type="button" class="qub-dd-btn" title="Image Sharpness — Resolution of the paint itself - costs GPU" aria-haspopup="listbox" aria-… | Text inside the element is not included in the accessible name |
| 2 | button[aria-controls="physicsResolutionDdList"] | <button type="button" class="qub-dd-btn" title="Motion Detail — Resolution of the motion sim, higher creates finer swirls, but can be more … | Text inside the element is not included in the accessible name |

### `label-title-only` — serious — Form elements should have a visible label

Ensure that every form element has a visible label and is not solely labeled using hidden labels, or the title or aria-describedby attributes ([rule](https://dequeuniversity.com/rules/axe/4.14/label-title-only?application=axeAPI)). Tags: cat.forms, best-practice.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | #materialMode | <select id="materialMode" class="material-mode-select" title="Material - Changes settings to give a few different feels" style="width: 152p… | Only title used to generate label for form element |
| 2 | #colorPicker | <input type="color" id="colorPicker" value="#ff0000" class="ch-color-input" title="Color Picker. Opens color picker, you can also Alt+click… | Only title used to generate label for form element |
| 3 | #mutationStrength | <input type="range" id="mutationStrength" min="0.05" max="1" step="0.05" data-no-scale="1" title="Strength of mutate, larger creates wider … | Only title used to generate label for form element |

### `label` — critical — Form elements must have labels

Ensure every form element has a label ([rule](https://dequeuniversity.com/rules/axe/4.14/label?application=axeAPI)). Tags: cat.forms, wcag2a, wcag412, section508, section508.22.n, TTv5, TT5.c, EN-301-549, EN-9.4.1.2, ACT, RGAAv4, RGAA-11.1.1.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | .layer-title | <input type="text" class="layer-title" value="Sim Layer" readonly="" draggable="false"> | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |
| 2 | .layer-vis-check | <input type="checkbox" class="layer-vis-check" data-vis="sim" checked=""> | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |
| 3 | #exportVideoDuration | <input type="number" id="exportVideoDuration" min="1" max="300" style="width: 100%; padding: 4px; background: rgba(0, 0, 0, 0.3); border: 1… | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |
| 4 | #exportGifDuration | <input type="number" id="exportGifDuration" min="1" max="10" style="width: 100%; padding: 4px; background: rgba(0, 0, 0, 0.3); border: 1px … | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |

### `landmark-one-main` — moderate — Document should have one main landmark

Ensure the document has a main landmark ([rule](https://dequeuniversity.com/rules/axe/4.14/landmark-one-main?application=axeAPI)). Tags: cat.semantics, best-practice.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | html | <html lang="en" class="js" style="--app-height: 805px; --ui-scale: 1;"> | Document does not have a main landmark |

### `meta-viewport` — moderate — Zooming and scaling must not be disabled

Ensure <meta name="viewport"> does not disable text scaling and zooming ([rule](https://dequeuniversity.com/rules/axe/4.14/meta-viewport?application=axeAPI)). Tags: cat.sensory-and-visual-cues, wcag2aa, wcag144, EN-301-549, EN-9.1.4.4, ACT, RGAAv4, RGAA-10.4.2.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | meta[name="viewport"] | <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"> | user-scalable=no on <meta> tag disables zooming on mobile devices |

### `page-has-heading-one` — moderate — Page should contain a level-one heading

Ensure that the page, or at least one of its frames contains a level-one heading ([rule](https://dequeuniversity.com/rules/axe/4.14/page-has-heading-one?application=axeAPI)). Tags: cat.semantics, best-practice.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | html | <html lang="en" class="js" style="--app-height: 805px; --ui-scale: 1;"> | Page must have a level-one heading |

### `region` — moderate — All page content should be contained by landmarks

Ensure all page content is contained by landmarks ([rule](https://dequeuniversity.com/rules/axe/4.14/region?application=axeAPI)). Tags: cat.keyboard, best-practice, RGAAv4, RGAA-9.2.1.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | .ch-material > .ch-header | <div class="ch-header"> | Some page content is not contained by landmarks |
| 2 | #curl | <input type="range" id="curl" min="0" max="60" value="0" step="1" aria-label="Fluid" aria-valuetext="0" style="--min: 0; --max: 60; --val: … | Some page content is not contained by landmarks |
| 3 | div[data-accent="purple"] > .ch-header | <div class="ch-header"><div class="ch-label" title="Controls how thick the paint feels. 0 feels more like dye in water, 1 more like acrylic… | Some page content is not contained by landmarks |
| 4 | #viscosity | <input type="range" id="viscosity" min="0" max="1" value="0.3" step="0.01" aria-label="Viscosity" aria-valuetext="0.30" style="--min: 0; --… | Some page content is not contained by landmarks |
| 5 | div[data-accent="green"] > .ch-header | <div class="ch-header"><div class="ch-label" title="Isolate the motion transfer of your strokes on existing paint.">Isolation</div><span id… | Some page content is not contained by landmarks |
| 6 | #velocityInfluence | <input type="range" id="velocityInfluence" min="1" max="5" value="2" step="0.001" aria-label="Isolation" aria-valuetext="2.000" style="--mi… | Some page content is not contained by landmarks |
| 7 | div[data-ui-key="Color Blend"] > .ch-header | <div class="ch-header"><div class="ch-label" title="Laminar prevents colors from mixing. Blend causes colors to blend where they meet (affe… | Some page content is not contained by landmarks |
| 8 | #colorBlendPerceptual | <input type="range" min="0" max="1" step="0.001" id="colorBlendPerceptual" class="ch-perceptual" data-no-scale="1" aria-label="Laminar / Bl… | Some page content is not contained by landmarks |
| 9 | div[data-ui-key="Time"] > .ch-header | <div class="ch-header"><div class="ch-label" title="Simulation time value: left is slower 1 is real time, right is faster">Time</div><span … | Some page content is not contained by landmarks |
| 10 | #timeScalePerceptual | <input type="range" min="0" max="1" step="0.001" id="timeScalePerceptual" class="ch-perceptual" data-no-scale="1" aria-label="Time" aria-va… | Some page content is not contained by landmarks |
| 11 | div[data-ui-key="Density"] > .ch-header | <div class="ch-header"><div class="ch-label" title="Color density, at 1.000 it never fades (and you can try above 1...)">Density</div><span… | Some page content is not contained by landmarks |
| 12 | #densityDissipationPerceptual | <input type="range" min="0" max="1" step="0.001" id="densityDissipationPerceptual" class="ch-perceptual" data-no-scale="1" aria-label="Dens… | Some page content is not contained by landmarks |
| 13 | div[data-ui-key="Velocity"] > .ch-header | <div class="ch-header"><div class="ch-label" title="How much velocity to preserve. Can go above 1...">Velocity</div><span id="velocityValue… | Some page content is not contained by landmarks |
| 14 | #velocityDissipation | <input type="range" id="velocityDissipation" min="0.9" max="1.0009" value="1.0009" step="0.0001" aria-label="Velocity" aria-valuetext="1.00… | Some page content is not contained by landmarks |
| 15 | div[aria-label="Color of each stroke"] | <div class="ch-seg-switch" role="group" aria-label="Color of each stroke"> | Some page content is not contained by landmarks |
| 16 | #colorPicker | <input type="color" id="colorPicker" value="#ff0000" class="ch-color-input" title="Color Picker. Opens color picker, you can also Alt+click… | Some page content is not contained by landmarks |
| 17 | #sidebar-left | <div id="sidebar-left" aria-label="Brush" style=""> | Some page content is not contained by landmarks |
| 18 | #canvas-size-display | <div id="canvas-size-display">1008 × 646 · 1.56:1</div> | Some page content is not contained by landmarks |
| 19 | #canvas | <canvas id="canvas" width="1008" height="646" style="width: 1008px; height: 646px; z-index: 1000;"></canvas> | Some page content is not contained by landmarks |
| 20 | #sidebar-right > .sidebar-section[data-group="core"]:nth-child(2) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 21 | #joinRoomInput | <input type="text" id="joinRoomInput" placeholder="Paste a code" maxlength="48" spellcheck="false" autocomplete="off" aria-label="Room code… | Some page content is not contained by landmarks |
| 22 | .sidebar-section[data-group="core"]:nth-child(3) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 23 | .sidebar-section[data-group="core"]:nth-child(3) > .section-body > .control-group:nth-child(1) | <div class="control-group" style=""> | Some page content is not contained by landmarks |
| 24 | label[for="pressureDissipation"] | <label for="pressureDissipation">Pressure Dissipation <span id="pressureValue" class="value-display">0.950</span><span class="hk-cap hk-cap… | Some page content is not contained by landmarks |
| 25 | #pressureDissipation | <input type="range" id="pressureDissipation" min="0.9" max="1" value="0.95" step="0.001" style="--min: 0.9; --max: 1; --val: 0.95;"> | Some page content is not contained by landmarks |
| 26 | label[for="pressureIteration"] | <label for="pressureIteration">Pressure Iteration <span id="iterationValue" class="value-display">25</span><span class="hk-cap hk-cap-empty… | Some page content is not contained by landmarks |
| 27 | #pressureIteration | <input type="range" id="pressureIteration" min="1" max="50" value="25" step="1" style="--min: 1; --max: 50; --val: 25;"> | Some page content is not contained by landmarks |
| 28 | label[for="wetInfluence"] | <label for="wetInfluence" title="0 = off (pure fluidity). Higher = more paint-like.">Drying <span id="wetInfluenceValue" class="value-displ… | Some page content is not contained by landmarks |
| 29 | #wetInfluence | <input type="range" id="wetInfluence" min="0" max="1" value="0.14" step="0.01" style="--min: 0; --max: 1; --val: 0.14;"> | Some page content is not contained by landmarks |
| 30 | label[for="wetDrying"] | <label for="wetDrying" title="Drying time in seconds for wet paint to set. Lower = paint dries and holds faster.">Dry Time <span id="wetDry… | Some page content is not contained by landmarks |
| 31 | #wetDrying | <input type="range" id="wetDrying" min="0.5" max="20" value="4.5" step="0.5" style="--min: 0.5; --max: 20; --val: 4.5;"> | Some page content is not contained by landmarks |
| 32 | label[for="grainCleanup"] | <label for="grainCleanup" title="Smooths the finest grain out of paint while it moves. Lower: keeps more of the grain">Grain Cleanup <span … | Some page content is not contained by landmarks |
| 33 | #grainCleanup | <input type="range" id="grainCleanup" min="0" max="0.85" value="0.75" step="0.05" style="--min: 0; --max: 0.85; --val: 0.75;"> | Some page content is not contained by landmarks |
| 34 | .sidebar-section[data-group="core"]:nth-child(3) > .section-body > .checkbox-group.control-group:nth-child(7) | <div class="control-group checkbox-group" style=""> | Some page content is not contained by landmarks |
| 35 | .section-body > .checkbox-group.control-group:nth-child(8) | <div class="control-group checkbox-group" style=""> | Some page content is not contained by landmarks |
| 36 | label[for="mgCycles"] | <label for="mgCycles" title="Allows you to set how many down and back trips per frame. More makes the fluid feel a bit firmer. (min 2 as co… | Some page content is not contained by landmarks |
| 37 | #mgCycles | <input type="range" id="mgCycles" min="2" max="4" value="2" step="1" style="--min: 2; --max: 4; --val: 2;"> | Some page content is not contained by landmarks |
| 38 | label[for="mgPre"] | <label for="mgPre" title="Smoother sweeps before pushing the residual down to the next-coarser level">Pre-Smooth <span id="mgPreValue" clas… | Some page content is not contained by landmarks |
| 39 | #mgPre | <input type="range" id="mgPre" min="0" max="8" value="2" step="1" style="--min: 0; --max: 8; --val: 2;"> | Some page content is not contained by landmarks |
| 40 | label[for="mgPost"] | <label for="mgPost" title="Smoother sweeps after the coarse correction is interpolated back up">Post-Smooth <span id="mgPostValue" class="v… | Some page content is not contained by landmarks |
| 41 | #mgPost | <input type="range" id="mgPost" min="0" max="8" value="2" step="1" style="--min: 0; --max: 8; --val: 2;"> | Some page content is not contained by landmarks |
| 42 | label[for="mgCoarse"] | <label for="mgCoarse" title="Jacobi sweeps standing in for an exact solve on the coarsest (tiny) level">Coarse Solve <span id="mgCoarseValu… | Some page content is not contained by landmarks |
| 43 | #mgCoarse | <input type="range" id="mgCoarse" min="2" max="32" value="8" step="1" style="--min: 2; --max: 32; --val: 8;"> | Some page content is not contained by landmarks |
| 44 | label[for="mgRelax"] | <label for="mgRelax" title="How much of each sweep’s change to keep. 1.0 keeps all of it, like Pavel’s sweep. Lower is gentler and slower t… | Some page content is not contained by landmarks |
| 45 | #mgRelax | <input type="range" id="mgRelax" min="0.5" max="1" value="1" step="0.01" style="--min: 0.5; --max: 1; --val: 1;"> | Some page content is not contained by landmarks |
| 46 | .sidebar-section[data-group="core"]:nth-child(4) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 47 | .palette-label | <label class="palette-label">Palettes <span id="paletteImportStatus" class="import-status"></span><span class="hk-cap" data-hk-mod="ctrlshi… | Some page content is not contained by landmarks |
| 48 | #paletteCarousel | <div class="palette-carousel" id="paletteCarousel"> | Some page content is not contained by landmarks |
| 49 | #paletteKeys | <div class="palette-keys" id="paletteKeys">Ctrl ←→ prev / next color · ⇧S add color · ⇧X remove color</div> | Some page content is not contained by landmarks |
| 50 | .section-layers > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 51 | div[data-drop-position="top"] | <div class="drop-zone" data-drop-position="top">↑ Drop here for top (closest to viewer)</div> | Some page content is not contained by landmarks |
| 52 | .layer-thumbnail | <div class="layer-thumbnail" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display:flex; align-items:center; justif… | Some page content is not contained by landmarks |
| 53 | .layer-info | <div class="layer-info">                                     <input type="text" class="layer-title" value="Sim Layer" readonly="" draggable… | Some page content is not contained by landmarks |
| 54 | .layer-controls | <div class="layer-controls"> | Some page content is not contained by landmarks |
| 55 | div[data-drop-position="bottom"] | <div class="drop-zone" data-drop-position="bottom">↓ Drop here for bottom (furthest from viewer)</div> | Some page content is not contained by landmarks |
| 56 | .layers-subsection-title | <span class="layers-subsection-title">Path Layers</span> | Some page content is not contained by landmarks |
| 57 | .path-empty-text | <div class="path-empty-text">No path layers yet</div> | Some page content is not contained by landmarks |
| 58 | .path-empty-hint | <div class="path-empty-hint">Paths trace shapes into the fluid automatically</div> | Some page content is not contained by landmarks |
| 59 | .layers-options-group | <div class="layers-options-group"> | Some page content is not contained by landmarks |
| 60 | #mutation-section > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 61 | .mutation-field:nth-child(1) > label | <label>Scope</label> | Some page content is not contained by landmarks |
| 62 | .mutation-controls > .control-group | <div class="control-group"> | Some page content is not contained by landmarks |
| 63 | .mutation-field:nth-child(3) | <div class="mutation-field"><label>Variants</label><select id="mutationCount"><option value="4">4</option><option value="6" selected="">6</… | Some page content is not contained by landmarks |
| 64 | .mutation-locks | <div class="mutation-locks"> | Some page content is not contained by landmarks |
| 65 | .sidebar-section[data-group="expressive"]:nth-child(7) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 66 | div[data-fx="light-source"] | <div class="control-group checkbox-group fx-row" style="" data-fx="light-source"> | Some page content is not contained by landmarks |
| 67 | div[data-fx="light-shift"] | <div class="control-group checkbox-group fx-row" style="" data-fx="light-shift"> | Some page content is not contained by landmarks |
| 68 | div[data-fx="glow"] | <div class="control-group checkbox-group fx-row" style="" data-fx="glow"> | Some page content is not contained by landmarks |
| 69 | div[data-fx="shading"] | <div class="control-group checkbox-group fx-row" style="" data-fx="shading"> | Some page content is not contained by landmarks |
| 70 | div[data-fx="dither"] | <div class="control-group checkbox-group fx-row" style="" data-fx="dither"> | Some page content is not contained by landmarks |
| 71 | div[data-fx="gravity"] | <div class="control-group checkbox-group fx-row" style="" data-fx="gravity"> | Some page content is not contained by landmarks |
| 72 | div[data-fx="border"] | <div class="control-group checkbox-group fx-row" style="" data-fx="border"> | Some page content is not contained by landmarks |
| 73 | div[data-fx="breathing"] | <div class="control-group checkbox-group fx-row" style="" data-fx="breathing"> | Some page content is not contained by landmarks |
| 74 | .sidebar-section[data-group="expressive"]:nth-child(8) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 75 | .rec-strip-length | <div class="rec-strip-row rec-strip-length"> | Some page content is not contained by landmarks |
| 76 | .rec-strip-source | <div class="rec-strip-row rec-strip-source"> | Some page content is not contained by landmarks |
| 77 | .anim-grid | <div class="anim-grid"> | Some page content is not contained by landmarks |
| 78 | .section-header > .section-badge.audio-construction-badge | <span class="section-badge audio-construction-badge">Under construction</span> | Some page content is not contained by landmarks |
| 79 | .sidebar-section[data-group="expressive"]:nth-child(9) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 80 | .sidebar-section[data-group="expressive"]:nth-child(9) > .section-body > .control-group:nth-child(1) | <div class="control-group"> | Some page content is not contained by landmarks |
| 81 | .sidebar-section[data-group="expressive"]:nth-child(9) > .section-body > .checkbox-group.control-group | <div class="control-group checkbox-group" style="margin-top: 6px;"> | Some page content is not contained by landmarks |
| 82 | .sidebar-section[data-group="expressive"]:nth-child(10) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 83 | .feature-head.checkbox-group.control-group:nth-child(1) | <div class="control-group checkbox-group feature-head" style="">             <input type="checkbox" id="mandalaToggle" role="switch">      … | Some page content is not contained by landmarks |
| 84 | .feature-head.checkbox-group.control-group:nth-child(3) | <div class="control-group checkbox-group feature-head" style="">             <input type="checkbox" id="kaleidoToggle" role="switch">      … | Some page content is not contained by landmarks |
| 85 | .sidebar-section[data-group="expressive"]:nth-child(11) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 86 | .sidebar-section[data-group="expressive"]:nth-child(11) > .section-body > div:nth-child(3) | <div style="font-size: 9px; color: rgba(255, 255, 255, 0.35); margin: 0px 0px 10px; text-align: center; line-height: 1.35;">Drag, resize us… | Some page content is not contained by landmarks |
| 87 | #textOverlayList | <div id="textOverlayList" style="max-height: 130px; overflow-y: auto; margin-bottom: 8px;"><div style="font-size:9px;color:rgba(255,255,255… | Some page content is not contained by landmarks |
| 88 | .sidebar-section[data-group="expressive"]:nth-child(11) > .section-body > div:nth-child(5) | <div style="font-size: 9px; color: rgba(255, 255, 255, 0.3); text-align: center; padding: 6px 0px 10px; line-height: 1.4;">Select a line ab… | Some page content is not contained by landmarks |
| 89 | .sidebar-section[data-group="system"]:nth-child(12) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 90 | .sidebar-section[data-group="system"]:nth-child(12) > .section-body > .checkbox-group.control-group:nth-child(1) | <div class="control-group checkbox-group"><input type="checkbox" id="focusModeToggle"><label for="focusModeToggle" style="margin: 0px;">Foc… | Some page content is not contained by landmarks |
| 91 | .sidebar-section[data-group="system"]:nth-child(12) > .section-body > .brush-section-label | <label class="brush-section-label" style="margin-top: 8px;">Format</label> | Some page content is not contained by landmarks |
| 92 | .stream-format-info | <div class="stream-format-info">Freeform</div> | Some page content is not contained by landmarks |
| 93 | .sidebar-section[data-group="system"]:nth-child(12) > .section-body > .checkbox-group.control-group:nth-child(5) | <div class="control-group checkbox-group" style="margin-top: 6px;"><input type="checkbox" id="streamFormatLock"><label for="streamFormatLoc… | Some page content is not contained by landmarks |
| 94 | .sidebar-section[data-group="system"]:nth-child(13) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 95 | .sidebar-section[data-group="system"]:nth-child(13) > .section-body > .checkbox-group.control-group:nth-child(1) | <div class="control-group checkbox-group" style=""> | Some page content is not contained by landmarks |
| 96 | .photo-warn-learn | <a class="photo-warn-learn" href="https://www.epilepsy.com/what-is-epilepsy/seizure-triggers/photosensitivity" target="_blank" rel="noopene… | Some page content is not contained by landmarks |
| 97 | .sidebar-section[data-group="system"]:nth-child(13) > .section-body > .control-group:nth-child(3) | <div class="control-group" style=""> | Some page content is not contained by landmarks |
| 98 | label[for="penWindowBtn"] | <label for="penWindowBtn">Pen Input Window<span class="hk-cap hk-cap-empty"></span></label> | Some page content is not contained by landmarks |
| 99 | #penWindowHint | <div class="pen-window-hint" id="penWindowHint">A second window for external drawing display</div> | Some page content is not contained by landmarks |
| 100 | .sidebar-section[data-group="system"]:nth-child(13) > .section-body > .control-group:nth-child(5) | <div class="control-group" style=""> | Some page content is not contained by landmarks |
| 101 | .sidebar-section[data-group="system"]:nth-child(13) > .section-body > .control-group:nth-child(6) > label | <label title="Select screen the pen window opens on.">Pen Window Screen<span class="hk-cap hk-cap-empty"></span></label> | Some page content is not contained by landmarks |
| 102 | #penWindowScreens > .pen-window-hint | <div class="pen-window-hint">Or drag the window onto your pen display and press Fullscreen there.</div> | Some page content is not contained by landmarks |
| 103 | label[for="backgroundColorPicker"] | <label for="backgroundColorPicker">Background Color<span class="hk-cap hk-cap-empty"></span></label> | Some page content is not contained by landmarks |
| 104 | #backgroundColorPicker | <input type="color" id="backgroundColorPicker" value="#000000"> | Some page content is not contained by landmarks |
| 105 | .control-group:nth-child(7) > .checkbox-group.control-group | <div class="control-group checkbox-group" style="margin-top: 8px;">                 <input type="checkbox" id="transparentMode">           … | Some page content is not contained by landmarks |
| 106 | label[for="canvasOpacity"] | <label for="canvasOpacity">Canvas Opacity (Sim Visibility) <span id="opacityValue" class="value-display">100%</span><span class="hk-cap hk-… | Some page content is not contained by landmarks |
| 107 | #canvasOpacity | <input type="range" id="canvasOpacity" min="0" max="100" value="100" step="1" style="--min: 0; --max: 100; --val: 100;"> | Some page content is not contained by landmarks |
| 108 | .sidebar-section[data-group="system"]:nth-child(13) > .section-body > .checkbox-group.control-group:nth-child(9) | <div class="control-group checkbox-group" style="">             <input type="checkbox" id="preserveFluidOpacity" checked="">             <l… | Some page content is not contained by landmarks |
| 109 | .checkbox-group.control-group:nth-child(11) | <div class="control-group checkbox-group" style=""> | Some page content is not contained by landmarks |
| 110 | .checkbox-group.control-group:nth-child(12) | <div class="control-group checkbox-group" style="">             <input type="checkbox" id="lockCanvasBorders">             <label for="lock… | Some page content is not contained by landmarks |
| 111 | .section-body > .checkbox-group.control-group:nth-child(13) | <div class="control-group checkbox-group" style="">             <input type="checkbox" id="statsToggle">             <label for="statsToggl… | Some page content is not contained by landmarks |
| 112 | .sidebar-section[data-group="system"]:nth-child(14) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 113 | .sidebar-section[data-group="system"]:nth-child(14) > .section-body > .brush-section-label:nth-child(2) | <label class="brush-section-label">Project (.fluid)</label> | Some page content is not contained by landmarks |
| 114 | .brush-section-label:nth-child(6) | <label class="brush-section-label">Quick Export</label> | Some page content is not contained by landmarks |
| 115 | .export-size-readout | <div class="export-size-readout" title="Video and pictures come out at the canvas size. Max GIF is 640 pixels wide.">Comes out 1008 × 646 ·… | Some page content is not contained by landmarks |
| 116 | .sidebar-section[data-group="system"]:nth-child(14) > .section-body > div:nth-child(9) | <div style="display: flex; align-items: center; gap: 8px; margin: -6px 0px 12px;"> | Some page content is not contained by landmarks |
| 117 | .sidebar-section[data-group="system"]:nth-child(14) > .section-body > .brush-section-label:nth-child(11) | <label class="brush-section-label">Video Settings</label> | Some page content is not contained by landmarks |
| 118 | .sidebar-section[data-group="system"]:nth-child(14) > .section-body > .control-group:nth-child(12) | <div class="control-group"> | Some page content is not contained by landmarks |
| 119 | .sidebar-section[data-group="system"]:nth-child(14) > .section-body > .control-group:nth-child(13) | <div class="control-group"> | Some page content is not contained by landmarks |
| 120 | .brush-section-label:nth-child(14) | <label class="brush-section-label" style="margin-top: 12px;">GIF Settings</label> | Some page content is not contained by landmarks |
| 121 | .section-body > .control-group:nth-child(15) | <div class="control-group"> | Some page content is not contained by landmarks |
| 122 | .control-group:nth-child(16) | <div class="control-group"> | Some page content is not contained by landmarks |
| 123 | .sidebar-section[data-group="system"]:nth-child(15) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | Some page content is not contained by landmarks |
| 124 | .ui-vis-block > .brush-section-label | <label class="brush-section-label">Interface</label> | Some page content is not contained by landmarks |
| 125 | .hk-block:nth-child(2) > .brush-section-label | <label class="brush-section-label">Hotkeys</label> | Some page content is not contained by landmarks |
| 126 | .radial-block > .brush-section-label | <label class="brush-section-label">Radial Menu</label> | Some page content is not contained by landmarks |
| 127 | .hk-empty | <div class="hk-empty radial-how">Press E, or a mouse button set to Radial menu in Stroke and replay. Drag a slider away from the middle for… | Some page content is not contained by landmarks |
| 128 | .radial-row.hk-row:nth-child(1) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Brush Size">Brush Size</div><div class="hk-row-sub" title="Slider · Brush bar">Sli… | Some page content is not contained by landmarks |
| 129 | .radial-row.hk-row:nth-child(2) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Material Type - Fluid">Material Type - Fluid</div><div class="hk-row-sub" title="S… | Some page content is not contained by landmarks |
| 130 | .radial-row.hk-row:nth-child(3) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Viscosity">Viscosity</div><div class="hk-row-sub" title="Slider · Top bar">Slider … | Some page content is not contained by landmarks |
| 131 | .radial-row.hk-row:nth-child(4) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Isolation">Isolation</div><div class="hk-row-sub" title="Slider · Top bar">Slider … | Some page content is not contained by landmarks |
| 132 | .radial-row.hk-row:nth-child(5) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Laminar / Blend">Laminar / Blend</div><div class="hk-row-sub" title="Slider · Top … | Some page content is not contained by landmarks |
| 133 | .radial-row.hk-row:nth-child(6) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Multi-Brush">Multi-Brush</div><div class="hk-row-sub" title="Slider · Multi-Brush"… | Some page content is not contained by landmarks |
| 134 | .radial-row.hk-row:nth-child(7) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Time">Time</div><div class="hk-row-sub" title="Slider · Top bar">Slider · Top bar<… | Some page content is not contained by landmarks |
| 135 | .radial-row.hk-row:nth-child(8) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Density">Density</div><div class="hk-row-sub" title="Slider · Top bar">Slider · To… | Some page content is not contained by landmarks |
| 136 | .radial-row.hk-row:nth-child(9) > .hk-row-text | <div class="hk-row-text"><div class="hk-row-name" title="Velocity">Velocity</div><div class="hk-row-sub" title="Slider · Top bar">Slider · … | Some page content is not contained by landmarks |
| 137 | .radial-add-label | <input class="radial-add-label" type="text" maxlength="32" placeholder="Enter a Label" title="Label for hotkey, what it is called on the me… | Some page content is not contained by landmarks |
| 138 | .sidebar-section[data-group="system"]:nth-child(15) > .section-body > .control-group > label | <label>Settings<span class="hk-cap hk-cap-empty"></span></label> | Some page content is not contained by landmarks |
| 139 | .sidebar-section[data-group="system"]:nth-child(15) > .section-body > .control-group > .checkbox-group.control-group | <div class="control-group checkbox-group" style="margin-top: 8px;">                 <input type="checkbox" id="autoloadSettings">          … | Some page content is not contained by landmarks |
| 140 | .sidebar-section[data-group="system"]:nth-child(15) > .section-body > div:nth-child(5) > label | <label style="display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255, 255, 255, 0.5); margin-bo… | Some page content is not contained by landmarks |
| 141 | #sidebarPresetList | <div id="sidebarPresetList" class="user-presets-list"><div style="text-align:center; opacity:0.4; font-size:10px; padding:6px 0;">Use + in … | Some page content is not contained by landmarks |
| 142 | #visualResolutionDdCap | <div class="qub-dd-cap" id="visualResolutionDdCap">Image Sharpness</div> | Some page content is not contained by landmarks |
| 143 | #physicsResolutionDdCap | <div class="qub-dd-cap" id="physicsResolutionDdCap">Motion Detail</div> | Some page content is not contained by landmarks |
| 144 | .qub-size | <div class="qub-size" title="The canvas in pixels, and its shape. Pictures and videos come out at this size. Drag the canvas handles or pic… | Some page content is not contained by landmarks |
| 145 | #playtestLabel | <div id="playtestLabel" class="playtest-label">0.04 playtest</div> | Some page content is not contained by landmarks |

### `select-name` — critical — Select element must have an accessible name

Ensure select element has an accessible name ([rule](https://dequeuniversity.com/rules/axe/4.14/select-name?application=axeAPI)). Tags: cat.forms, wcag2a, wcag412, section508, section508.22.n, TTv5, TT5.c, EN-301-549, EN-9.4.1.2, ACT, RGAAv4, RGAA-11.1.1.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | #splatInMode | <select id="splatInMode" style="width: 100%; padding: 4px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 200, 100, 0.3); colo… | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |
| 2 | #splatOutMode | <select id="splatOutMode" style="width: 100%; padding: 4px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 200, 100, 0.3); col… | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |
| 3 | #mutationCount | <select id="mutationCount"><option value="4">4</option><option value="6" selected="">6</option><option value="9">9</option><option value="1… | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |
| 4 | #exportVideoFPS | <select id="exportVideoFPS" style="width: 100%; padding: 4px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); c… | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |
| 5 | #exportGifFPS | <select id="exportGifFPS" style="width: 100%; padding: 4px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); col… | Element does not have an implicit (wrapped) <label>   Element does not have an explicit <label>   aria-label attribute does not exist or is empty   aria-labell… |

## Overlays and popovers: violations not in the main run

### hotkey-overlay — F1 hotkey sheet open (DialogFocus.hold)

Opened by: trusted F1 key (js/05n-hotkeys-init.js:444-447). Open; 7 violation rules / 161 nodes in the whole document with it open.

No new violation nodes.

Main-run violation nodes absent while it was open: 2 (`landmark-one-main @ html`, `page-has-heading-one @ html`).

### radial-menu — E radial menu open over the canvas

Opened by: pointer over the canvas centre, tap E (as F0). Open; 9 violation rules / 164 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| region | moderate | #radialMenu | <div id="radialMenu" data-group="system" role="menu" aria-label="Radial menu"> | Some page content is not contained by landmarks |

### colour-picker — colour picker popover open from the top bar well

Opened by: trusted click on #colorPicker (as F0). Open; 7 violation rules / 165 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| color-contrast | serious | .cp-pop-title | <span class="cp-pop-title">Brush color</span> | Element has insufficient color contrast of 4.4 (foreground color: #7b828e, background color: #191c22, font size: 7.5pt (10px), font weight: bold). Expected con… |
| label-title-only | serious | .cp-num[title="Lightness"][inputmode="decimal"] | <input class="cp-num" type="text" inputmode="decimal" spellcheck="false" title="Lightness"> | Only title used to generate label for form element |
| label-title-only | serious | .cp-num[title="Chroma: how vivid"][inputmode="decimal"] | <input class="cp-num" type="text" inputmode="decimal" spellcheck="false" title="Chroma: how vivid"> | Only title used to generate label for form element |
| label-title-only | serious | .cp-num[title="Hue"][inputmode="decimal"] | <input class="cp-num" type="text" inputmode="decimal" spellcheck="false" title="Hue"> | Only title used to generate label for form element |

Main-run violation nodes absent while it was open: 2 (`landmark-one-main @ html`, `page-has-heading-one @ html`).

### presets-popup — Presets panel open

Opened by: trusted click on #mixerPresetsTrigger (as F0). Open; 9 violation rules / 166 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| color-contrast | serious | .preset-group-count | <span class="preset-group-count">12</span> | Element has insufficient color contrast of 2.5 (foreground color: #505660, background color: #0f141b, font size: 7.5pt (10px), font weight: normal). Expected c… |
| region | moderate | .arm-colors-header | <div class="arm-colors-header">Presets</div> | Some page content is not contained by landmarks |
| region | moderate | .preset-group-head | <div class="preset-group-head" title="Click to collapse or expand"><span class="preset-group-chev">▾</span><span class="preset-group-name">… | Some page content is not contained by landmarks |

### arm-tip-menu — arm 1 tip menu open (extra, not in the brief's list)

Opened by: trusted click on the first #sidebar-left .arm-tip-btn (as F0). Open; 10 violation rules / 167 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| aria-required-children | critical | .arm-tip-menu | <div class="brush-shape-menu arm-tip-menu" data-group="core" role="menu" style="left: 8px; top: 453.594px;"> | Element has children which are not allowed: button |
| color-contrast | serious | .stroke-lock-row.hk-row:nth-child(2) > .hk-row-text > .hk-row-sub | <div class="hk-row-sub">Circles round the center</div> | Element has insufficient color contrast of 3.67 (foreground color: #676768, background color: #020203, font size: 7.5pt (10px), font weight: normal). Expected … |
| region | moderate | .brush-shape-menu-head | <div class="brush-shape-menu-head">Arm 1 tip</div> | Some page content is not contained by landmarks |
| region | moderate | .arm-tip-sub | <div class="arm-tip-sub">Your shapes</div> | Some page content is not contained by landmarks |
| region | moderate | .arm-tip-note | <div class="arm-tip-note">None yet. Brush → Tip → ＋ makes one from an image.</div> | Some page content is not contained by landmarks |

Main-run violation nodes absent while it was open: 1 (`color-contrast @ .brush-presets-empty`).

## Incomplete (axe could not decide; needs a human), main run, grouped by rule

| Rule | Impact | Nodes | Tags | Help |
|---|---|---|---|---|
| aria-prohibited-attr | serious | 1 | wcag2a wcag412 | Elements must only use permitted ARIA attributes |
| aria-valid-attr-value | critical | 2 | wcag2a wcag412 | ARIA attributes must conform to valid values |
| bypass | serious | 1 | wcag2a wcag241 | Page must have means to bypass repeated blocks |
| color-contrast | serious | 29 | wcag2aa wcag143 | Elements must meet minimum color contrast ratio thresholds |
| label-content-name-mismatch | serious | 1 | wcag21a wcag253 | Elements must have their visible text as part of their accessible name |

### `aria-prohibited-attr` (incomplete) — Elements must only use permitted ARIA attributes

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | #sidebar-left | <div id="sidebar-left" aria-label="Brush" style=""> | aria-prohibited-attr: aria-label attribute is not well supported on "div" elements with no valid role attribute. |

### `aria-valid-attr-value` (incomplete) — ARIA attributes must conform to valid values

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | button[aria-controls="visualResolutionDdList"] | <button type="button" class="qub-dd-btn" title="Image Sharpness — Resolution of the paint itself - costs GPU" aria-hasp… | aria-valid-attr-value: Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="visualResolutionDdList" |
| 2 | button[aria-controls="physicsResolutionDdList"] | <button type="button" class="qub-dd-btn" title="Motion Detail — Resolution of the motion sim, higher creates finer swir… | aria-valid-attr-value: Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="physicsResolutionDdList" |

### `bypass` (incomplete) — Page must have means to bypass repeated blocks

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | html | <html lang="en" class="js" style="--app-height: 805px; --ui-scale: 1;"> | internal-link-present: No valid skip link found; header-present: Page does not have a heading; landmark: Page does not have a landmark region |

### `color-contrast` (incomplete) — Elements must meet minimum color contrast ratio thresholds

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | #materialMode | <select id="materialMode" class="material-mode-select" title="Material - Changes settings to give a few different feels… | color-contrast: Element's background color could not be determined due to a background image |
| 2 | #curlValue | <span id="curlValue" class="value-display ch-value">0</span> | color-contrast: Element content is too short to determine if it is actual text content |
| 3 | div[data-accent="purple"] > .ch-header > .ch-label | <div class="ch-label" title="Controls how thick the paint feels. 0 feels more like dye in water, 1 more like acrylic pa… | color-contrast: Element's background color could not be determined due to a background gradient |
| 4 | #viscosityValue | <span id="viscosityValue" class="value-display ch-value">0.30</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 5 | div[data-accent="green"] > .ch-header > .ch-label | <div class="ch-label" title="Isolate the motion transfer of your strokes on existing paint.">Isolation</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 6 | #velocityInfluenceValue | <span id="velocityInfluenceValue" class="value-display ch-value">2.000</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 7 | div[data-ui-key="Color Blend"] > .ch-header > .ch-label | <div class="ch-label" title="Laminar prevents colors from mixing. Blend causes colors to blend where they meet (affecte… | color-contrast: Element's background color could not be determined due to a background gradient |
| 8 | #colorBlendValue | <span id="colorBlendValue" class="value-display ch-value">0.00</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 9 | div[data-ui-key="Time"] > .ch-header > .ch-label | <div class="ch-label" title="Simulation time value: left is slower 1 is real time, right is faster">Time</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 10 | #timeScaleValue | <span id="timeScaleValue" class="value-display ch-value">1.00x</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 11 | div[data-ui-key="Density"] > .ch-header > .ch-label | <div class="ch-label" title="Color density, at 1.000 it never fades (and you can try above 1...)">Density</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 12 | #densityValue | <span id="densityValue" class="value-display ch-value">0.9900</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 13 | div[data-ui-key="Velocity"] > .ch-header > .ch-label | <div class="ch-label" title="How much velocity to preserve. Can go above 1...">Velocity</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 14 | #velocityValue | <span id="velocityValue" class="value-display ch-value">1.0009</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 15 | .sidebar-section[data-group="core"]:nth-child(1) > .section-header > .section-title[role="button"] | <span class="section-title" tabindex="0" role="button" aria-expanded="true">Brush</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 16 | .sidebar-section[data-group="core"]:nth-child(1) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | color-contrast: Element content contains only non-text characters |
| 17 | .brush-fold-chev | <span class="brush-fold-chev" aria-hidden="true">▾</span> | color-contrast: Element content contains only non-text characters |
| 18 | .active[data-tip="0"][title="Soft Dab"] | <button type="button" class="brush-tip-btn active" data-tip="0" title="Soft Dab">◌</button> | color-contrast: Element content contains only non-text characters |
| 19 | #brushTipFoldBody > .brush-tip-row > .brush-tip-btn[data-tip="2"][title="Square brush"] | <button type="button" class="brush-tip-btn" data-tip="2" title="Square brush">■</button> | color-contrast: Element content contains only non-text characters |
| 20 | #brushTipFoldBody > .brush-tip-row > .brush-tip-btn[data-tip="3"][title="Rectangle Brush"] | <button type="button" class="brush-tip-btn" data-tip="3" title="Rectangle Brush">▬</button> | color-contrast: Element content contains only non-text characters |
| 21 | #brushTipFoldBody > .brush-tip-row > .brush-tip-btn[data-tip="4"][title="Ring brush"] | <button type="button" class="brush-tip-btn" data-tip="4" title="Ring brush">◯</button> | color-contrast: Element content contains only non-text characters |
| 22 | .lsb-toggle | <button type="button" class="lsb-toggle btn--icon" title="Collapse the brush menu" aria-label="Left-facing sideways arr… | color-contrast: Element content is too short to determine if it is actual text content |
| 23 | #sidebar-right > .sidebar-section[data-group="core"]:nth-child(2) > .section-header > .section-title[role="button"] | <span class="section-title" tabindex="0" role="button" aria-expanded="true">Swirl Together</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 24 | #sidebar-right > .sidebar-section[data-group="core"]:nth-child(2) > .section-header > .section-chevron | <span class="section-chevron">▾</span> | color-contrast: Element content contains only non-text characters |
| 25 | .sidebar-section[data-group="core"]:nth-child(3) > .section-header > .section-title[role="button"] | <span class="section-title" tabindex="0" role="button" aria-expanded="true">Simulation</span> | color-contrast: Element's background color could not be determined due to a background gradient |

… 4 more nodes in `axe.json`.

### `label-content-name-mismatch` (incomplete) — Elements must have their visible text as part of their accessible name

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | .lsb-toggle | <button type="button" class="lsb-toggle btn--icon" title="Collapse the brush menu" aria-label="Left-facing sideways arr… | label-content-name-mismatch: Unable to determine if the visible text is part of the accessible name |


## Rules that passed (main run)

`aria-allowed-attr`, `aria-allowed-role`, `aria-command-name`, `aria-conditional-attr`, `aria-deprecated-role`, `aria-hidden-body`, `aria-hidden-focus`, `aria-input-field-name`, `aria-prohibited-attr`, `aria-required-attr`, `aria-roles`, `aria-valid-attr-value`, `aria-valid-attr`, `autocomplete-valid`, `avoid-inline-spacing`, `button-name`, `color-contrast`, `document-title`, `duplicate-id-aria`, `form-field-multiple-labels`, `html-has-lang`, `html-lang-valid`, `image-alt`, `image-redundant-alt`, `label-title-only`, `label`, `landmark-unique`, `link-name`, `meta-viewport-large`, `nested-interactive`, `presentation-role-conflict`, `region`, `role-img-alt`, `scrollable-region-focusable`, `select-name`, `tabindex`

## Rules inapplicable to this page (main run)

`accesskeys`, `area-alt`, `aria-braille-equivalent`, `aria-dialog-name`, `aria-meter-name`, `aria-progressbar-name`, `aria-required-children`, `aria-required-parent`, `aria-tab-name`, `aria-text`, `aria-toggle-field-name`, `aria-tooltip-name`, `aria-treeitem-name`, `blink`, `definition-list`, `dlitem`, `empty-heading`, `empty-table-header`, `frame-focusable-content`, `frame-tested`, `frame-title-unique`, `frame-title`, `heading-order`, `html-xml-lang-mismatch`, `input-button-name`, `input-image-alt`, `landmark-banner-is-top-level`, `landmark-contentinfo-is-top-level`, `landmark-main-is-top-level`, `landmark-no-duplicate-banner`, `landmark-no-duplicate-contentinfo`, `landmark-no-duplicate-main`, `link-in-text-block`, `list`, `listitem`, `marquee`, `meta-refresh`, `object-alt`, `scope-attr-valid`, `server-side-image-map`, `skip-link`, `summary-name`, `svg-img-alt`, `table-duplicate-name`, `td-headers-attr`, `th-has-data-cells`, `valid-lang`, `video-caption`, `no-autoplay-audio`
