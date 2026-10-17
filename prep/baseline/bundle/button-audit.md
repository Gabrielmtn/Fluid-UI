# Button audit (F6 baseline)

`window.auditButtons()` (`js/38-button-audit.js`) is the existing style-contract gate: it walks the live stylesheets and names every rule outside `css/01-buttons.css` that colours a `button` or `.btn` (exempting `.btn--destructive`, `.btn--record` and `#photoWarn`), plus inline `style=""` colours. Captured 2026-10-17T08:15:40.995Z at HEAD `c4796da` with Chrome/155.0.8059.80 (headless), viewport 1584×805 CSS px, DPR 1, `--ui-scale` 1, Node v25.9.0. Written by `prep/baseline/scripts/bundle.js --audit`; `--check` re-runs it and fails on any change to the totals, the rule list or the inline list of any stage.

## Stages

| Stage | What the DOM held | Buttons | Clean | Coloured by legacy rules | Legacy rules | Inline offenders |
|---|---|---:|---:|---:|---:|---:|
| at-boot | as the app boots: left bar open, Brush section open, every other section collapsed, no popup | 264 | 264 | 0 | 0 | 0 |
| all-sections-open | every sidebar section open (17/17, trusted Shift-clicks), no popup | 264 | 264 | 0 | 0 | 0 |
| with-radial-menu | pointer over the canvas centre, tap E (every section open) | 264 | 264 | 0 | 0 | 0 |
| with-colour-picker | trusted click on the top bar colour well #colorPicker (every section open) | 267 | 267 | 0 | 0 | 0 |
| with-presets-popup | trusted click on #mixerPresetsTrigger (every section open) | 264 | 264 | 0 | 0 | 0 |
| with-arm-tip-menu | trusted click on the first .arm-tip-btn in Multi-Brush (every section open) | 270 | 270 | 0 | 0 | 0 |
| after-popups-closed | every section open, every popup closed again (#radialMenu and .mixer-presets-panel stay in the DOM hidden) | 264 | 264 | 0 | 0 | 0 |

### Inside each popup

| Stage | Root | Buttons in the root | Legacy rules matching them | Inline colours in the root |
|---|---|---:|---|---|
| with-radial-menu | `#radialMenu` | 0 | none | none |
| with-colour-picker | `.cp-pop` | 3 | none | none |
| with-presets-popup | `.mixer-presets-panel` | 15 | none | none |
| with-arm-tip-menu | `.arm-tip-menu` | 6 | none | none |

## Legacy rules that colour a button (union over the stages)

None. Every button reads its colour from `css/01-buttons.css` and the section tokens, in every stage.

## Inline `style=""` colours on buttons (union over the stages)

None.

## How the stages were reached

| Section | Action | Open |
|---|---|---|
| Brush | already open at boot | yes |
| Multi-Brush | trusted Shift-click on .section-title | yes |
| Stroke and replay | trusted Shift-click on .section-title | yes |
| Swirl Together | trusted Shift-click on .section-title | yes |
| Simulation | trusted Shift-click on .section-title | yes |
| Colors and palettes | trusted Shift-click on .section-title | yes |
| Layers | trusted Shift-click on .section-title | yes |
| Mutate shader | trusted Shift-click on .section-title | yes |
| Effects | trusted Shift-click on .section-title | yes |
| Animations | trusted Shift-click on .section-title | yes |
| Audio | trusted Shift-click on .section-title | yes |
| Kaleidoscope | trusted Shift-click on .section-title | yes |
| Text | trusted Shift-click on .section-title | yes |
| Focus | trusted Shift-click on .section-title | yes |
| Display | trusted Shift-click on .section-title | yes |
| Export | trusted Shift-click on .section-title | yes |
| Settings | trusted Shift-click on .section-title | yes |

| Popup | Root | How | Opened | Closed | Note |
|---|---|---|---|---|---|
| radial-menu | `#radialMenu` | pointer over the canvas centre, tap E | yes | yes |  |
| colour-picker | `.cp-pop` | trusted click on the top bar colour well #colorPicker | yes | yes |  |
| presets-popup | `.mixer-presets-panel` | trusted click on #mixerPresetsTrigger | yes | yes |  |
| arm-tip-menu | `.arm-tip-menu` | trusted click on the first .arm-tip-btn in Multi-Brush | yes | yes |  |

Stylesheets seen by the page (document.styleSheets, in order): `00-tokens.css`, `01-buttons.css`, `styles.css`, `slider-styles.css`, `mask-editor.css`, `light-source.css`, `20-mixer-strip.css`, `21-sidebar.css`, `22-overlays.css`, `23-colour-picker.css`, `24-palette-from-image.css`, `init-responsive.css`, `inline`, `inline`.

## Reading this as a gate

The theme layer (`@layer theme`) will colour buttons from outside `css/01-buttons.css`, so as written `isSanctioned()` (js/38-button-audit.js:21–31) will list every theme rule here. Prep does not change js/38; the CSS plan has to say how the theme layer is sanctioned (an open item, not a decision made here). Until then `--check` compares against this list exactly: a new rule, a vanished rule, or a changed button count on any stage fails.
