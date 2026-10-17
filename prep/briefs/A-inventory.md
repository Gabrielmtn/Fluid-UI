# A — App UI inventory

Read `prep/briefs/_preamble.md` first.

## Goal

`prep/inventory.md`: every UI surface in the order the user meets it, one table per surface, and `prep/ui-map.md`: a one-page orientation on how the UI is built.

## Inputs

1. `prep/baseline/dom/controls.json` — the live DOM dump written by `prep/scripts/dom-dump.js` (stage A0). One record per interactive element: `surface`, `section`, `order`, `tag`, `id`, `classes`, `role` (computed), `name` (computed accessible name), `aria` (all aria-* attributes), `type`, `value`, `min/max/step`, `labelledBy`, `dataAttrs`, `tabIndex`, `visibleAtBoot`, `parentChain` (ids/classes up to the surface root). Treat it as the enumeration of record.
2. `scripts/test/inventory/params.json` (107 params: id → configKey, range, binding file:line, registered), `js/01a-param-registry.js` (SLIDERS / CHECKBOXES / SELECTS maps = persisted setting keys), `js/09-settings-manager.js` and grep `settingsManager.set(` / `.get(` for non-registry keys.
3. Sync: `js/06b-mp-look.js` (what a room shares and how incoming changes are applied), `js/06c-mp-glide.js` (glided sliders), `js/06d-mp-paint-wire.js` (strokes), `js/06e-mp-panel.js` (room panel). The left brush sidebar is personal; find the exact list the code uses rather than assuming.
4. The builder for your surface in `js/20-mixer-layout.js` (`buildMixerStrip` 805, `faderChannel` 1127, `buildColorChannel` 1203, `buildActionsChannel` 1517, `buildPresetsChannel` 1733, `buildLeftSidebar` 2384, `buildSidebar` 2611, `buildQualityUnderbar` 2675, `buildMutationSection` 2915, `buildLayersSection` 3617, `buildAnimationsSection` 3786, `buildKaleidoscopeSection` 4133, `buildSimulationSection` 4156, `buildEffectsSection` 4455, `buildColorsSection` 4524, `buildDisplaySection` 4541, `buildBrushSection` 5023, `buildBrushPanel` 5399, `buildTextSection` 6315, `buildAudioSection` 7205, `buildFocusSection` 7935, `buildExportSection` 8022, `buildMultiArtistSection` 8361, `buildSettingsSection` 8390, `makeSection` 9302) and the static markup it moves from `index.html`.

## Columns (every table, in this order)

| # | Control (as labelled) | Selector (id, or class + nth) | Element / role | State attrs (aria-*, class toggles, `:disabled`, `.checked`) | Setting key (registry / settingsManager / config / none) | Syncs? (shared / personal / n/a) + where | State-change path (the function that runs when its value or state changes, file:line) | Notes |

"State-change path" is for CSS prep step 5: the theme will set `--i`, `--ga`, `--gc`, `--pc` from the code that already runs when the control changes. Name the input handler and, for shared controls, the incoming-remote handler too.

## Surfaces (one table each, in this order)

1. Top bar `#mixer-strip`, left to right: each fader channel (label, hidden canonical input, visible proxy if any, value readout, extra cells like the material picker), the colour channel, the Presets cell, the Clear/Pause/Stop row, the More cell if present.
2. Left sidebar `#sidebar-left`: head (Brush Size fader, Stabilization), then each section top to bottom (Brush, Multi-Brush, Stroke and replay…), then the folded rail.
3. Right sidebar `#sidebar-right`: one table per section in DOM order (Swirl Together, Simulation, Colors, Layers, Mutation, Effects, Animations, Audio, Kaleidoscope, Text, Focus, Display, Export, Settings), then the quality underbar.
4. Everything else the user can reach: custom titlebar, canvas-area overlays (handles, readouts, brush ghost toggle), the F1 hotkey overlay, the radial menu (E), popovers (colour picker, arm-tip menu, preset menu), modals (reset app, delete palette, close ask), toasts, the pen window launcher. One table, shorter rows.

Also record per section: its `data-group`, default collapsed state, the persisted collapse key, and the section-level chrome (header, title button, chevron, header actions).

## Method

- Work from `controls.json`; for each record find its registry entry / binding / sync handling by grep, cite file:line. Do not read js/20 top to bottom; jump to the builder for your surface.
- Where the dump shows a control with no id, give a stable selector (`#parentId .class:nth-of-type(n)`) and say so.
- Where a control is created lazily (popovers, menus) and missing from the dump, add it from the builder with "(lazy, not in dump)".
- Flag anything whose styling would need a behaviour change (e.g. a state only knowable from JS variables, no DOM attribute) under Open questions.

## Output

- `prep/work/inventory/<surface-slug>.md` for your slice (if you are a slice agent), or `prep/inventory.md` (merge agent), with a short header: scope, dump timestamp, counts (controls, sections), what was not covered.
- `prep/ui-map.md` (merge agent only): build order (index.html → js/20 re-parenting), the DOM tree of the shipping layout to depth 3 with the builder for each node, stylesheet order, the three injected `<style>` nodes, `--ui-scale` zoom, groups and colours per section, where lazy UI is created.
