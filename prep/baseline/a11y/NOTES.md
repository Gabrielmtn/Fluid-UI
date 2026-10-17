# Accessibility baseline (F3) — notes

axe-core over every surface of the shipping UI, plus the hand-written list of every control's role, name, state and keyboard pattern, captured before any CSS moves. Written by `prep/baseline/scripts/a11y.js`; the list is derived from F0's `prep/baseline/dom/controls.json`. Captured 2026-10-17 at HEAD `c4796da` with Chrome 155.0.8059.80 (headless), viewport 1584×805 CSS px, DPR 1, `--ui-scale` 1, axe-core 4.14.0.

## Files

| File | What |
|---|---|
| `axe.json` | Six axe runs (`runs[]`: everything open, then the F1 hotkey sheet, the E radial menu, the colour picker popover, the Presets panel and the arm-tip menu each open), every violation and incomplete node (target selectors, HTML cut to 240 chars, failure summary, check messages), the ids of passed and inapplicable rules, `deltaVsMain` per overlay run, `env`, `problems` |
| `axe.md` | Human copy: runs table, main-run violations grouped by rule with selectors, each overlay's new violation nodes, incomplete nodes grouped by rule, passed and inapplicable rules |
| `controls-a11y.json` | The list `--check` diffs: `controls[]` (845 rows: selector, role, name, state, keyboard pattern id) and `lazy{}` (radial-menu 10, colour-picker 18, presets-popup 18, arm-tip-menu 7), `keyboardPatterns` (the legend), `crossCheck` (live boot vs F0), `env` |
| `controls-a11y.md` | Human copy: counts, per-role and per-pattern tallies, the keyboard legend (38 patterns used of 46 defined, each with the handler's file:line), all 845 controls as one table, the four lazy UIs |
| `NOTES.md` | This file |
| `../vendor/axe.min.js`, `../vendor/LICENSE` | axe-core 4.14.0 (MPL-2.0), extracted from `npm pack axe-core@4.14.0`; the tarball was deleted, `package.json` untouched |

## How to run

```bash
node prep/baseline/scripts/a11y.js            # capture -> prep/baseline/a11y/ (about 20 s)
node prep/baseline/scripts/a11y.js --check    # re-capture into prep/work/a11y-check/ and diff; exit 1 on any
                                              # NEW axe violation (rule + target) in any run, or any change of a
                                              # control's role, name, state or keyboard pattern
```

Needs `prep/baseline/dom/controls.json` (F0) for the capture; `--check` recomputes everything from its own boot. No dev server, no Electron, no `npm install`: one headless Chrome through `scripts/test/radial-menu/driver.js` (`boot()`: own static server on the repo root, scratch profile in the OS temp dir with PhotoSafe, the startup fork, the first-run hint and the Reset-app note already answered, trusted input over CDP), closed in a `finally`. It never attaches to port 9333. `CHROME=` overrides the browser.

## What it does, in order

1. `boot({ seed: { 'swirlResetHint.v1': '1' } })`, waits for `document.getAnimations().length === 0` plus 300 ms, records the environment (`Browser.getVersion`, viewport, DPR, `--ui-scale`, fold state, hidden `data-ui-key` cells, HEAD).
2. Opens everything the way F0 does: left bar unfolded if needed (not at 1600 px), then a trusted **Shift-click** on every collapsed `.section-title` so the accordion keeps them all open (17/17 opened by the trusted click; the synthetic fallback was not needed), both bars scrolled back to the top instantly (`scroll-behavior: auto` around the reset, css/21-sidebar.css:43 is smooth).
3. Enumerates the F0 selector (`button, input, select, textarea, a[href], [role], [tabindex], [contenteditable], summary, label, .section-title, .mixer-channel, .sidebar-section`) and joins it to `Accessibility.getFullAXTree` through `DOM.getDocument` + `DOM.querySelectorAll` → `backendDOMNodeId`, the same method as F0; a node the tree ignores or does not build gets the page-side role / name. Each element also gets a **stable selector**: `#id` when unique, else `tag.class` when that class is unique in the document (body-mounted popups: `div.cp-pop`, `button.cp-pop-close`), else a `tag.firstStableClass:nth-of-type` path up to the nearest unique anchor, with state classes (`active`, `collapsed`, `open`, `latched`, `is-*`, …) skipped.
4. Injects `prep/baseline/vendor/axe.min.js` and runs `axe.run(document, { resultTypes: ['violations', 'incomplete'], elementRef: false })` with the **default rule set** (no `runOnly`: WCAG 2.0/2.1/2.2 A + AA rules and axe's best-practice rules; every rule's tags are kept so the two can be told apart). Results are slimmed page-side (no element refs, HTML cut to 240 chars).
5. For each overlay / popover: opens it with trusted input, dumps its controls scoped to its root, runs axe over the **whole document** with it open, computes the violation (rule + target) pairs that are new against the main run and the main-run pairs that disappeared, closes it with Escape and verifies. Hotkey sheet: trusted F1 (js/05n-hotkeys-init.js:444-447); radial menu: pointer over the canvas centre + E; colour picker: click `#colorPicker`; Presets: click `#mixerPresetsTrigger`; arm-tip menu (extra, not in the brief's list): click the first `.arm-tip-btn`. All five opened and closed in this run.
6. Derives `controls-a11y` from F0's `controls.json` + `lazy-*.json` (role, name, `aria-*`, native checked / disabled / tabindex), cross-checks every row against the live computation (898 compared, **0 differences**), attaches the live selector and the keyboard pattern id from the hand-written table (`KEYS` in the script; keyed on tag / type / `role=` / class), and writes the four files.

Nothing here calls an app setter that persists (GUIDANCE.md §2b): the only state changes are trusted clicks and keys inside the scratch profile.

## What a row of the list holds

`order` (F0 document-order index), `surface`, `section`, `selector`, `tag`, `type`, `id`, `classes`, `role` (AX tree role or implicit), `roleAttr`, `name`, `nameSource` (`cdp` / `fallback:ignored` / `fallback:no-ax-node`), `state` (`aria-pressed/checked/expanded/disabled/selected/current/hidden/haspopup/modal/live/…` when present, native `checked`, `disabled`, `readOnly`, `hidden`, the `tabindex` attribute, and `focusable` = computed `tabIndex >= 0` and not disabled), `keyboard` (pattern id, legend in `controls-a11y.md`), `visibleNow`. Values (`aria-valuenow`, slider values, select text) are **not** in the row, so the FPS Limit refresh-rate drift F0 found cannot reach this gate.

## What it found (headline numbers; the tables are in axe.md and controls-a11y.md)

**axe, everything open:** 9 violation rules / 163 nodes; 5 incomplete rules / 34 nodes; 36 rules passed; 49 inapplicable.

| Rule | Impact | Nodes | Tags | What |
|---|---|---|---|---|
| `region` | moderate | 145 | best-practice | The page has no landmarks at all (`<main>`, `<nav>`, `role=region` …), so every bit of content is "outside a landmark". One finding, 145 nodes. |
| `select-name` | critical | 5 | wcag2a 4.1.2 | `#splatInMode`, `#splatOutMode` (Stroke and replay), `#mutationCount` (Mutate), `#exportVideoFPS`, `#exportGifFPS` (Export): no label, aria-label or title |
| `label` | critical | 4 | wcag2a 4.1.2 | `.layer-title` text input and `.layer-vis-check` checkbox in the Layers list (js/05k-layers-render.js:57), `#exportVideoDuration`, `#exportGifDuration` |
| `label-title-only` | serious | 3 | best-practice | `#materialMode`, `#colorPicker`, `#mutationStrength` are named by `title` alone |
| `label-content-name-mismatch` | serious | 2 | wcag21a 2.5.3 | The quality bar's `button.qub-dd-btn` for Image Sharpness and Motion Detail: `aria-labelledby` = caption + value ids, but axe reads the button's visible text as not part of that name (the Shading Detail button passes) |
| `color-contrast` | serious | 1 | wcag2aa 1.4.3 | `.brush-presets-empty` "None saved yet": 3.67:1 (#676768 on #020203, 10 px) |
| `landmark-one-main` | moderate | best-practice | 1 | no `<main>` |
| `page-has-heading-one` | moderate | best-practice | 1 | no `<h1>` in the page (the PhotoSafe dialog's `h1#pwTitle` is hidden) |
| `meta-viewport` | moderate | wcag2aa 1.4.4 | 1 | `user-scalable=no, maximum-scale=1` |

WCAG-tagged violations: 13 nodes across 5 rules; the other 150 nodes are best-practice (`region` 145, `label-title-only` 3, two page-level rules).

**axe with an overlay open (new violation nodes against the main run):** hotkey sheet 0 (two page-level findings go away while it is up); radial menu 1 (`region @ #radialMenu`); colour picker 4 (`color-contrast @ .cp-pop-title`, `label-title-only` on the three `.cp-num` fields, which have only a `title`); Presets 3 (`color-contrast @ .preset-group-count`, `region` on `.arm-colors-header` and `.preset-group-head`); arm-tip menu 5 (`aria-required-children @ .arm-tip-menu` — a `role=menu` whose children are plain buttons, not menuitems; `region` on its head, sub-label and note; and a `color-contrast` on `.stroke-lock-row.hk-row:nth-child(2) … .hk-row-sub` in the Stroke section, which the menu overlaps while open).

**axe incomplete (needs a human), main run:** `color-contrast` 29 (gradient / image backgrounds and one-character readouts in the strip, which axe cannot measure), `aria-valid-attr-value` 2 (the two `qub-dd-btn` `aria-controls` targets, undetermined while `aria-haspopup` is set), `aria-prohibited-attr` 1 (`#sidebar-left` carries `aria-label="Brush"` with no role), `bypass` 1 (axe sees no skip link: the skip menu is a set of buttons, js/66-skip-menu.js, not an in-page link), `label-content-name-mismatch` 1 (`.lsb-toggle`, icon label vs visible glyph).

**Controls list:** 845 controls + 53 in the lazily built UIs; role / name from the AX tree for 316, page-side fallback for 529 (478 of them not rendered even with every section open: conditional sub-blocks, hidden overlays, the 41 orphaned `.controls` inputs); 540 focusable; 64 with an explicit `role=`; aria-pressed 19, aria-checked 9, aria-expanded 33, aria-haspopup 9, aria-hidden 7, native checked 99, native disabled 9, aria-disabled 0 at boot. Keyboard patterns in use: 38 (K00–K56 legend in `controls-a11y.md`); the custom ones with their handlers: section titles (17, js/20:9331), palette chips roving tabindex (5, js/01:949), palette combobox (js/01:456), paint-type radios with arrows (3, js/20:5738), arm colour radios **without** arrows (4, js/20:9005), effect preview thumbs role=img + Enter/Space (9, js/20:4449), dither pad (js/68:324), quality-bar listboxes (3, js/20:2883), Ignite latch (js/20:1491), skip menu (4, js/66:252), PhotoSafe's own trap (index.html:486), DialogFocus hold / popup / menu (js/00b:60, 190, 233), colour picker tracks (js/64:307), radial menu pointer-only (js/58:809).

**Focusable controls with an empty accessible name: 36** (listed under Open questions). axe only reports the 10 that are rendered with everything open (the `select-name`, `label` and `label-title-only` rows above); the other 26 sit in hidden sub-blocks or are `display:none` file inputs, which axe skips and only the list sees.

## Nondeterminism found and how it was pinned

| What could move | Cause | Pin |
|---|---|---|
| Nothing moved in four runs (capture ×2, `--check` ×2, plus the mutation test): same 163 / 161 / 164 / 165 / 166 / 167 violation nodes per run, same 34 incomplete nodes, 898 controls identical | — | — |
| `#fpsCap` options and value follow the measured refresh rate (F0's finding) | js/05i-sim-stats.js:1231-1309 | Not in this gate's fields: the row holds role / name / state, never values or option text; the `<select>`'s name is its label |
| The one-time Reset-app note (`#resetAppHint`, role=note) | js/60-reset-app.js:363, ~4 s after a quiet boot | Seeded `swirlResetHint.v1 = '1'` as F0 does |
| Body-mounted popup roots (`.cp-pop`, `.arm-tip-menu`, the palette list) would have given `body > div:nth-of-type(N)` selectors that count body's children | roots stay in the DOM after a close (`#radialMenu`, `.mixer-presets-panel`) | Selectors anchor on a unique `#id` or a unique non-state class before counting siblings |
| A `color-contrast` violation on `.hk-row-sub` (Stroke section) appears only while the arm-tip menu is open | the menu overlaps that row at this viewport, so axe computes a different background | Recorded as part of that run's baseline; it is positional, so a layout change in the Stroke section or the menu would move it (then re-capture and say so) |
| The incomplete set is not gated | `color-contrast` incomplete depends on gradients and backgrounds the reskin will change by design | `--check` prints incomplete-node count changes as `info` and does not fail on them |

## Observed `--check` result

`node prep/baseline/scripts/a11y.js --check` → `CHECK PASS: no new axe violation across 6 runs (986 baseline violation nodes still the same set or fewer), 845 controls + 53 lazy controls with identical role / name / state / keyboard pattern`, exit 0, 19.6 s (2026-10-17; log `prep/work/a11y-check/check-run.log`, result `prep/work/a11y-check/check-result.json`).

The gate was then proved to bite: with the baseline temporarily edited (one `#curl` row given `role: spinbutton` + `aria-pressed`, one axe node removed from the main run) the same command reported `CHECK FAIL: 3 difference(s)` — `NEW violation color-contrast @ .brush-presets-empty`, `controls[16] #curl: role "spinbutton" -> "slider"`, and the state change — and exited 1; the baseline files were restored byte-identical afterwards.

## Caveats

- **Web build in headless Chrome, not Electron.** `#custom-titlebar` is in the DOM but hidden (`body.web-mode`); Electron adds the titlebar and a window fade, nothing else. Headless Chrome has no real display, so the contrast numbers are the CSS colours, not what a monitor shows.
- **axe's default rule set includes best practices.** 150 of the 163 main-run nodes are best-practice (`region` alone is 145); the WCAG-tagged set is 13 nodes. A later step that adds one `<main>` landmark would clear `region` and `landmark-one-main` at once; that is a markup change, so it is an open item, not a prep step.
- **axe skips `display:none` content.** With every section open, 478 of the 845 controls are still not rendered (conditional sub-blocks behind an effect's checkbox, hidden overlays, the orphan `.controls` panel). axe never saw them; the controls list did (page-side fallback role / name). The baseline therefore does not cover an effect's sub-controls as *rendered*; enabling each effect would mean calling its setter (persisting) or dispatching on its checkbox, which F3 does not do (F1's screenshot states cover a toggle). Reported, not decided.
- **Not opened:** the Invite popover and Room menu (room-only; their static markup is in the main list, hidden), the preset `⋯` menu, the palette listbox, the chip menu, the More panel (below ~900 px wide), the SAM / palette-from-image panels, the pen window (a separate window), the close-ask and delete dialogs. Their handlers are cited in the keyboard legend from source, not exercised.
- **`region` and the overlay deltas:** every popup adds `region` nodes because nothing is a landmark; those are recorded per run and the gate only fails on nodes *new against the baseline of the same run*, so the reskin is free to keep them, not to add more.
- **The keyboard pattern column says what the code does today**, from the handler cited; it does not grade the pattern. Where the behaviour and the role disagree (role=img that acts as a button, role=radiogroup without arrow keys, role=menu with plain buttons) the row carries the pattern and the question is below.
- **The list depends on F0.** A capture reads `prep/baseline/dom/controls.json`; if F0 is re-captured, re-capture F3 too (the cross-check will say if the two drift). `--check` does not need F0.
- `controls-a11y.md` is ~140 KB (one row per control); `axe.json` is ~760 KB with 1-space indentation (six full runs).

## Open questions

Everything below would need a markup, ARIA or handler change, so it is reported for Gabriel, not changed (also in `prep/work/open-items/F3.md`).

1. **36 focusable controls have an empty accessible name.** By cause: (a) a `<label>` that sits beside the input without `for=` — the Stroke section's three unnamed sub-faders (rows 136, 152, 168), `#lightSpeed`, `#lightIntensity`, `#lightAmbient`, `#lightShiftSpeed`, `#lightShiftThreshold`, `#lightShiftIntensity`, `#lightShiftSaturation` (index.html:1259-1262 pattern), `#kSpinSpeed` (index.html:1012), two recDrawer lane sliders (rows 763, 765), `#lightMode`, `#textOverlayFont`, `#audioReactSource`, `#replayTimePeriod`; (b) no label at all — `#splatInMode`, `#splatOutMode`, `#mutationCount`, `#exportVideoFPS`, `#exportGifFPS`, `#exportVideoDuration`, `#exportGifDuration`, `.layer-title` (js/05k-layers-render.js:57), `#multiplayerToggle` (index.html:1389, `display:none`, driven by a button); (c) hidden `input[type=file]` clicked from a button — `#paletteFluidFile`, `#imageUpload`, `#audioReactFile`, `#importPresetsInput` and four unnamed ones (rows 85, 273, 589, 769); (d) `#colorPicker` named by `title` only; (e) `canvas.ace-canvas` with `aria-label=""` (js/40b-audio-cue-editor.js:745). The reskin must not make any of these worse; fixing them is a separate pass.
2. **No landmarks, no `<h1>`, no skip *link*.** `region` (145 nodes), `landmark-one-main`, `page-has-heading-one` and the incomplete `bypass` all come from the same fact. The skip menu (js/66) is real but is buttons, which axe's `bypass` check does not count. Does a `<main>` around `#canvas-area` (or `role=region` + `aria-label` on the three bars, which already carry `aria-label`s) belong in the CSS prep, since it is markup-only and script-free, or after it?
3. **`#sidebar-left` has `aria-label="Brush"` with no role** (axe `aria-prohibited-attr`, incomplete). If the bars get landmark roles (item 2), this resolves itself.
4. **`button.qub-dd-btn` for Image Sharpness and Motion Detail:** `label-content-name-mismatch` (WCAG 2.5.3) because `aria-labelledby` names them from caption + value while the visible text is read differently; Shading Detail passes. Worth a look at js/20-mixer-layout.js:2806-2809 (`aria-haspopup` + `aria-labelledby` = caption id + value id) when the quality bar is restyled.
5. **Patterns that do not match their role** (behaviour, so not for prep): `span.fx-thumb[role=img][tabindex=0]` acts as a button (Enter / Space toggle the effect, js/20:4449); `.arm-mode-wrap[role=radiogroup]` has no arrow-key handler (each radio is its own Tab stop, unlike the paint-type group at js/20:5738); `.arm-tip-menu[role=menu]` holds plain buttons (axe `aria-required-children`, critical, with it open) and has no arrow keys (`DialogFocus.menu` is not used there, js/20:719); `#mpRoomMenu[role=menu]` likewise has no arrow keys (js/06e:807 uses `popup`, not `menu`).
6. **`meta-viewport` `user-scalable=no`** (WCAG 1.4.4) is a deliberate choice for a touch painting surface; recorded so nobody "fixes" it by accident during the reskin.
7. **Contrast findings that the reskin will change by design:** `.brush-presets-empty` 3.67:1 (violation), `.cp-pop-title` and `.preset-group-count` (violations only with their popups open), and 29 incomplete contrast nodes in the strip whose backgrounds are gradients. The theme should be checked against WCAG 1.4.3 when it lands; the gate here only guarantees no *new* violation nodes.
8. **Hidden sub-controls were never rendered for axe** (see Caveats). Should a later pass toggle each effect's checkbox (dispatching `click` on the real input, no setter) so axe sees the Effects / Kaleidoscope / Text sub-blocks rendered?
