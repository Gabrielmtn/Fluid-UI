# G — CSS plan annotation

Read `prep/briefs/_preamble.md` first.

## Inputs

`prep/README.md` (the CSS prep section and the session notes), `prep/css-audit.md` + `prep/css-values.csv`, `prep/selector-contract.md`, `prep/mapping.md`, `prep/inventory.md`, `prep/baseline/README.md`, and the stylesheets themselves where you need to confirm a claim.

## Do

For each CSS prep step (1 cascade layers, 2 semantic tokens, 3 theme switch, 4 styling hooks, 5 runtime custom properties, 6 assets and fonts) write:

- **Touches:** files and rule ranges, with counts (e.g. "972 colour literals across 12 files; 341 unique; 118 already equal a token value").
- **Size:** small / medium / large with a line-count estimate and the number of commits it should be split into (each must render pixel-identical to the baseline and be committed on its own).
- **Order and dependencies:** what must land before it.
- **Blockers and risks:** concrete. For step 1: the four JS-injected stylesheets and the inline `#photoWarn` block become unlayered winners; `!important` counts; `js/38-button-audit.js` sanctions only `css/01-buttons.css` and must learn about the theme layer; `zoom: var(--ui-scale)`. For step 2: literals that are NOT the same role despite the same value; the per-section hue system (`--sec-h`/`--sec-c`) and whether it survives; today's accent is `#ec3013` red, not orange — say what `--ui-accent` maps to. For step 3: where `data-theme` goes (`<html>`; `js/00a-boot.js` already toggles classes on `documentElement`), how a user switch would persist (settingsManager key; report, don't decide), and that `[data-theme="classic"]` must not change rendering. For step 4: every state today styled through a script-toggled class, paired with the ARIA attribute that exists or is missing (from the contract and the inventory); the `data-ui` vs `data-ui-key` name collision risk. For step 5: for each control kind, the state-change path from the inventory where `--i/--ga/--gc/--pc` would be set, and where player colours live today (`js/06a`/`06d`/`06e`: find the colour assignment and the element that shows a remote change). For step 6: where fonts would live (`assets/fonts/`), the `@font-face` sheet position relative to the layer order, the electron-builder `files` globs (they include `**/*` so nothing to add; confirm), CSP or `file://` concerns in Electron, the texture's size budget.
- **Gate:** which baseline checks prove the step changed nothing (screenshots zero-diff, a11y list, tab order, sync log, suites, button audit, perf).

Then: a proposed commit sequence (one line each), the "Must not change during prep" list checked against the codebase (where each item lives), and the answer to the open item "No-WebGL fallback": determine whether the app already requires WebGL2 (`js/04a-canvas-gl-config.js` context creation, any fallback path, what the user sees without it) and recommend.

## Output

`prep/css-plan.md`; Open questions appended to `prep/OPEN-ITEMS.md` under `## G`. Return a short summary (steps annotated, blockers found).
