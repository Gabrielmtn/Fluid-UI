# axe-core report — the shipping UI, every surface

Generated 2026-10-17T18:21:20.155Z by `prep/baseline/scripts/a11y.js` (F3). Machine copy: `axe.json`. Engine: axe-core 4.14.0 (`prep/baseline/vendor/axe.min.js`, MPL-2.0), default rule set (no `runOnly`: WCAG 2.0/2.1/2.2 A and AA rules plus axe best-practice rules; every rule's tags are listed so the two can be told apart), `resultTypes: [violations, incomplete]`, run over `document` with the left bar open and all 17 sidebar sections expanded, then once more with each overlay / popover open. Notes and caveats: `NOTES.md`.

## Environment

| Fact | Value |
|---|---|
| date | 2026-10-17T18:21:20.155Z |
| headCommit | 4789bb14ef0dcb9f6b1ea4fe16406c4ac3750da7 |
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
| url | http://127.0.0.1:57436/index.html |
| bodyClasses | web-mode photosafe-on |
| leftFolded | false |
| rightFolded | false |
| hiddenUiKeys | [] |
| axeVersion | 4.14.0 |

## Runs

| Run | State | Opened | Closed | Violations (rules / nodes) | Incomplete (rules / nodes) | Rules passed | Inapplicable | Violation nodes vs main | axe time |
|---|---|---|---|---|---|---|---|---|---|
| everything-open | left bar open, all 17 sections expanded, no overlay | n/a | n/a | 8 / 39 | 4 / 88 | 36 | 49 | — | 498 ms |
| hotkey-overlay | F1 hotkey sheet open (DialogFocus.hold) | yes | yes | 6 / 37 | 3 / 167 | 44 | 44 | 0 new / 2 gone | 389 ms |
| radial-menu | E radial menu open over the canvas | yes | yes | 8 / 40 | 4 / 107 | 38 | 47 | 1 new / 0 gone | 371 ms |
| colour-picker | colour picker popover open from the top bar well | yes | yes | 6 / 40 | 4 / 93 | 39 | 48 | 3 new / 2 gone | 362 ms |
| presets-popup | Presets panel open | yes | yes | 8 / 41 | 4 / 107 | 36 | 49 | 2 new / 0 gone | 349 ms |
| arm-tip-menu | arm 1 tip menu open (extra, not in the brief's list) | yes | yes | 9 / 43 | 4 / 101 | 36 | 48 | 4 new / 0 gone | 328 ms |

"Violation nodes vs main": violation (rule + target) pairs present with the overlay open that the main run did not have, and main-run pairs that disappeared while it was open (an overlay's scrim hiding the page, for instance). Full node lists for every run are in `axe.json`.

## Violations with everything open (main run), grouped by rule

| Rule | Impact | Nodes | Tags | Help |
|---|---|---|---|---|
| label-content-name-mismatch | serious | 2 | wcag21a wcag253 | Elements must have their visible text as part of their accessible name |
| label-title-only | serious | 3 | best-practice | Form elements should have a visible label |
| label | critical | 4 | wcag2a wcag412 | Form elements must have labels |
| landmark-one-main | moderate | 1 | best-practice | Document should have one main landmark |
| meta-viewport | moderate | 1 | wcag2aa wcag144 | Zooming and scaling must not be disabled |
| page-has-heading-one | moderate | 1 | best-practice | Page should contain a level-one heading |
| region | moderate | 22 | best-practice | All page content should be contained by landmarks |
| select-name | critical | 5 | wcag2a wcag412 | Select element must have an accessible name |

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
| 1 | #materialMode | <select id="materialMode" class="material-mode-select" title="Material - Changes settings to give a few different feels" style="width: 149p… | Only title used to generate label for form element |
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
| 1 | html | <html lang="en" class="js" data-theme="walnut-copper" style="--app-height: 805px; --ui-scale: 1;"> | Document does not have a main landmark |

### `meta-viewport` — moderate — Zooming and scaling must not be disabled

Ensure <meta name="viewport"> does not disable text scaling and zooming ([rule](https://dequeuniversity.com/rules/axe/4.14/meta-viewport?application=axeAPI)). Tags: cat.sensory-and-visual-cues, wcag2aa, wcag144, EN-301-549, EN-9.1.4.4, ACT, RGAAv4, RGAA-10.4.2.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | meta[name="viewport"] | <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"> | user-scalable=no on <meta> tag disables zooming on mobile devices |

### `page-has-heading-one` — moderate — Page should contain a level-one heading

Ensure that the page, or at least one of its frames contains a level-one heading ([rule](https://dequeuniversity.com/rules/axe/4.14/page-has-heading-one?application=axeAPI)). Tags: cat.semantics, best-practice.

| # | Target | HTML | Failure summary |
|---|---|---|---|
| 1 | html | <html lang="en" class="js" data-theme="walnut-copper" style="--app-height: 805px; --ui-scale: 1;"> | Page must have a level-one heading |

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
| 17 | #canvas-size-display | <div id="canvas-size-display">928 × 581 · 1.60:1</div> | Some page content is not contained by landmarks |
| 18 | #canvas | <canvas id="canvas" width="928" height="579" style="width: 928px; height: 579px; z-index: 1000;"></canvas> | Some page content is not contained by landmarks |
| 19 | #visualResolutionDdCap | <div class="qub-dd-cap" id="visualResolutionDdCap">Image Sharpness</div> | Some page content is not contained by landmarks |
| 20 | #physicsResolutionDdCap | <div class="qub-dd-cap" id="physicsResolutionDdCap">Motion Detail</div> | Some page content is not contained by landmarks |
| 21 | .qub-size | <div class="qub-size" title="The canvas in pixels, and its shape. Pictures and videos come out at this size. Drag the canvas handles or pic… | Some page content is not contained by landmarks |
| 22 | #playtestLabel | <div id="playtestLabel" class="playtest-label">0.04 playtest</div> | Some page content is not contained by landmarks |

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

Opened by: trusted F1 key (js/05n-hotkeys-init.js:444-447). Open; 6 violation rules / 37 nodes in the whole document with it open.

No new violation nodes.

Main-run violation nodes absent while it was open: 2 (`landmark-one-main @ html`, `page-has-heading-one @ html`).

### radial-menu — E radial menu open over the canvas

Opened by: pointer over the canvas centre, tap E (as F0). Open; 8 violation rules / 40 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| region | moderate | #radialMenu | <div id="radialMenu" data-group="system" role="menu" aria-label="Radial menu"> | Some page content is not contained by landmarks |

### colour-picker — colour picker popover open from the top bar well

Opened by: trusted click on #colorPicker (as F0). Open; 6 violation rules / 40 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| label-title-only | serious | .cp-num[title="Lightness"][inputmode="decimal"] | <input class="cp-num" type="text" inputmode="decimal" spellcheck="false" title="Lightness"> | Only title used to generate label for form element |
| label-title-only | serious | .cp-num[title="Chroma: how vivid"][inputmode="decimal"] | <input class="cp-num" type="text" inputmode="decimal" spellcheck="false" title="Chroma: how vivid"> | Only title used to generate label for form element |
| label-title-only | serious | .cp-num[title="Hue"][inputmode="decimal"] | <input class="cp-num" type="text" inputmode="decimal" spellcheck="false" title="Hue"> | Only title used to generate label for form element |

Main-run violation nodes absent while it was open: 2 (`landmark-one-main @ html`, `page-has-heading-one @ html`).

### presets-popup — Presets panel open

Opened by: trusted click on #mixerPresetsTrigger (as F0). Open; 8 violation rules / 41 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| region | moderate | .arm-colors-header | <div class="arm-colors-header">Presets</div> | Some page content is not contained by landmarks |
| region | moderate | .preset-group-head | <div class="preset-group-head" title="Click to collapse or expand"><span class="preset-group-chev">▾</span><span class="preset-group-name">… | Some page content is not contained by landmarks |

### arm-tip-menu — arm 1 tip menu open (extra, not in the brief's list)

Opened by: trusted click on the first #sidebar-left .arm-tip-btn (as F0). Open; 9 violation rules / 43 nodes in the whole document with it open.

| Rule | Impact | Target | HTML | Failure summary |
|---|---|---|---|---|
| aria-required-children | critical | .arm-tip-menu | <div class="brush-shape-menu arm-tip-menu" data-group="core" role="menu" style="left: 43px; top: 488px;"> | Element has children which are not allowed: button |
| region | moderate | .brush-shape-menu-head | <div class="brush-shape-menu-head">Arm 1 tip</div> | Some page content is not contained by landmarks |
| region | moderate | .arm-tip-sub | <div class="arm-tip-sub">Your shapes</div> | Some page content is not contained by landmarks |
| region | moderate | .arm-tip-note | <div class="arm-tip-note">None yet. Brush → Tip → ＋ makes one from an image.</div> | Some page content is not contained by landmarks |

## Incomplete (axe could not decide; needs a human), main run, grouped by rule

| Rule | Impact | Nodes | Tags | Help |
|---|---|---|---|---|
| aria-valid-attr-value | critical | 2 | wcag2a wcag412 | ARIA attributes must conform to valid values |
| bypass | serious | 1 | wcag2a wcag241 | Page must have means to bypass repeated blocks |
| color-contrast | serious | 84 | wcag2aa wcag143 | Elements must meet minimum color contrast ratio thresholds |
| label-content-name-mismatch | serious | 1 | wcag21a wcag253 | Elements must have their visible text as part of their accessible name |

### `aria-valid-attr-value` (incomplete) — ARIA attributes must conform to valid values

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | button[aria-controls="visualResolutionDdList"] | <button type="button" class="qub-dd-btn" title="Image Sharpness — Resolution of the paint itself - costs GPU" aria-hasp… | aria-valid-attr-value: Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="visualResolutionDdList" |
| 2 | button[aria-controls="physicsResolutionDdList"] | <button type="button" class="qub-dd-btn" title="Motion Detail — Resolution of the motion sim, higher creates finer swir… | aria-valid-attr-value: Unable to determine if aria-controls referenced ID exists on the page while using aria-haspopup: aria-controls="physicsResolutionDdList" |

### `bypass` (incomplete) — Page must have means to bypass repeated blocks

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | html | <html lang="en" class="js" data-theme="walnut-copper" style="--app-height: 805px; --ui-scale: 1;"> | internal-link-present: No valid skip link found; header-present: Page does not have a heading; landmark: Page does not have a landmark region |

### `color-contrast` (incomplete) — Elements must meet minimum color contrast ratio thresholds

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | #materialMode | <select id="materialMode" class="material-mode-select" title="Material - Changes settings to give a few different feels… | color-contrast: Element's background color could not be determined due to a background gradient |
| 2 | #curlValue | <span id="curlValue" class="value-display ch-value">0</span> | color-contrast: Element content is too short to determine if it is actual text content |
| 3 | div[data-accent="purple"] > .ch-header > .ch-label | <div class="ch-label" title="Controls how thick the paint feels. 0 feels more like dye in water, 1 more like acrylic pa… | color-contrast: Element's background color could not be determined due to a background gradient |
| 4 | #viscosityValue | <span id="viscosityValue" class="value-display ch-value">0.30</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 5 | div[data-accent="green"] > .ch-header > .ch-label | <div class="ch-label" title="Isolate the motion transfer of your strokes on existing paint.">Isolation</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 6 | #velocityInfluenceValue | <span id="velocityInfluenceValue" class="value-display ch-value">2.000</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 7 | div[data-ui-key="Color Blend"] > .ch-header > .ch-label | <div class="ch-label" title="Laminar prevents colors from mixing. Blend causes colors to blend where they meet (affecte… | color-contrast: Element's background color could not be determined due to a background gradient |
| 8 | textpath[href$="#wct-laminar-arc0"] | <textPath href="#wct-laminar-arc0" startOffset="50%" text-anchor="middle">LAMINAR</textPath> | color-contrast: Element's background color could not be determined because it is overlapped by another element |
| 9 | textpath[href$="#wct-laminar-arc1"] | <textPath href="#wct-laminar-arc1" startOffset="50%" text-anchor="middle">BLEND</textPath> | color-contrast: Element's background color could not be determined because it is overlapped by another element |
| 10 | .nxg[x="-14.5"][y="49.4"] | <text class="nxg" x="-14.5" y="49.4" text-anchor="middle">8</text> | color-contrast: Element content is too short to determine if it is actual text content |
| 11 | text[data-n="0"] | <text class="nxd" data-n="0" x="-14.5" y="49.4" text-anchor="middle">0</text> | color-contrast: Element content is too short to determine if it is actual text content |
| 12 | .nxg[x="1.5"][y="49.4"] | <text class="nxg" x="1.5" y="49.4" text-anchor="middle">8</text> | color-contrast: Element content is too short to determine if it is actual text content |
| 13 | text[data-n="1"] | <text class="nxd" data-n="1" x="1.5" y="49.4" text-anchor="middle">0</text> | color-contrast: Element content is too short to determine if it is actual text content |
| 14 | .nxg[x="13.5"][y="49.4"] | <text class="nxg" x="13.5" y="49.4" text-anchor="middle">8</text> | color-contrast: Element content is too short to determine if it is actual text content |
| 15 | text[data-n="2"] | <text class="nxd" data-n="2" x="13.5" y="49.4" text-anchor="middle">0</text> | color-contrast: Element content is too short to determine if it is actual text content |
| 16 | div[data-ui-key="Time"] > .ch-header > .ch-label | <div class="ch-label" title="Simulation time value: left is slower 1 is real time, right is faster">Time</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 17 | .tval | <text class="tval" text-anchor="middle" y="26">1.00×</text> | color-contrast: Element's background color could not be determined because element contains an image node |
| 18 | .flagt | <text class="flagt" text-anchor="middle" y="42.6" style="font-size: 10.5px;">HALF</text> | color-contrast: Element's background color could not be determined because it is overlapped by another element |
| 19 | div[data-ui-key="Density"] > .ch-header > .ch-label | <div class="ch-label" title="Color density, at 1.000 it never fades (and you can try above 1...)">Density</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 20 | #densityValue | <span id="densityValue" class="value-display ch-value">0.9900</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 21 | div[data-ui-key="Velocity"] > .ch-header > .ch-label | <div class="ch-label" title="How much velocity to preserve. Can go above 1...">Velocity</div> | color-contrast: Element's background color could not be determined due to a background gradient |
| 22 | #velocityValue | <span id="velocityValue" class="value-display ch-value">1.0009</span> | color-contrast: Element's background color could not be determined due to a background gradient |
| 23 | button[data-brush-mode="one"] | <button type="button" class="ch-text-toggle" data-brush-mode="one" aria-pressed="false" title="Select a single color ">… | color-contrast: Element's background color could not be determined due to a background gradient |
| 24 | button[data-brush-mode="rnd"] | <button type="button" class="ch-text-toggle active" data-brush-mode="rnd" aria-pressed="true" title="a new color each p… | color-contrast: Element's background color could not be determined due to a background gradient |
| 25 | button[data-brush-mode="step"] | <button type="button" class="ch-text-toggle" data-brush-mode="step" aria-pressed="false" title="Toggles palette mode, s… | color-contrast: Element's background color could not be determined due to a background gradient |

… 59 more nodes in `axe.json`.

### `label-content-name-mismatch` (incomplete) — Elements must have their visible text as part of their accessible name

| # | Target | HTML | Check messages |
|---|---|---|---|
| 1 | .lsb-toggle | <button type="button" class="lsb-toggle btn--icon" title="Collapse the brush menu" aria-label="Left-facing sideways arr… | label-content-name-mismatch: Unable to determine if the visible text is part of the accessible name |


## Rules that passed (main run)

`aria-allowed-attr`, `aria-allowed-role`, `aria-command-name`, `aria-conditional-attr`, `aria-deprecated-role`, `aria-hidden-body`, `aria-hidden-focus`, `aria-input-field-name`, `aria-prohibited-attr`, `aria-required-attr`, `aria-roles`, `aria-valid-attr-value`, `aria-valid-attr`, `autocomplete-valid`, `avoid-inline-spacing`, `button-name`, `color-contrast`, `document-title`, `duplicate-id-aria`, `form-field-multiple-labels`, `html-has-lang`, `html-lang-valid`, `image-alt`, `image-redundant-alt`, `label-title-only`, `label`, `landmark-unique`, `link-name`, `meta-viewport-large`, `nested-interactive`, `presentation-role-conflict`, `region`, `role-img-alt`, `scrollable-region-focusable`, `select-name`, `tabindex`

## Rules inapplicable to this page (main run)

`accesskeys`, `area-alt`, `aria-braille-equivalent`, `aria-dialog-name`, `aria-meter-name`, `aria-progressbar-name`, `aria-required-children`, `aria-required-parent`, `aria-tab-name`, `aria-text`, `aria-toggle-field-name`, `aria-tooltip-name`, `aria-treeitem-name`, `blink`, `definition-list`, `dlitem`, `empty-heading`, `empty-table-header`, `frame-focusable-content`, `frame-tested`, `frame-title-unique`, `frame-title`, `heading-order`, `html-xml-lang-mismatch`, `input-button-name`, `input-image-alt`, `landmark-banner-is-top-level`, `landmark-contentinfo-is-top-level`, `landmark-main-is-top-level`, `landmark-no-duplicate-banner`, `landmark-no-duplicate-contentinfo`, `landmark-no-duplicate-main`, `link-in-text-block`, `list`, `listitem`, `marquee`, `meta-refresh`, `object-alt`, `scope-attr-valid`, `server-side-image-map`, `skip-link`, `summary-name`, `svg-img-alt`, `table-duplicate-name`, `td-headers-attr`, `th-has-data-cells`, `valid-lang`, `video-caption`, `no-autoplay-audio`
