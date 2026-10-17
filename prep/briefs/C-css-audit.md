# C — CSS audit

Read `prep/briefs/_preamble.md` first.

## Goal

`prep/css-audit.md`, `prep/css-values.csv` and the script that produces them, `prep/scripts/css-audit.js`, so the audit can be re-run after each later CSS step.

## Scope

- The 12 stylesheets in `css/` in load order (see README), the inline `<style>` in `index.html` 249–301, the three JS-injected `<style>` blocks (`js/00a-boot.js:366`, `js/32-file-drop.js:76`, `js/16-sam-integration.js:266`) and the pen-window stylesheet string (`js/47-pen-window.js:275`), inline `style=""` attributes in `index.html` and inline style strings in JS templates (`style="…"` inside `innerHTML`, `.style.cssText =`, `el.style.x =` — count these per file; list the colour/font/radius/shadow values they carry).
- Out of scope, list only: `phone/phone.css`, `scripts/copy-sink/index.html`, `interaction-design-concept/`, `Design system breakdown exploration/`.

## Split across three agents

- **C1 (static)** owns `prep/scripts/css-audit.js`, `prep/css-values.csv` and `prep/work/css/static.md` (sections 1–3 below).
- **C2 (live)** owns `prep/scripts/css-live.js`, `prep/work/css-unmatched.json`, `prep/work/css/live.md` (section 4 below, plus the `window.auditButtons()` result and the live list of `style.setProperty('--…')` writers observed during boot and a stroke).
- **C3 (report)** reads both `prep/work/css/*.md`, the CSV and the JSON and writes `prep/css-audit.md`, documenting how to re-run both scripts.

## The static script (`prep/scripts/css-audit.js`, plain Node, no dependencies)

1. Tokenise each stylesheet into rules (selector list, declarations, enclosing at-rules, file, line). A small hand-written parser is fine; handle comments, strings, `url()`, nested at-rules (`@media`, `@supports`, `@keyframes`, `@layer`, `@font-face`).
2. Emit `prep/css-values.csv` with columns `value,property,file,line,selector,category` where category ∈ colour (hex/rgb/rgba/hsl/hsla/oklch/named), font-family, font-size, radius, shadow, transition/animation (duration, easing), spacing is NOT required, z-index (useful for the stacking rule), `!important`, `var()` (which token). One row per literal value occurrence. Sort by file, line, property so the file is deterministic.
3. Print and write `prep/css-audit.md` sections:
   - File sizes (bytes, rules, declarations, selectors) and total; load order.
   - Colours: unique count, top 40 by occurrence, how many already go through `var(--…)`, which tokens exist in `css/00-tokens.css` and their usage counts, and literals that equal an existing token's value (easy wins for step 2).
   - Fonts: families, sizes (counts), weights; where `--font-ui`/`--font-mono` are and are not used.
   - Radii, shadows, transitions/animations (durations, easings, `@keyframes` list, which run at boot vs on interaction).
   - `!important`: every occurrence with file:line and the reason if the comment says.
   - Specificity hot spots: ids in selectors, chains of 4+ compounds, `:not()` stacks, attribute selectors on ARIA state (already present: list them), `*` rules, selectors that would fight a `@layer theme` (anything with `!important` or an id).
   - Media and container queries in use, with the rules under each; `prefers-reduced-motion`, `forced-colors` (none today), `pointer: coarse`.
   - Custom properties: declared (where), read (where), written from JS (`style.setProperty('--…')` grep, with file:line), and per-section hue variables (`--sec-h`, `--sec-c`).
   - Unlayered / injected styles that would outrank a future `@layer` (the four JS blocks, the inline `#photoWarn` block, inline `style=""` attributes by count per surface).
   - Rules nothing matches: see below.
   - `zoom: var(--ui-scale)`: which elements, and what that means for pixel baselines at widths above 1600.
   - `window.auditButtons()` (js/38): what it sanctions today; run it in the headless app and record its result as part of the audit.
4. Rules nothing matches, measured live: boot the app with the driver, inject a page function that iterates `document.styleSheets` rules, strips pseudo-classes/pseudo-elements from each selector list, and counts `querySelectorAll` matches per selector in these states: boot; every right-sidebar section open (use Shift-click semantics via `toggleSection`-equivalent: click each `.section-title` with `shiftKey`, or call the page's exposed API if any); left sidebar open; F1 overlay open; radial menu open (press `e`); colour picker popover open; presets popup open. Report selectors unmatched in every state, grouped by file, with the caveat that lazily created UI (pen window, modals, toasts, SAM) may legitimately be unmatched. Save raw results to `prep/work/css-unmatched.json`.

## Output

- `prep/css-audit.md`, `prep/css-values.csv`, `prep/scripts/css-audit.js` (with a usage comment: `node prep/scripts/css-audit.js [--no-live]`), `prep/work/css-unmatched.json`.
- Return: counts (files, rules, literals, unique colours, !important, unmatched selectors) and any Open questions (also appended to `prep/OPEN-ITEMS.md` under `## C`).
