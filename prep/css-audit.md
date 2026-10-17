# CSS audit (workstream C)

Merged from the two measured halves: `prep/work/css/static.md` (C1, `node prep/scripts/css-audit.js`, HEAD `c4796da`) and `prep/work/css/live.md` (C2, `node prep/scripts/css-live.js`, HEAD `c4796da`, Chrome/155.0.8059.80, headless, viewport 1584×805 CSS px, `--ui-scale` 1). Data files: `prep/css-values.csv` (3,301 rows), `prep/work/css-unmatched.json` (1,996 selector rows), `prep/work/css/button-audit.json`, `prep/work/css/live-custom-props.json`. Every number below comes from one of those; the section numbers cited (static §n, live "…") point at the part that holds the full table where this report trims one.

Scope: the 12 stylesheets `index.html` links (lines 231–242) in load order, the inline `#photoWarn` `<style>` (`index.html:249–301`), the three `<style>` blocks JS injects into the app document (`js/00a-boot.js:366–369`, `js/32-file-drop.js:76–79`, `js/16-sam-integration.js:266–277`), the pen window's stylesheet string (`js/47-pen-window.js:275–316`, a separate document), inline `style=""` attributes in `index.html`, and inline style strings in every `js/*.js`. Out of scope, listed in §14: `phone/`, `scripts/copy-sink/`, `interaction-design-concept/`, `Design system breakdown exploration/`.

Headline counts: **17 sources, 1,822 style rules, 7,113 declarations, 2,036 selectors** (static parse); **1,787 rules / 1,996 selectors live in Chrome** (14 sheets: the pen window is another document, the boot-cursor block is gone after boot, `#samModalStyles` is never injected until the SAM modal opens; 6 rules Chrome drops are unexplained, see §15). **1,107 colour literals / 349 unique** in the app document's stylesheets, 1,321 / 449 spellings across every source; **13.1 %** of colour declarations go through `var()`. **76 `!important`** (72 in `css/`). **1,020 selectors (888 rules) matched nothing in eight UI states**, 70 of them with a class/id no markup or script mentions. **`auditButtons()`: 0 offenders**. **No custom property is written per frame.**

## 1. Files, sizes and load order

Load order is the `<link rel="stylesheet">` order in `index.html:231–242`; `js/00a-boot.js` runs before them (`index.html:225`); the inline `#photoWarn` block follows the last link. Bytes are on disk (CRLF counted). (static §1)

| # | file | kind | bytes | lines | rules | decls | selectors | !important | @media / @container / @supports / @keyframes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `css/00-tokens.css` | stylesheet | 3,582 | 96 | 1 | 51 | 1 | 0 | 0 / 0 / 0 / 0 |
| 2 | `css/01-buttons.css` | stylesheet | 17,514 | 444 | 50 | 135 | 96 | 0 | 1 / 0 / 0 / 1 |
| 3 | `css/styles.css` | stylesheet | 51,916 | 1404 | 236 | 1070 | 278 | 10 | 1 / 0 / 0 / 2 |
| 4 | `css/slider-styles.css` | stylesheet | 8,266 | 233 | 21 | 90 | 24 | 0 | 1 / 0 / 0 / 0 |
| 5 | `css/mask-editor.css` | stylesheet | 17,713 | 752 | 106 | 412 | 109 | 0 | 0 / 0 / 0 / 4 |
| 6 | `css/light-source.css` | stylesheet | 552 | 22 | 2 | 11 | 2 | 0 | 0 / 0 / 0 / 0 |
| 7 | `css/20-mixer-strip.css` | stylesheet | 51,707 | 1610 | 221 | 925 | 237 | 4 | 1 / 4 / 0 / 0 |
| 8 | `css/21-sidebar.css` | stylesheet | 84,632 | 2527 | 403 | 1465 | 427 | 8 | 3 / 0 / 1 / 2 |
| 9 | `css/22-overlays.css` | stylesheet | 86,115 | 2689 | 524 | 1937 | 568 | 46 | 5 / 0 / 0 / 2 |
| 10 | `css/23-colour-picker.css` | stylesheet | 15,491 | 569 | 102 | 375 | 122 | 3 | 0 / 0 / 0 / 1 |
| 11 | `css/24-palette-from-image.css` | stylesheet | 4,143 | 184 | 26 | 107 | 26 | 0 | 0 / 0 / 0 / 0 |
| 12 | `css/init-responsive.css` | stylesheet | 20,966 | 637 | 80 | 301 | 91 | 1 | 0 / 1 / 0 / 4 |
| 13 | `index.html <style>` | inline block | 2,861 | html 249–301 | 20 | 80 | 20 | 0 | 0 / 0 / 0 / 0 |
| 14 | `js/00a-boot.js` `#boot-cursor-style` | injected | 98 | js 368–369 | 1 | 1 | 2 | 1 | 0 / 0 / 0 / 0 |
| 15 | `js/32-file-drop.js` (no id) `.file-drop-hover` | injected | 156 | js 77–79 | 1 | 3 | 1 | 2 | 0 / 0 / 0 / 0 |
| 16 | `js/16-sam-integration.js` `#samModalStyles` | injected | 327 | js 268–277 | 0 | 4 | 0 | 0 | 0 / 0 / 0 / 2 |
| 17 | `js/47-pen-window.js` pen window `<style>` | separate document | 2,945 | js 275–316 | 28 | 146 | 32 | 1 | 0 / 0 / 0 / 0 |

Totals: 17 sources (12 stylesheets, 1 inline block, 4 JS strings); **1,822 style rules**, 40 keyframe steps, **7,113 declarations**, 2,036 selectors, 36 at-rules; stylesheets + inline block = **365,458 bytes**. CSV: 3,301 rows, of which **2,719 literal rows** (the rest: 506 `var()` reads, 76 `!important`); per source 2,811 from the stylesheets, 39 inline block, 5 injected blocks, 47 pen window, 53 inline `style=` attributes, 346 JS inline strings (these per-source numbers include the var/!important rows).

Live (Chrome, after boot): 14 sheets, 1,787 style rules, 16 `@keyframes`, 0 `@font-face`, 18 grouping at-rules, 1,996 selectors; per sheet in §10.

## 2. Colours

In the app document's stylesheets + inline block + injected blocks: **1,107 colour literals, 349 unique by computed value** (387 unique spellings), plus `transparent` ×52 and `currentColor` ×7. Every source including JS inline strings and the pen window: **1,321 literals**. Per source (static §2):

| file | colour literals | unique |
|---|---|---|
| `css/00-tokens.css` | 28 | 27 |
| `css/01-buttons.css` | 74 | 43 |
| `css/styles.css` | 185 | 97 |
| `css/slider-styles.css` | 18 | 8 |
| `css/mask-editor.css` | 102 | 51 |
| `css/light-source.css` | 2 | 2 |
| `css/20-mixer-strip.css` | 95 | 54 |
| `css/21-sidebar.css` | 154 | 88 |
| `css/22-overlays.css` | 302 | 112 |
| `css/23-colour-picker.css` | 27 | 12 |
| `css/24-palette-from-image.css` | 5 | 4 |
| `css/init-responsive.css` | 29 | 26 |
| `index.html` (inline block + `style=` attrs) | 52 | 36 |
| `js/*.js` inline strings (18 files, see §9c) | 159 | — |
| `js/47-pen-window.js` (own stylesheet) | 26 | 16 |

### 2a. Top 40 colours by occurrence (stylesheets + inline block + injected)

| # | computed | count | spellings | files | token with this value |
|---|---|---|---|---|---|
| 1 | `#ffffff` | 70 | #fff ×49, white ×18, #ffffff ×2, rgba(255, 255, 255, 1) ×1 | 22-overlays ×24, 21-sidebar ×11, 23-colour-picker ×10, 20-mixer-strip ×8, styles ×8, mask-editor … |  |
| 2 | `#e6edf3` | 39 | #e6edf3 ×39 | 22-overlays ×18, 21-sidebar ×9, styles ×7, 20-mixer-strip ×3, mask-editor ×2 |  |
| 3 | `rgba(255, 255, 255, 0.08)` | 28 | two spellings | 22-overlays ×7, 20-mixer-strip ×5, mask-editor ×5, styles ×4, 21-sidebar ×3, 23-colour-picker … |  |
| 4 | `rgba(255, 255, 255, 0.1)` | 24 | three spellings | 22-overlays ×8, mask-editor ×5, styles ×5, 21-sidebar ×3, 20-mixer-strip ×2, 00-tokens … | `--bg-raised-hover` |
| 5 | `#f2f3f5` | 21 | #f2f3f5 ×21 | 20-mixer-strip ×7, 21-sidebar ×7, 22-overlays ×3, styles ×2, 00-tokens ×1, init-responsive … | `--ink-100` `--text-primary` |
| 6 | `rgba(255, 255, 255, 0.06)` | 21 | two spellings | 22-overlays ×6, 21-sidebar ×5, mask-editor ×4, styles ×4, 20-mixer-strip ×1, init-responsive … |  |
| 7 | `rgba(0, 0, 0, 0.55)` | 20 | one spelling | 22-overlays ×12, 20-mixer-strip ×3, 23-colour-picker ×2, 01-buttons ×1, 21-sidebar ×1, 24-palette … |  |
| 8 | `#8b949e` | 18 | #8b949e ×18 | mask-editor ×14, 20-mixer-strip ×2, 21-sidebar ×1, styles ×1 |  |
| 9 | `#2a2e37` | 17 | #2a2e37 ×17 | 20-mixer-strip ×6, styles ×4, slider-styles ×3, 21-sidebar ×2, 00-tokens ×1, 22-overlays … | `--border-default` `--ground-500` |
| 10 | `rgba(0, 0, 0, 0.5)` | 16 | two spellings | 22-overlays ×6, 23-colour-picker ×3, styles ×3, 20-mixer-strip ×2, mask-editor ×2 |  |
| 11 | `rgba(255, 255, 255, 0.18)` | 15 | one spelling | 22-overlays ×11, 20-mixer-strip ×2, 21-sidebar ×1, 23-colour-picker ×1 |  |
| 12 | `rgba(255, 255, 255, 0.04)` | 13 | two spellings | mask-editor ×5, 22-overlays ×4, 00-tokens ×1, 23-colour-picker ×1, init-responsive ×1, styles … | `--border-subtle` |
| 13 | `rgba(255, 255, 255, 0.12)` | 13 | two spellings | 21-sidebar ×6, 20-mixer-strip ×2, init-responsive ×2, 00-tokens ×1, 22-overlays ×1, styles … | `--border-strong` |
| 14 | `rgba(255, 255, 255, 0.45)` | 13 | two spellings | 22-overlays ×9, 21-sidebar ×2, 20-mixer-strip ×1, init-responsive ×1 |  |
| 15 | `#58a6ff` | 12 | #58a6ff ×12 | 22-overlays ×5, mask-editor ×3, styles ×2, 20-mixer-strip ×1, 23-colour-picker ×1 |  |
| 16 | `rgba(0, 0, 0, 0.3)` | 11 | two spellings | 22-overlays ×5, 21-sidebar ×2, mask-editor ×2, 20-mixer-strip ×1, init-responsive ×1 |  |
| 17 | `#c9d1d9` | 11 | #c9d1d9 ×11 | mask-editor ×9, styles ×2 |  |
| 18 | `rgba(255, 255, 255, 0.5)` | 11 | two spellings | 22-overlays ×6, 20-mixer-strip ×2, 21-sidebar ×2, init-responsive ×1 |  |
| 19 | `rgba(255, 255, 255, 0.6)` | 11 | one spelling | 22-overlays ×7, 20-mixer-strip ×2, 21-sidebar ×1, styles ×1 |  |
| 20 | `#000000` | 10 | #000 ×10 | styles ×4, 21-sidebar ×2, 23-colour-picker ×2, 22-overlays ×1, mask-editor ×1 |  |
| 21 | `rgba(100, 255, 100, 0.8)` | 10 | one spelling | styles ×10 |  |
| 22 | `#0f141b` | 10 | #0f141b ×10 | 22-overlays ×4, styles ×3, 20-mixer-strip ×1, 21-sidebar ×1, mask-editor ×1 |  |
| 23 | `#b9bec7` | 10 | #b9bec7 ×10 | 21-sidebar ×5, 22-overlays ×3, 00-tokens ×1, 20-mixer-strip ×1 | `--ink-300` `--text-secondary` |
| 24 | `rgba(255, 255, 255, 0.05)` | 10 | one spelling | 22-overlays ×5, 21-sidebar ×4, styles ×1 |  |
| 25 | `rgba(255, 255, 255, 0.2)` | 10 | two spellings | styles ×6, 22-overlays ×2, mask-editor ×2 |  |
| 26 | `rgba(255, 255, 255, 0.3)` | 10 | two spellings | 22-overlays ×6, styles ×4 |  |
| 27 | `#7b828e` | 9 | #7b828e ×9 | 20-mixer-strip ×3, 21-sidebar ×2, 00-tokens ×1, 22-overlays ×1, slider-styles ×1, styles … | `--ink-500` `--text-dim` |
| 28 | `rgba(255, 255, 255, 0.4)` | 9 | two spellings | 22-overlays ×3, 21-sidebar ×2, init-responsive ×2, 20-mixer-strip ×1, styles ×1 |  |
| 29 | `rgba(0, 0, 0, 0.85)` | 8 | one spelling | 22-overlays ×5, 20-mixer-strip ×2, 01-buttons ×1 |  |
| 30 | `rgba(100, 200, 255, 0.8)` | 8 | one spelling | styles ×8 |  |
| 31 | `#0b0f14` | 8 | #0b0f14 ×8 | 21-sidebar ×4, styles ×3, 22-overlays ×1 |  |
| 32 | `#ffa500` | 8 | #ffa500 ×8 | 22-overlays ×5, 21-sidebar ×2, 00-tokens ×1 | `--warn` |
| 33 | `rgba(255, 255, 255, 0.55)` | 8 | one spelling | 21-sidebar ×3, 22-overlays ×3, 20-mixer-strip ×1, init-responsive ×1 |  |
| 34 | `rgba(15, 20, 27, 0.95)` | 7 | one spelling | 22-overlays ×5, mask-editor ×2 |  |
| 35 | `#ec3013` | 7 | #ec3013 ×7 | styles ×3, 00-tokens ×2, 20-mixer-strip ×1, slider-styles ×1 | `--accent` `--accent-cool` |
| 36 | `#1a1f2a` | 7 | #1a1f2a ×7 | 22-overlays ×3, styles ×2, 20-mixer-strip ×1, mask-editor ×1 |  |
| 37 | `#0a0b0e` | 6 | #0a0b0e ×6 | slider-styles ×5, 00-tokens ×1 | `--bg-app` `--ground-950` |
| 38 | `rgba(255, 255, 255, 0.14)` | 6 | one spelling | 22-overlays ×3, 20-mixer-strip ×2, mask-editor ×1 |  |
| 39 | `rgba(255, 255, 255, 0.35)` | 6 | two spellings | 22-overlays ×4, 21-sidebar ×1, styles ×1 |  |
| 40 | `#2ea043` | 6 | #2ea043 ×6 | 22-overlays ×6 |  |

The white-alpha ladder (`rgba(255,255,255,0.04 … 0.85)`, 14 distinct alphas) and the black-alpha ladder (`rgba(0,0,0,0.3 … 0.9)`) are the bulk of the no-token colours; `#e6edf3`, `#8b949e`, `#c9d1d9`, `#58a6ff`, `#0f141b`, `#1a1f2a`, `#0b0f14`, `#2ea043` are GitHub-Primer-era greys/blues with no token. `url()` references: 4, of which 3 are `data:` URIs (contents not scanned for colours).

### 2b. How many colour declarations already go through `var(--…)`

Of **1,138 declarations** in colour-bearing properties (color, background*, border*, outline*, shadows, fill/stroke, filters; custom-property declarations excluded) in the app document: **149 use only `var()` (13.1 %)**, **829 use only literals (72.8 %)**, 160 mix both (a literal fallback or a literal beside a token). (static §2b)

### 2c. Tokens in `css/00-tokens.css` and their usage

51 declarations on `:root` (`css/00-tokens.css:12–95`). "var() reads" counts every `var(--x)` in scope, including JS strings. (static §2c)

| token | value | resolves to | var() reads | reads outside tokens file | read in |
|---|---|---|---|---|---|
| `--accent` | `#ec3013` |  | 16 | 16 | 23-colour-picker ×6, styles ×3, 21-sidebar ×2, js/35-zoom-view.js ×2, 20-mixer-strip ×1, 24-palette-from-image … |
| `--accent-60` | `rgba(236, 48, 19, 0.6)` |  | 1 | 1 | 21-sidebar ×1 |
| `--accent-40` | `rgba(236, 48, 19, 0.4)` |  | 0 | 0 |  |
| `--accent-25` | `rgba(236, 48, 19, 0.25)` |  | 0 | 0 |  |
| `--accent-12` | `rgba(236, 48, 19, 0.12)` |  | 0 | 0 |  |
| `--accent-cool` | `#ec3013` |  | 0 | 0 |  |
| `--accent-cool-soft` | `rgba(236, 48, 19, 0.35)` |  | 0 | 0 |  |
| `--ground-950` | `#0a0b0e` |  | 12 | 11 | slider-styles ×5, 23-colour-picker ×3, 21-sidebar ×2, 00-tokens ×1, 24-palette-from-image ×1 |
| `--ground-900` | `#0e0f12` |  | 8 | 8 | 23-colour-picker ×6, 20-mixer-strip ×1, 24-palette-from-image ×1 |
| `--ground-800` | `#16181d` |  | 6 | 6 | 23-colour-picker ×3, 24-palette-from-image ×2, 21-sidebar ×1 |
| `--ground-700` | `#191c22` |  | 6 | 5 | 22-overlays ×2, 23-colour-picker ×2, 00-tokens ×1, 21-sidebar ×1 |
| `--ground-600` | `#232830` |  | 7 | 6 | 21-sidebar ×2, 22-overlays ×2, 00-tokens ×1, 20-mixer-strip ×1, 24-palette-from-image ×1 |
| `--ground-500` | `#2a2e37` |  | 37 | 36 | 23-colour-picker ×12, 20-mixer-strip ×6, 21-sidebar ×6, styles ×4, 22-overlays ×3, slider-styles … |
| `--ink-100` | `#f2f3f5` |  | 42 | 41 | 21-sidebar ×15, 23-colour-picker ×8, 20-mixer-strip ×7, 22-overlays ×5, 24-palette-from-image ×3 … |
| `--ink-300` | `#b9bec7` |  | 35 | 34 | 21-sidebar ×13, 23-colour-picker ×10, 22-overlays ×7, 24-palette-from-image ×2, 00-tokens ×1, 20-mixer-strip … |
| `--ink-500` | `#7b828e` |  | 37 | 36 | 22-overlays ×16, 21-sidebar ×9, 23-colour-picker ×4, 20-mixer-strip ×3, styles ×2, 00-tokens ×1 … |
| `--heat-0` | `#f0a626` |  | 2 | 2 | slider-styles ×2 |
| `--heat-1` | `#e0432a` |  | 2 | 2 | slider-styles ×2 |
| `--chrome-0` | `#f6f7f9` |  | 3 | 3 | slider-styles ×2, 21-sidebar ×1 |
| `--chrome-1` | `#9aa1ad` |  | 3 | 3 | slider-styles ×2, 21-sidebar ×1 |
| `--ok` | `#3fb950` |  | 7 | 7 | 22-overlays ×6, 21-sidebar ×1 |
| `--warn` | `#ffa500` |  | 10 | 10 | 22-overlays ×5, 23-colour-picker ×3, 21-sidebar ×2 |
| `--danger` | `#ff6b6b` |  | 2 | 2 | 21-sidebar ×1, 23-colour-picker ×1 |
| `--bg-app` | `var(--ground-950)` | `#0a0b0e` | 0 | 0 |  |
| `--bg-panel` | `rgba(11, 14, 20, 0.96)` |  | 1 | 1 | 22-overlays ×1 |
| `--bg-panel-2` | `var(--ground-700)` | `#191c22` | 0 | 0 |  |
| `--bg-raised` | `var(--ground-600)` | `#232830` | 0 | 0 |  |
| `--bg-raised-hover` | `rgba(255, 255, 255, 0.1)` |  | 0 | 0 |  |
| `--bg-inset` | `rgba(0, 0, 0, 0.2)` |  | 1 | 1 | 22-overlays ×1 |
| `--border-subtle` | `rgba(255, 255, 255, 0.04)` |  | 6 | 6 | 21-sidebar ×4, 22-overlays ×2 |
| `--border-default` | `var(--ground-500)` | `#2a2e37` | 1 | 1 | 21-sidebar ×1 |
| `--border-strong` | `rgba(255, 255, 255, 0.12)` |  | 1 | 1 | 22-overlays ×1 |
| `--text-primary` | `var(--ink-100)` | `#f2f3f5` | 0 | 0 |  |
| `--text-secondary` | `var(--ink-300)` | `#b9bec7` | 6 | 6 | 22-overlays ×4, 21-sidebar ×2 |
| `--text-dim` | `var(--ink-500)` | `#7b828e` | 2 | 2 | 21-sidebar ×1, 22-overlays ×1 |
| `--sp-1` … `--sp-5` | `4px 6px 8px 12px 16px` |  | 0 | 0 |  |
| `--radius-sm` / `--radius-md` / `--radius-lg` | `0` / `0` / `0` |  | 0 | 0 |  |
| `--font-ui` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif` |  | 5 | 5 | 22-overlays ×2, 21-sidebar ×1, slider-styles ×1, styles ×1 |
| `--font-mono` | `'Courier New', monospace` |  | 1 | 1 | 22-overlays ×1 |
| `--z-canvas` / `--z-ui` / `--z-overlay` / `--z-modal` / `--z-toast` / `--z-splash` | `0 / 100 / 1000 / 2000 / 3000 / 99999` |  | 0 | 0 |  |

**Tokens declared but never read anywhere in scope (24 of 51):** `--accent-40`, `--accent-25`, `--accent-12`, `--accent-cool`, `--accent-cool-soft`, `--bg-app`, `--bg-panel-2`, `--bg-raised`, `--bg-raised-hover`, `--text-primary`, `--sp-1…5`, `--radius-sm/md/lg`, `--z-canvas/ui/overlay/modal/toast/splash`.

### 2d. Literals equal to an existing token's value (step-2 easy wins)

Counted outside `css/00-tokens.css`, over every source in scope; the CSV `token` column marks every such row (two names where a literal matches two aliases). A literal equal to a token value can become `var(--token)` with no on-screen change. (static §2d)

| token | value | literal occurrences | already read via var() | in |
|---|---|---|---|---|
| `--bg-raised-hover` | `rgba(255, 255, 255, 0.1)` | 40 | 0 | 22-overlays ×8, js/20-mixer-layout.js ×8, mask-editor ×5, styles ×5, 21-sidebar ×3, js/47-pen-window.js … |
| `--radius-sm` = `--radius-md` = `--radius-lg` | `0` | 37 | 0 | 21-sidebar ×12, slider-styles ×6, styles ×5, 20-mixer-strip ×4, mask-editor ×4, 22-overlays ×2 … |
| `--ink-100` = `--text-primary` | `#f2f3f5` | 23 | 42 / 0 | 20-mixer-strip ×7, 21-sidebar ×7, 22-overlays ×3, styles ×2, js/20-mixer-layout.js ×2, init-responsive … |
| `--ground-500` = `--border-default` | `#2a2e37` | 16 | 37 / 1 | 20-mixer-strip ×6, styles ×4, slider-styles ×3, 21-sidebar ×2, 22-overlays ×1 |
| `--border-strong` | `rgba(255, 255, 255, 0.12)` | 14 | 1 | 21-sidebar ×6, 20-mixer-strip ×2, init-responsive ×2, js/20-mixer-layout.js ×2, 22-overlays ×1, styles … |
| `--border-subtle` | `rgba(255, 255, 255, 0.04)` | 13 | 6 | mask-editor ×5, 22-overlays ×4, 23-colour-picker ×1, init-responsive ×1, styles ×1, js/20-mixer-layout.js … |
| `--ok` | `#3fb950` | 13 | 7 | mask-editor ×3, js/15-layer-masking.js ×3, js/16-sam-integration.js ×3, 21-sidebar ×1, styles ×1, index.html … |
| `--ink-300` = `--text-secondary` | `#b9bec7` | 9 | 35 / 6 | 21-sidebar ×5, 22-overlays ×3, 20-mixer-strip ×1 |
| `--ink-500` = `--text-dim` | `#7b828e` | 8 | 37 / 2 | 20-mixer-strip ×3, 21-sidebar ×2, 22-overlays ×1, slider-styles ×1, styles ×1 |
| `--accent` = `--accent-cool` | `#ec3013` | 7 | 16 / 0 | styles ×3, js/35-zoom-view.js ×2, 20-mixer-strip ×1, slider-styles ×1 |
| `--warn` | `#ffa500` | 7 | 10 | 22-overlays ×5, 21-sidebar ×2 |
| `--z-splash` | `99999` | 6 | 0 | 22-overlays ×1, init-responsive ×1, js/22-audio-reactive.js ×1, js/24-video-export.js ×1, js/50-look-links.js … |
| `--ground-950` = `--bg-app` | `#0a0b0e` | 5 | 12 / 0 | slider-styles ×5 |
| `--danger` | `#ff6b6b` | 4 | 2 | 20-mixer-strip ×1, 21-sidebar ×1, styles ×1, js/20-mixer-layout.js ×1 |
| `--bg-inset` | `rgba(0, 0, 0, 0.2)` | 2 | 1 | init-responsive ×1, styles ×1 |
| `--bg-panel` | `rgba(11, 14, 20, 0.96)` | 2 | 1 | mask-editor ×1, styles ×1 |
| `--ground-600` = `--bg-raised` | `#232830` | 2 | 7 / 0 | 20-mixer-strip ×1, 21-sidebar ×1 |
| `--chrome-0` | `#f6f7f9` | 2 | 3 | slider-styles ×2 |
| `--chrome-1` | `#9aa1ad` | 2 | 3 | slider-styles ×2 |
| `--heat-0` | `#f0a626` | 2 | 2 | slider-styles ×2 |
| `--heat-1` | `#e0432a` | 2 | 2 | slider-styles ×2 |
| `--z-ui` | `100` | 2 | 0 | 21-sidebar ×2 |
| `--accent-12` | `rgba(236, 48, 19, 0.12)` | 1 | 0 | 20-mixer-strip ×1 |
| `--accent-60` | `rgba(236, 48, 19, 0.6)` | 1 | 1 | 22-overlays ×1 |
| `--ground-900` | `#0e0f12` | 1 | 8 | 20-mixer-strip ×1 |
| `--z-toast` | `3000` | 1 | 0 | 22-overlays ×1 |

**Colour literals matching a token: 176 of 1,321.** The remaining 1,145 (322 distinct computed values) have no token today and are the raw material for the role-named tokens of CSS prep step 2; the top 25 of those are rows 1–3, 6–8, 10–11, 14–22, 24–26, 28–31, 33 of §2a (every row there without a token).

## 3. Fonts

No `@font-face` anywhere (0 live, 0 static): every family is a system font. (static §3)

### 3a. Families

| family | count | in |
|---|---|---|
| `monospace` | 21 | 21-sidebar ×5, 22-overlays ×4, 23-colour-picker ×3, 20-mixer-strip ×2, styles ×2, js/20-mixer-layout.js … |
| `Segoe UI` | 13 | js/04a-canvas-gl-config.js ×3, js/35-zoom-view.js ×3, init-responsive ×2, 22-overlays ×1, styles ×1, index.html … |
| `sans-serif` | 13 | same files as `Segoe UI` |
| `Courier New` | 11 | 21-sidebar ×5, 20-mixer-strip ×2, 22-overlays ×2, init-responsive ×1, styles ×1 |
| `-apple-system` | 4 | init-responsive ×2, styles ×1, js/47-pen-window.js ×1 |
| `BlinkMacSystemFont` | 3 | init-responsive ×2, styles ×1 |
| `Consolas` | 3 | 23-colour-picker ×3 |
| `system-ui` | 3 | 22-overlays ×1, index.html ×1, js/47-pen-window.js ×1 |
| `ui-monospace` | 3 | 23-colour-picker ×3 |
| `Inter` | 2 | init-responsive ×2 |
| `Bahnschrift` | 1 | 21-sidebar ×1 |
| `DIN Alternate` | 1 | 21-sidebar ×1 |

**`--font-ui` is read 5 times, `--font-mono` once.** Of 41 `font-family`/`font` declarations in scope, 4 go through `var(--font-ui|--font-mono)`, 23 set a literal family list, 14 are `inherit`/other. The 23 literal lists (where the tokens are NOT used):

| where | selector | declaration |
|---|---|---|
| css/styles.css:181 | `body` | `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| css/styles.css:296 | `#canvas-size-display` | `font-family: monospace` |
| css/styles.css:1185 | `.stats-panel` | `font-family: 'Courier New', monospace` |
| css/20-mixer-strip.css:362 | `.ch-value` | `font-family: 'Courier New', monospace` |
| css/20-mixer-strip.css:1112 | `.arm-colors-panel .control-group label .value-display` | `font-family: 'Courier New', monospace` |
| css/21-sidebar.css:653 | `.ss-origin-coords` | `font-family: 'Courier New', monospace` |
| css/21-sidebar.css:1177 | `.mp-join-row input` | `font-family: 'Courier New', monospace` |
| css/21-sidebar.css:1372 | `.mp-room-code` | `font-family: 'Courier New', monospace` |
| css/21-sidebar.css:1800 | `.brush-time-input-wrap input[type="number"]` | `font-family: 'Courier New', monospace` |
| css/21-sidebar.css:2392 | `#sidebar-left .lsb-steady > .control-group > label .value-display` | `font-family: 'Courier New', monospace` |
| css/22-overlays.css:605 | `.path-speed-val, .path-brush-val, .path-flow-val` | `font-family: 'Courier New', monospace` |
| css/22-overlays.css:1892 | `.atv-lane-label` | `font-family: monospace` |
| css/22-overlays.css:1903 | `.atv-lane-count` | `font-family: monospace` |
| css/22-overlays.css:2523 | `.reset-app-hint` | `font: 13px/1.5 "Segoe UI", system-ui, sans-serif` |
| css/22-overlays.css:2651 | `.phone-pad-code` | `font: 700 28px/1.1 'Courier New', monospace` |
| css/23-colour-picker.css:83 | `:is(#sidebar-right, #sidebar-left, body) .cp .cp-hex` | `font-family: ui-monospace, Consolas, monospace` |
| css/23-colour-picker.css:156 | `:is(#sidebar-right, #sidebar-left, body) .cp .cp-num` | `font-family: ui-monospace, Consolas, monospace` |
| css/23-colour-picker.css:287 | `.cp-loupe-hex` | `font: 600 11px/1 ui-monospace, Consolas, monospace` |
| css/init-responsive.css:61 | `.splash-title` | `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif` |
| css/init-responsive.css:92 | `.splash-subtitle` | same list |
| css/init-responsive.css:474 | `#sidebar-right .layer-slider-value` | `font-family: 'Courier New', monospace` |
| index.html:256 | `#photoWarn` | `font-family: 'Segoe UI', system-ui, sans-serif` |
| js/47-pen-window.js:277 | `html,body` (pen window) | `font: 13px system-ui,-apple-system,Segoe UI,sans-serif` |

Note `body` (`css/styles.css:181`) sets the UI family as a literal, not `var(--font-ui)`, and the literal omits `'Inter'` that the token carries. The three monospace stacks (`'Courier New', monospace` ×11, `monospace` ×21, `ui-monospace, Consolas, monospace` ×3) are three different renderings today. JS also sets `Segoe UI`/`sans-serif` ×7 and `monospace` ×4 from inline strings (§9c).

### 3b. Sizes (422 `font-size` literals in the CSV)

| font-size | count | | font-size | count |
|---|---|---|---|---|
| `11px` | 103 | | `17px` `18px` `20px` `24px` `48px` | 2 each |
| `10px` | 89 | | `0.85em` `21px` `26px` `28px` `40px` `7px` | 1 each |
| `12px` | 72 | | `calc(10px * var(--ui-scale))` | 4 |
| `13px` | 35 | | `calc(9px * var(--ui-scale))` | 3 |
| `14px` | 28 | | `calc(10/11/12/16px * var(--ui-scale, 1))` | 1 each |
| `9px` | 22 | | `clamp(11px, 1.3vh, 13px)` `clamp(11px, 1.4vh, 13px)` `clamp(11px, 1.5vw, 14px)` | 1 each |
| `15px` `16px` | 9 each | | `clamp(14px, 2vh, 20px)` `clamp(36px, 5vw, 64px)` | 1 each |
| `10.5px` | 5 | | `0.7em` `1.1em` | 3 each |
| `0` `12.5px` `8px` | 4 each | | | |

Responsive size tokens declared in `css/init-responsive.css:11–15` `:root` (computed from `--ui-scale`): `--font-xs` read ×22, `--font-sm` ×4, `--font-md` / `--font-lg` / `--font-xl` never read.

### 3c. Weights (129 literals)

`600` ×66, `700` ×36, `500` ×17, `800` ×5, `bold` ×4, `200` ×1.

## 4. Radii, shadows, transitions and animations

### 4a. Radii

**328 literal radius values, 16 distinct**; `--radius-sm|md|lg` (all `0` since the 2026-08 hand-off) are never read. (static §4)

| radius | count | in |
|---|---|---|
| `4px` | 68 | 22-overlays ×16, styles ×16, js/20-mixer-layout.js ×15, index.html ×8, 21-sidebar ×6, 20-mixer-strip ×4 … |
| `6px` | 68 | 21-sidebar ×27, 22-overlays ×13, styles ×11, 20-mixer-strip ×5, init-responsive ×3, mask-editor … |
| `8px` | 41 | 22-overlays ×11, 21-sidebar ×7, mask-editor ×6, styles ×6, 20-mixer-strip ×2, init-responsive … |
| `0` | 37 | 21-sidebar ×12, slider-styles ×6, styles ×5, 20-mixer-strip ×4, mask-editor ×4, 22-overlays ×2 … |
| `50%` | 33 | 21-sidebar ×12, 22-overlays ×6, styles ×5, mask-editor ×3, 20-mixer-strip ×1, 23-colour-picker … |
| `3px` | 20 | 22-overlays ×6, 20-mixer-strip ×4, 21-sidebar ×3, styles ×3, 23-colour-picker ×2, js/20-mixer-layout.js … |
| `10px` | 19 | 22-overlays ×6, styles ×4, mask-editor ×3, 21-sidebar ×2, index.html ×1, js/05d-input-replay.js ×1 … |
| `5px` | 15 | 22-overlays ×8, 21-sidebar ×4, 20-mixer-strip ×2, styles ×1 |
| `2px` | 11 | 20-mixer-strip ×5, styles ×3, 22-overlays ×1, init-responsive ×1, js/20-mixer-layout.js ×1 |
| `1px` | 4 | init-responsive ×2, 21-sidebar ×1, styles ×1 |
| `16px` | 3 | mask-editor ×1, js/16-sam-integration.js ×1, js/23-depth-collision.js ×1 |
| `7px` | 3 | 22-overlays ×2, 20-mixer-strip ×1 |
| `12px` | 2 | 22-overlays ×1, mask-editor ×1 |
| `999px` | 2 | mask-editor ×1, js/35-zoom-view.js ×1 |
| `0.273em` | 1 | 21-sidebar ×1 |
| `11px` | 1 | 22-overlays ×1 |

### 4b. Shadows

**129 shadow layers (104 distinct)** across `box-shadow` ×102, `text-shadow` ×26, `filter` ×1. Layers used more than once (static §5 has the top 30):

| shadow layer | count | in |
|---|---|---|
| `0 1px 2px rgba(0, 0, 0, 0.85)` | 8 | 22-overlays ×5, 20-mixer-strip ×2, 01-buttons ×1 |
| `0 0 6px rgba(0, 0, 0, 0.55)` | 6 | 22-overlays ×4, 01-buttons ×1, 20-mixer-strip ×1 |
| `0 10px 28px rgba(0, 0, 0, 0.55)` | 3 | 22-overlays ×2, 20-mixer-strip ×1 |
| `0 0 0 1px rgba(0, 0, 0, 0.7)` | 2 | 23-colour-picker ×2 |
| `0 0 0 2px rgba(0, 0, 0, 0.55)` | 2 | 22-overlays ×2 |
| `0 0 0 2px var(--ground-900)` | 2 | 23-colour-picker ×2 |
| `0 0 0 4px #fff` | 2 | 23-colour-picker ×2 |
| `0 0 2px rgba(0,0,0,0.85)` | 2 | js/31-brush-cursor.js ×2 |
| `0 0 6px rgba(255, 165, 0, 0.4)` | 2 | 21-sidebar ×2 |
| `0 8px 28px rgba(0, 0, 0, 0.55)` | 2 | 22-overlays ×2 |
| `inset 0 0 0 1px rgba(255, 255, 255, 0.08)` | 2 | 23-colour-picker ×2 |
| `inset 0 0 0 1px var(--ground-500, #2a2e37)` | 2 | slider-styles ×2 |
| `inset 0 1px rgba(255,255,255,0.08)` | 2 | styles ×2 |
| `inset 0 1px rgba(255,255,255,0.8)` | 2 | styles ×2 |

Everything else is a one-off (90 layers), e.g. `0 0 0 200vmax rgba(4, 6, 10, 0.6)` (the modal veil, 22-overlays), `0 0 0 2px oklch(62% 0.12 var(--sec-h, 242) / 0.25)` (section-hued focus, 21-sidebar), two spellings of the same `0 0 0 2px rgba(88,166,255,0.25)` focus ring (21-sidebar, 22-overlays).

### 4c. Transitions

| duration | count | | easing | count | | transitioned property | count |
|---|---|---|---|---|---|---|---|
| `0.15s` | 28 | | `ease` | 32 | | `transform` | 18 |
| `120ms` | 8 | | `cubic-bezier(0.25, 0.1, 0.25, 1)` | 13 | | `border-color` | 15 |
| `0.4s` | 7 | | `linear` | 4 | | `opacity` | 13 |
| `0.12s` `0.55s` | 6 each | | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 2 | | `background` | 9 |
| `0.3s` `0.5s` `0s` | 4 each | | `cubic-bezier(0.4, 0, 0.6, 1)` | 1 | | `background-color` `color` | 5 each |
| `0.1s` `0.2s` | 3 each | | | | | `visibility` | 4 |
| `0.25s` `0.45s` `140ms` | 2 each | | delays: `0s` ×2, `0.15s` ×1, `0.25s` ×1 | | | `width` | 2 |
| `.22s` `.6s` `0.01ms` `0.6s` | 1 each | | | | | `aspect-ratio` `filter` `height` `left` `letter-spacing` `text-shadow` `top` | 1 each |

`transition: none` ×3 (`css/21-sidebar.css:197`, `css/21-sidebar.css:2510`, `css/init-responsive.css:192`).

### 4d. Animations

Durations: `0.3s` ×6, `0.5s` ×3, `0.7s` ×2, `1s` ×2, `0.01ms` `0.18s` `0.6s` `0.8s` `1.4s` `1.6s` ×1 each. Delays: `0.1s` `0.4s` `0.6s` `0.7s` ×1 each. Easings: `ease` ×7, `cubic-bezier(0.25, 0.1, 0.25, 1)` ×4, `ease-out` ×4, `ease-in-out` ×1, `linear` ×1.

### 4e. `@keyframes` and when they run

"Runs" is the static reading of the selectors that reference each animation (static §6c); the "live" column is Chrome's rule-usage for those selectors in the C2 session (`yes` = the referencing rule applied at least once; rule-usage does not track `@keyframes` themselves).

| @keyframes | declared | steps | runs | referenced by | live (C2) |
|---|---|---|---|---|---|
| `recordPulse` | css/01-buttons.css:414 | 2 | state | `button.btn--record[aria-pressed="true"]::after, button.btn--record.active::after` 01-buttons.css:412 | never (recording not reached) |
| `borderRotate` | css/styles.css:879 | 5 | **unreferenced** |  | — |
| `glassShimmer` | css/styles.css:917 | 2 | **unreferenced** |  | — |
| `maskFadeIn` | css/mask-editor.css:25 | 2 | state | `.mask-editor-overlay` mask-editor.css:21 | never (mask editor not opened) |
| `stampMenuOpen` | css/mask-editor.css:136 | 2 | state | `.mask-stamp-menu` mask-editor.css:133 | never |
| `maskControlsSlideIn` | css/mask-editor.css:278 | 2 | state | `.layer-mask-controls` mask-editor.css:275 | never |
| `spin` | css/mask-editor.css:283 | 2 | state | `.mask-roto-busy .sam-spinner` mask-editor.css:724 | never |
| `mp-pulse` | css/21-sidebar.css:1275 | 2 | state | `.mp-dot-connecting` 21-sidebar.css:1267 | never (no room) |
| `mp-peer-touch` | css/21-sidebar.css:1478 | 2 | state | `.mp-peer-touch` 21-sidebar.css:1476 | never |
| `skip-landed` | css/22-overlays.css:2115 | 2 | state | `.skip-landed` 22-overlays.css:2114 | never |
| `recipeRingPulse` | css/22-overlays.css:2326 | 3 | state | `#recipeGuide .recipe-ring.pulse` 22-overlays.css:2325 | never (js/44 parked) |
| `palette-ring` | css/23-colour-picker.css:333 | 2 | state | `.palette-chip-wrap.is-match .palette-chip` 23-colour-picker.css:323 | never |
| `splashTitleIn` | css/init-responsive.css:131 | 2 | **boot** | `.splash-title` init-responsive.css:86 | yes |
| `splashSubIn` | css/init-responsive.css:135 | 2 | **boot** | `.splash-subtitle` init-responsive.css:103 | yes |
| `splashProgressIn` | css/init-responsive.css:139 | 2 | **boot** | `.splash-progress` init-responsive.css:119 | yes |
| `splashVersionIn` | css/init-responsive.css:145 | 2 | **boot** | `.splash-version` init-responsive.css:151 | yes |
| `fadeIn` | js/16-sam-integration.js:269 (injected) | 2 | JS | `.style.cssText` js/16-sam-integration.js:252, js/23-depth-collision.js:205 | not injected in session |
| `fadeOut` | js/16-sam-integration.js:273 (injected) | 2 | JS | `el.style.animation` js/16-sam-integration.js:347, js/23-depth-collision.js:223 | not injected in session |

Animation names referenced without a `@keyframes` in scope: none. Only the four splash keyframes run at boot; everything else is state- or interaction-driven. The three `prefers-reduced-motion` blocks (§7) cover them: the global `*` rule (`css/styles.css:1392`), `recordPulse` (`01-buttons.css:418`), `skip-landed` (`22-overlays.css:2119`).

## 5. `!important`

**76 declarations in scope**: styles.css ×10, 20-mixer-strip.css ×4, 21-sidebar.css ×8, 22-overlays.css ×46, 23-colour-picker.css ×3, init-responsive.css ×1, js/00a-boot.js ×1, js/32-file-drop.js ×2, js/47-pen-window.js ×1 (pen window, separate document). Inline `style=` attributes and JS inline strings: 0. (The README's rough count was 77 / 48 in 22-overlays; the parser finds 76 / 46.) Counted by selector rather than declaration, 84 selectors carry one (§6g).

Inside cascade layers an `!important` declaration in an earlier layer beats a later layer's normal declarations, so every row here outranks `@layer theme` unless the theme also uses `!important` or the legacy rule is retired. "Reason" is the nearest comment, when there is one. (static §7)

| where | context | selector | declaration | reason (nearest comment) |
|---|---|---|---|---|
| css/styles.css:42 |  | `body.web-mode #custom-titlebar, body.web-mode .window-resize-edge, …` | `display: none` | Browser build: no OS window, drop the titlebar and the frameless-window resize handles |
| css/styles.css:58 |  | `body.display-borderless #custom-titlebar, body.display-fullscreen #cu…` | `display: none` | Borderless / fullscreen display modes (js/36) drop the window chrome only |
| css/styles.css:213 |  | `body:not(.transparent-mode) .bg-transparency-group` | `display: none` | Display → Background Transparency only on screen while Transparent Background is ticked |
| css/styles.css:929 |  | `.hide-cursor` | `cursor: none` |  |
| css/styles.css:1302 |  | `#captureBtn.debounce` | `background: rgba(120, 255, 120, 0.5)` | Debounce feedback on capture button |
| css/styles.css:1393 | @media (prefers-reduced-motion: reduce) | `*, *::before, *::after` | `animation-duration: 0.01ms` |  |
| css/styles.css:1394 | @media (prefers-reduced-motion: reduce) | `*, *::before, *::after` | `animation-iteration-count: 1` |  |
| css/styles.css:1395 | @media (prefers-reduced-motion: reduce) | `*, *::before, *::after` | `transition-duration: 0.01ms` |  |
| css/styles.css:1396 | @media (prefers-reduced-motion: reduce) | `*, *::before, *::after` | `scroll-behavior: auto` |  |
| css/styles.css:1401 | @media (prefers-reduced-motion: reduce) | `body.photosafe-on #canvas-wrapper, body.photosafe-on #canvas-area, bo…` | `transition-duration: 0.4s` |  |
| css/20-mixer-strip.css:217 |  | `body` | `flex-direction: column` | BODY LAYOUT: column instead of row |
| css/20-mixer-strip.css:222 |  | `body > .controls` | `display: none` | Hide old sidebar, content moved to mixer strip + sidebar-right |
| css/20-mixer-strip.css:1570 |  | `.mixer-more-probe` | `visibility: hidden` | Throwaway clone measure() drops into the bar, never painted |
| css/20-mixer-strip.css:1571 |  | `.mixer-more-probe` | `pointer-events: none` | same |
| css/21-sidebar.css:933 |  | `#sidebar-right .light-source-controls` | `margin-left: 0` | Light source controls, fit in 256px width |
| css/21-sidebar.css:934 |  | `#sidebar-right .light-source-controls` | `padding: 8px` | same |
| css/21-sidebar.css:938 |  | `#sidebar-right .light-source-controls .light-grid-container` | `max-width: 200px` |  |
| css/21-sidebar.css:939 |  | `#sidebar-right .light-source-controls .light-grid-container` | `margin: 0 auto 8px` |  |
| css/21-sidebar.css:944 |  | `#sidebar-right #lightShiftControls` | `margin-left: 0` | Light shift controls |
| css/21-sidebar.css:945 |  | `#sidebar-right #lightShiftControls` | `padding: 8px` | same |
| css/21-sidebar.css:1570 |  | `:is(#sidebar-right, #sidebar-left) .control-group > div[style*="displ…` | `gap: 4px` | Settings buttons row |
| css/21-sidebar.css:2493 |  | `body.compact-ui #sidebar-right.collapsed > :not(.rsb-rail)` | `display: none` |  |
| css/22-overlays.css:18 |  | `body.focus-mode #mixer-strip, body.focus-mode #sidebar-right, body.fo…` | `display: none` | FOCUS MODE |
| css/22-overlays.css:20 |  | `body.focus-mode #mixer-more-panel` | `display: none` | The strip's More overflow panel (js/46) goes with the strip |
| css/22-overlays.css:33 |  | `body.focus-mode #custom-titlebar, body.focus-mode .window-resize-edge…` | `display: none` | Only the painting: window chrome and the underbar go too |
| css/22-overlays.css:34 |  | `body.focus-mode` | `padding-top: 0` |  |
| css/22-overlays.css:37–42 |  | `body.focus-mode #main-area` | `width: 100vw; height: 100vh; height: 100dvh; height: var(--app-height, 100dvh); padding: 0; margin: 0` (6 declarations) |  |
| css/22-overlays.css:46–52 |  | `body.focus-mode #canvas-area` | `width: 100vw; height: 100vh; height: 100dvh; height: var(--app-height, 100dvh); padding: 0; margin: 0; overflow: hidden` (7) |  |
| css/22-overlays.css:55–67 |  | `body.focus-mode #canvas-wrapper` | `position: absolute; left: 0; top: 0; width: 100vw; height: 100vh; height: 100dvh; max-width: 100vw; max-height: 100vh; max-height: 100dvh; margin: 0; padding: 0; border: none; border-radius: 0` (13) |  |
| css/22-overlays.css:70–71 |  | `body.focus-mode #canvas` | `width: 100%; height: 100%` (2) |  |
| css/22-overlays.css:1074 |  | `body.layer-transform-active .background-layer.transform-ghost` | `display: block` | Layer being transformed is forced visible above everything so hidden collision masks can be positioned by eye |
| css/22-overlays.css:1075 |  | same | `opacity: 0.65` | same |
| css/22-overlays.css:1076 |  | same | `z-index: 3000` | same |
| css/22-overlays.css:1086 |  | `body.layer-transform-active #canvas-size-display` | `opacity: 0` |  |
| css/22-overlays.css:1146 |  | `.hk-picker [hidden], .hk-picker-note[hidden]` | `display: none` | The hidden attribute has to beat the button display rules |
| css/22-overlays.css:1177 |  | `#hkBindBar [hidden]` | `display: none` |  |
| css/22-overlays.css:1633 |  | `.radial-block [hidden]` | `display: none` | Settings → Radial Menu rows with a key cap |
| css/22-overlays.css:1708 |  | `body.text-arrange-active #canvas-wrapper .resize-handle` | `pointer-events: none` | While arranging, make every other interactive layer in the canvas-area non-interactive |
| css/22-overlays.css:1714 |  | `body.text-arrange-active .layer-resize-handle, body.text-arrange-acti…` | `pointer-events: none` |  |
| css/22-overlays.css:1717 |  | `body.text-arrange-active #canvas-size-display` | `opacity: 0` |  |
| css/22-overlays.css:1862 |  | `.atv-gate-btns .audio-gate-clear` | `margin-top: 0` |  |
| css/22-overlays.css:1940 |  | `.ui-hidden` | `display: none` | The one hide rule. !important on purpose: `.sidebar-section` is a grid, `.mixer-channel` and `#mixer-strip` are flex, `#quality-underbar` is fixed |
| css/22-overlays.css:2352 |  | `#recipePill [hidden]` | `display: none` | The cap and the note are toggled with the hidden attribute; the shared `.hk-cap` display rule must not win |
| css/22-overlays.css:2679 |  | `.phone-pad-modal [hidden]` | `display: none` |  |
| css/23-colour-picker.css:16 |  | `.cp [hidden], .cp-loupe[hidden], .cp-toast[hidden], .palette-note[hid…` | `display: none` |  |
| css/23-colour-picker.css:246 |  | `body.cp-sampling #canvas-area, body.cp-sampling #canvas-area *, .cp-v…` | `cursor: crosshair` | Eyedropper |
| css/23-colour-picker.css:250 |  | `body.cp-sampling #brushCursor, body.cp-sampling #brushCursorGhost, bo…` | `visibility: hidden` |  |
| css/init-responsive.css:192 |  | `html.boot-fade.booting #splash-screen, html.boot-fade.booting #custom…` | `transition: none` | While the window is still invisible, no transition may be in flight |
| js/00a-boot.js:368 | injected `#boot-cursor-style` | `html.boot-cursor, html.boot-cursor *` | `cursor: url("__JS__") __JS__ __JS__, progress` | boot cursor; element removed after the title card |
| js/32-file-drop.js:78 | injected (no id) | `.file-drop-hover` | `outline: 2px dashed rgba(110, 200, 255, 0.85)` |  |
| js/32-file-drop.js:79 | injected (no id) | `.file-drop-hover` | `background-color: rgba(110, 200, 255, 0.08)` |  |
| js/47-pen-window.js:278 | pen window `<style>` (separate document) | `[hidden]` | `display: none` |  |

Grouped by intent: **focus mode** 32 (22-overlays.css:18–71, every one a layout reset); **`[hidden]`/`.ui-hidden` display overrides** 9 (behaviour: the hidden attribute and the UI-visibility hide must beat component display rules); **window chrome** 3 (styles.css:42, 58; 22-overlays:33); **reduced motion** 5 (styles.css:1393–1401); **mode cursors / pointer-events** 7 (`.hide-cursor`, eyedropper ×2, text-arrange ×3, boot cursor); **layout fixes** 10 (body column, `.controls`, probe ×2, light-source ×6, settings row gap, `.atv-gate-btns`); **transform ghost** 4; **colour** 3 (`#captureBtn.debounce` green, file-drop outline + background: the only `!important` colours, both hard-coded, both unreachable from a theme layer).

## 6. Specificity hot spots

2,004 selectors in the app document (style rules; keyframe steps excluded). (static §8)

### 6a. Top 25 by specificity

All but three are the compact-window strip-in-sidebar block (`css/21-sidebar.css:775–925`), where `body.compact-ui #sidebar-right > #mixer-strip …` stacks two ids on every rule.

| specificity (a,b,c) | selector | where |
|---|---|---|
| 2,4,1 | `body.compact-ui #sidebar-right > #mixer-strip .ch-wide .ch-color-head:empty` | css/21-sidebar.css:850 |
| 2,4,1 | `body.compact-ui #sidebar-right > #mixer-strip .ch-wide .ch-toggle-row .ch-text-toggle` | css/21-sidebar.css:885 |
| 2,3,2 | `body.compact-ui #sidebar-right > #mixer-strip .ch-wide input[type="color"]` | css/21-sidebar.css:864 |
| 2,3,2 | `body.compact-ui #sidebar-right > #mixer-strip .mixer-actions .transport-row button` | css/21-sidebar.css:912 |
| 2,3,1 | `body.compact-ui #sidebar-right > #mixer-strip .mixer-channel.ch-wide` | css/21-sidebar.css:822 |
| 2,3,1 | `… .ch-wide .ch-seg-switch` / `.ch-toggle-row` ×2 / `.ch-color-head` / `.ch-nudge-row` / `.ch-color-input` / `.ch-nudge-btn` / `.ch-ignite-lock` | css/21-sidebar.css:842, 845, 853, 854, 863, 864, 871, 876 |
| 2,3,1 | `… .mixer-actions .transport-row` / `.mixer-stack .mixer-actions` | css/21-sidebar.css:903, 925 |
| 2,3,0 | `#sidebar-right #layersPanel.layers-dragging .drop-zone.drag-over` | css/init-responsive.css:607 |
| 2,2,2 | `body.compact-ui #sidebar-right > #mixer-strip .mixer-actions button` / `> button` | css/21-sidebar.css:906, 915 |
| 2,2,1 | `#mixer-strip .mixer-actions #pauseBtn.active::before` | css/20-mixer-strip.css:687 |
| 2,2,1 | `body.compact-ui #sidebar-right > #mixer-strip .mixer-channel` / `.mixer-divider` / `.mixer-presets` / `.mixer-presets-channel` / `.mixer-presets-trigger` / `.mixer-actions` | css/21-sidebar.css:786, 796, 804, 804, 809, 895 |

### 6b. Ids in selectors

**429 selectors carry an id**: 01-buttons.css ×6, styles.css ×52, slider-styles.css ×2, mask-editor.css ×5, 20-mixer-strip.css ×56, 21-sidebar.css ×102, 22-overlays.css ×107, 23-colour-picker.css ×6, 24-palette-from-image.css ×3, init-responsive.css ×70, index.html ×20. Layer order beats specificity, so an id in `legacy` does not by itself outrank `@layer theme`; it matters where a theme rule is unlayered or lands in the same layer, and for any legacy rule the theme keeps rather than replaces. The full per-selector list (429 rows with specificity) is in static §8b.

| id | selectors | | id | selectors | | id | selectors |
|---|---|---|---|---|---|---|---|
| `#sidebar-right` | 124 | | `#hkWheel` | 5 | | `#mpDisconnected` | 2 |
| `#mixer-strip` | 51 | | `#layersPanel` | 5 | | `#presetPathToast` | 2 |
| `#quality-underbar` | 42 | | `#canvas` | 3 | | `#pwContinue` | 2 |
| `#photoWarn` | 20 | | `#canvas-size-display` | 3 | | `#radialMenu` | 2 |
| `#canvas-area` | 18 | | `#customCursor` | 3 | | `#radialNote` | 2 |
| `#sidebar-left` | 18 | | `#paletteExtractHost` | 3 | | `#recMiniPauseBtn` | 2 |
| `#captureArea` | 11 | | `#pathDrawOverlay` | 3 | | `#recMiniRecordBtn` | 2 |
| `#custom-titlebar` | 10 | | `#pathTransformOverlay` | 3 | | `#sidebarPresetList` | 2 |
| `#layerTransformOverlay` | 8 | | `#pauseBtn` | 3 | | `#touchUpTools` | 2 |
| `#recipeGuide` | 8 | | `#recipeSearch` | 3 | | 40 ids used once | 40 |
| `#brushTypePill` | 7 | | `#text-arrange-bar` | 3 | | | |
| `#canvas-wrapper` | 7 | | `#breathCue` | 2 | | | |
| `#mixer-more-panel` | 7 | | `#focus-mode-hint` | 2 | | | |
| `#splash-screen` | 7 | | `#hkToast` | 2 | | | |
| `#audioDrawerPanel` | 6 | | `#hotkeyOverlay` | 2 | | | |
| `#recipePill` | 6 | | `#kaleidoPanel` | 2 | | | |
| `#hkBindBar` | 5 | | `#lightShiftControls` | 2 | | | |
| | | | `#main-area` | 2 | | | |

Ids used once: `#audioSceneControls` `#brushCursor` `#brushCursorGhost` `#brushCursorGhostClip` `#brushDabIntervalValue` `#brushGhostOpacity` `#brushGhostOpacityValue` `#brushSteadyValue` `#captureBtn` `#colorBar` `#colorBlend` `#colorBlendPerceptual` `#filterPickBtn` `#layerTransformCanvas` `#layerTransformDone` `#layers-container` `#maskZoomLevel` `#mixer-brushValue` `#multiArtistPanel` `#multiplierValue` `#mutation-section` `#pathDrawCancel` `#pathDrawCanvas` `#pathDrawDone` `#pathLayersList` `#pathTransformCancel` `#pathTransformCanvas` `#pathTransformDone` `#recDrawer` `#recMiniStopBtn` `#rippleCanvas` `#settingsPanel` `#settingsToggleBtn` `#slowdownBtn` `#statsPanel` `#text-arrange-canvas` `#textArrangeDone` `#touchUpDespeckBtn` `#trailCanvas`.

`#sidebar-right` (124) and `:is(#sidebar-right, #sidebar-left)` are the scoping idiom of `css/21-sidebar.css` and `css/init-responsive.css:314–636` (the Layers panel): every theme rule for a sidebar control has to beat (1,n,m), which layer order handles for free, but any legacy rule kept alongside keeps that weight.

### 6c. Chains of 4+ compounds (42)

| compounds | where | selector |
|---|---|---|
| 6 | css/21-sidebar.css:885 | `body.compact-ui #sidebar-right > #mixer-strip .ch-wide .ch-toggle-row .ch-text-toggle` |
| 6 | css/21-sidebar.css:912 | `body.compact-ui #sidebar-right > #mixer-strip .mixer-actions .transport-row button` |
| 5 | css/21-sidebar.css:308 | `:is(#sidebar-right, #sidebar-left) .control-group label select.material-mode-select option` |
| 5 | css/21-sidebar.css:842–925 (14 rules) | `body.compact-ui #sidebar-right > #mixer-strip .ch-wide …` ×11, `… .mixer-actions .transport-row`, `… .mixer-actions button`, `… .mixer-actions > button`, `… .mixer-stack .mixer-actions` |
| 5 | css/21-sidebar.css:2391 | `#sidebar-left .lsb-steady > .control-group > label .value-display` |
| 4 | css/20-mixer-strip.css:668 | `#mixer-strip .mixer-actions .transport-row #pauseBtn` |
| 4 | css/20-mixer-strip.css:1110 | `.arm-colors-panel .control-group label .value-display` |
| 4 | css/21-sidebar.css:224 | `:is(#sidebar-right, #sidebar-left) .control-group label .value-display` |
| 4 | css/21-sidebar.css:251 | `:is(#sidebar-right, #sidebar-left) .control-group label .hk-cap:first-of-type:last-child`, `… label > .hk-cap:only-of-type` |
| 4 | css/21-sidebar.css:260, 293, 297, 302 | `:is(#sidebar-right, #sidebar-left) .control-group label select.material-mode-select` (+ `:hover`, `:focus`, `:focus-visible`) |
| 4 | css/21-sidebar.css:308 | `.mixer-channel .ch-label select.material-mode-select option` |
| 4 | css/21-sidebar.css:786, 796, 804 ×2, 809, 822, 895, 920 | `body.compact-ui #sidebar-right > #mixer-strip .mixer-channel` / `.mixer-divider` / `.mixer-presets` / `.mixer-presets-channel` / `.mixer-presets-trigger` / `.mixer-channel.ch-wide` / `.mixer-actions` / `.mixer-stack` |
| 4 | css/21-sidebar.css:1042, 1045 | `#sidebar-right .anim-grid button div:first-child` / `div:last-child` |
| 4 | css/21-sidebar.css:2214 | `:is(#sidebar-right, #sidebar-left) .control-group .pen-screen input[type="radio"]` |
| 4 | css/21-sidebar.css:2385 | `#sidebar-left .lsb-steady > .control-group > label` |
| 4 | css/21-sidebar.css:2525, 2526 | `#sidebar-left .sidebar-section .ch-fader .fader-stack` / `… .ch-fader input[type="range"]` |

### 6d. `:not()` stacks

Selectors with 2+ `:not()`: **none**. Selectors with any `:not()`: 14 (e.g. `body:not(.transparent-mode) .bg-transparency-group` styles.css:213, `#layersPanel.layers-dragging .layer-item-collapsible:not(.dragging)` styles.css:791, `.arm-tip-btn.menu-open:not(.active)` 01-buttons.css:319, `body.compact-ui #sidebar-right.collapsed > :not(.rsb-rail)` 21-sidebar.css:2493, `#quality-underbar:not(.qub-shading) .qub-dd-shade` 20-mixer-strip.css:145, `.mask-mode-toggle label:not(:has(input:checked))` mask-editor.css:120, `.hk-step.is-now:not(.is-done) .hk-step-n` 22-overlays.css:1204).

### 6e. Universal `*` selectors (8)

| where | context | selector | declarations |
|---|---|---|---|
| css/styles.css:1 |  | `*` | `margin: 0; padding: 0; box-sizing: border-box` |
| css/styles.css:1392 | @media (prefers-reduced-motion: reduce) | `*`, `*::before`, `*::after` | `animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important` |
| css/mask-editor.css:83 |  | `.mask-editor-controls > *` | `flex-shrink: 0` |
| css/20-mixer-strip.css:42 |  | `#quality-underbar > *` | `pointer-events: auto` |
| css/23-colour-picker.css:244 |  | `body.cp-sampling #canvas-area *` | `cursor: crosshair !important` |
| js/00a-boot.js:368 | injected | `html.boot-cursor *` | `cursor: url("__JS__") __JS__ __JS__, progress !important` |

The reset at `css/styles.css:1` is the only unscoped `*` outside a media query; it is what prep step 1's `@layer reset` would hold.

### 6f. Attribute selectors on ARIA state, already present (11 selectors)

| where | ARIA attribute | selector |
|---|---|---|
| css/01-buttons.css:148 | `[aria-pressed="true"]` | `button[aria-pressed="true"]`, `.btn[aria-pressed="true"]` |
| css/01-buttons.css:180 | `[aria-disabled="true"]` | `.btn[aria-disabled="true"]` |
| css/01-buttons.css:386, 397 | `[aria-pressed="true"]` | `button.btn--record[aria-pressed="true"]` |
| css/01-buttons.css:402, 419 | `[aria-pressed="true"]` | `button.btn--record[aria-pressed="true"]::after` (419 under reduced-motion) |
| css/21-sidebar.css:1326 | `[aria-checked="true"]` | `.mp-room-menu .mp-menu-item[aria-checked="true"]::before` |
| css/22-overlays.css:1437 | `[aria-expanded="true"]` | `.hk-list-trigger[aria-expanded="true"] .hk-list-trigger-chev` |
| css/22-overlays.css:1963 | `[aria-expanded="true"]` | `.ui-vis-trigger[aria-expanded="true"] .ui-vis-trigger-chev` |
| css/22-overlays.css:2103 | `[aria-disabled="true"]` | `.skip-menu-option[aria-disabled="true"]` |

Every one of these pairs with a class twin (`.btn.active`, `.btn--record.active`) except the two chevrons and the skip-menu row. Nothing styles `[aria-expanded]` on `.section-title` (33 JS writes of `aria-expanded`, README): section open/closed is styled through `.collapsed` today. Other attribute hooks CSS already styles through: `[data-group]` ×7, `[data-step]` ×2, `[data-export-clock]`, `[data-layer-type]`, `[data-mirror]`, `[data-raster]`, `[data-tab]`, `[data-tone]`, `[data-variant]` ×1 each. `data-ui-key` is a script contract (README); **`data-ui` is unused today**, so prep step 4 can take it.

### 6g. Rules that would fight `@layer theme`

Rules carrying `!important` (the real fight: **84 selectors**, §5) and rules with ids (**429 selectors**, §6b; a fight only if the theme rule is unlayered or shares the layer). Union: **474 selectors**. Plus the unlayered sources in §9, which beat every layer regardless.

## 7. Media, container and supports queries

(static §9; live "Enclosing conditions seen")

| query | blocks | rules | applies at 1600×900 / DPR 1 (C2) |
|---|---|---|---|
| `@media (pointer: coarse)` | 5 | 8 | no |
| `@media (prefers-reduced-motion: reduce)` | 3 | 4 | no |
| `@media (max-width: 800px)` | 1 | 5 | no |
| `@media (max-width: 640px)` | 1 | 4 | no |
| `@media (max-width: 600px)` | 1 | 1 | no |
| `@media (max-width: 520px)` | 1 | 2 | no |
| `@container underbar (max-width: 820px)` | 1 | 1 | not evaluated |
| `@container underbar (max-width: 700px)` | 1 | 1 | not evaluated |
| `@container underbar (max-width: 680px)` | 1 | 1 | not evaluated |
| `@container underbar (max-width: 560px)` | 1 | 1 | not evaluated |
| `@container (max-width: 200px)` | 1 | 3 | not evaluated |
| `@supports (background-image: linear-gradient(in oklch, red, blue))` | 1 | 1 | yes |

**`prefers-reduced-motion`: 3 blocks. `forced-colors`: 0. `prefers-color-scheme`: 0. `pointer: coarse`: 5.** No `@layer`, no `@import`.

| block | where | rules |
|---|---|---|
| `(prefers-reduced-motion: reduce)` | css/01-buttons.css:418 | 419 `button.btn--record[aria-pressed="true"]::after, button.btn--record.active::after` → `animation: none; opacity: 0.5` |
| `(prefers-reduced-motion: reduce)` | css/styles.css:1391 | 1392 `*, *::before, *::after` → the four `!important` resets; 1398 `body.photosafe-on #canvas-wrapper, body.photosafe-on #canvas-area, …` → `transition-duration: 0.4s !important` (PhotoSafe keeps its fade) |
| `(prefers-reduced-motion: reduce)` | css/22-overlays.css:2119 | 2120 `.skip-landed` → `animation: none` |
| `(pointer: coarse)` | css/slider-styles.css:221 | 222 `input[type="range"]` → `min-height: 28px; --thumb-w: 28px`; 229 `.encapsulated-slider` → `min-height: 28px` |
| `(pointer: coarse)` | css/20-mixer-strip.css:1125 | 1126 `.arm-colors-panel .control-group input[type="range"]` → `--input-py: 11px` |
| `(pointer: coarse)` | css/21-sidebar.css:245 | 246 `:is(#sidebar-right, #sidebar-left) .control-group input[type="range"]` → `--input-py: 11px` |
| `(pointer: coarse)` | css/21-sidebar.css:1943 | 1944 `#audioDrawerPanel input[type="range"]` → `--input-py: 11px` |
| `(pointer: coarse)` | css/22-overlays.css:1822 | 1823–1825 `.atv-rz-s` / `.atv-rz-w, .atv-rz-e` / `.atv-rz-nw, .atv-rz-ne, .atv-rz-sw, .atv-rz-se` → larger resize grips (14/28 px) |
| `(max-width: 800px)` | css/21-sidebar.css:751 | 752 `#mixer-strip` min-height 80px; 755 `.mixer-channel` min-width 60px, padding; 759 `.ch-label` 7px; 760 `.ch-value` 9px; 761 `#sidebar-right` flex 0 0 240px |
| `(max-width: 640px)` | css/22-overlays.css:2274 | 2275 `.recipe-body` 1fr; 2276 `.recipe-results` max-height 34vh; 2277 `.recipe-row .hk-cap` none; 2278 `.recipe-foot-keys` none |
| `(max-width: 600px)` | css/22-overlays.css:2035 | 2036 `.ui-fork-cards` → `grid-template-columns: 1fr` |
| `(max-width: 520px)` | css/22-overlays.css:2681 | 2682 `.phone-pad-body` column; 2683 `.phone-pad-qr` margin auto |
| `@container underbar (max-width: 700px)` | css/20-mixer-strip.css:137 | 138 `#quality-underbar > .qub-size` → `display: none` |
| `@container underbar (max-width: 820px)` | css/20-mixer-strip.css:140 | 141 `#quality-underbar.qub-shading > .qub-size` → `display: none` |
| `@container underbar (max-width: 560px)` | css/20-mixer-strip.css:156 | 157 `#quality-underbar .qub-dd-btn .hk-cap` → `display: none` |
| `@container underbar (max-width: 680px)` | css/20-mixer-strip.css:159 | 160 `#quality-underbar.qub-shading .qub-dd-btn .hk-cap` → `display: none` |
| `@container (max-width: 200px)` | css/init-responsive.css:572 | 573 `#sidebar-right .layer-prop` wrap; 577 `… .layer-prop-label` full width; 581 `… .layer-prop select` flex 1 |
| `@supports (… in oklch …)` | css/21-sidebar.css:180 | 181 `.sidebar-section[data-group] .section-title` → the per-group nav gradient (`--g`, `--rows`, `--row-h`) |

The breakpoints are small-window fallbacks for the demo and phone-pad modal; the shipping desktop layout (`body.compact-ui`, the More panel) is driven by JS classes, not media queries, so the audit's single viewport never saw them (§10).

## 8. Custom properties

**96 custom properties declared in CSS (131 declarations), 68 distinct names read via `var()` (506 reads), 11 names written from JS via `style.setProperty('--…')` (83 call sites).** At run time (C2): 67 names have a value on `:root` after boot, **313 distinct writers observed** (phase × name × target × file:line), **none per frame**. (static §10, live "Custom properties written at runtime")

### 8a. Per-section hue variables

`--sec-h` / `--sec-c` are declared at `css/01-buttons.css:29–30` (`:root`) and overridden per group at `css/01-buttons.css:43` `[data-group="core"]`, `:44` `[data-group="expressive"]`, `:45` `[data-group="system"]`; `--sec-h` is read 68 times (01-buttons ×47, 21-sidebar ×18, 22-overlays ×3), `--sec-c` 30 times (01-buttons ×29, 22-overlays ×1). They are what `auditButtons()` means by "reads its colour from the section tokens" (§12), and the one existing mechanism that already does what prep step 2 wants: a role token whose value changes by scope. The companion nav-gradient set `--g-core` / `--g-expressive` / `--g-system` (`css/21-sidebar.css:166–168`) and `--g` (`:173–175`) with `--rows` / `--row-h` / `--row-pad` (`:164–165`, JS-written `--rows`/`--i`) drive the section-title stripe under the `@supports` block.

### 8b. Every custom property (condensed: declared, read, written)

Full table with the "read in" file breakdown: static §10a.

| property | CSS decls | declared at | var() reads | JS writes (file:line) | note |
|---|---|---|---|---|---|
| `--accent` | 1 | 00-tokens.css:16 | 16 |  |  |
| `--accent-12` / `-25` / `-40` | 3 | 00-tokens.css:18–20 | 0 |  | never read |
| `--accent-60` | 1 | 00-tokens.css:17 | 1 |  |  |
| `--accent-cool` / `--accent-cool-soft` | 2 | 00-tokens.css:23–24 | 0 |  | never read |
| `--app-height` | 0 | — | 2 | js/01-config.js:1557 (`:root`) | JS-only |
| `--bg-app` / `--bg-panel-2` / `--bg-raised` / `--bg-raised-hover` | 4 | 00-tokens.css:55–59 | 0 |  | never read |
| `--bg-inset` / `--bg-panel` | 2 | 00-tokens.css:56, 60 | 1 / 1 |  |  |
| `--border-default` / `--border-strong` | 2 | 00-tokens.css:64–65 | 1 / 1 |  |  |
| `--border-subtle` | 1 | 00-tokens.css:63 | 6 |  |  |
| `--btn-pad-x` / `--btn-pad-y` | 7 / 7 | 01-buttons.css:94, 99, 106–107 (`.btn-sm`, `.btn-lg`, `.btn-icons` …) | 1 / 1 |  | button size variants |
| `--btn-size` | 6 | 01-buttons.css:94, 99; 21-sidebar.css:1139 | 1 |  |  |
| `--c` | 2 | 01-buttons.css:58 `button, .btn`; :247 `.brush-radio-row` | 17 |  | per-button colour |
| `--chrome-0` / `--chrome-1` | 2 | 00-tokens.css:44–45 | 3 / 3 |  |  |
| `--danger` | 1 | 00-tokens.css:50 | 2 |  |  |
| `--fill-l` / `--fill-r` | 1 / 1 | slider-styles.css:109–110 `#colorBlend::-webkit-slider-container, …` | 2 / 2 |  | bipolar slider fill |
| `--font-lg` / `--font-md` / `--font-xl` | 3 | init-responsive.css:13–15 | 0 |  | never read |
| `--font-sm` / `--font-xs` | 2 | init-responsive.css:12, 11 | 4 / 22 |  |  |
| `--font-mono` / `--font-ui` | 2 | 00-tokens.css:86, 85 | 1 / 5 |  |  |
| `--g` | 3 | 21-sidebar.css:173–175 `.sidebar-section[data-group=…] .se…` | 1 |  |  |
| `--g-core` / `--g-expressive` / `--g-system` | 3 | 21-sidebar.css:166–168 `#sidebar-right, #sidebar-left` | 1 each |  |  |
| `--ground-500` … `--ground-950` | 6 | 00-tokens.css:27–32 | 37 / 7 / 6 / 6 / 8 / 12 |  |  |
| `--heat-0` / `--heat-1` | 2 | 00-tokens.css:40–41 | 2 / 2 |  |  |
| `--i` | 0 | — | 1 (21-sidebar) | js/20-mixer-layout.js:2666, js/43-ui-visibility.js:293 (on `.sidebar-section`) | JS-only; **name the theme plans for brightness** |
| `--ink-100` / `--ink-300` / `--ink-500` | 3 | 00-tokens.css:35–37 | 42 / 35 / 37 |  |  |
| `--input-h` / `--input-w` | 1 / 1 | slider-styles.css:37, 34 `input[type=range]` | 1 / 2 |  |  |
| `--input-px` | 2 | slider-styles.css:35; 20-mixer-strip.css:347 | 5 |  |  |
| `--input-py` | 8 | slider-styles.css:36; 20-mixer-strip.css:358, 1123; 21-sidebar.css:246, 1944 … | 3 |  | coarse-pointer overrides |
| `--js` | 1 | slider-styles.css:13 `.js` | 2 |  |  |
| `--layer-cap-col` / `--layer-ctl-col` | 1 / 1 | init-responsive.css:416–417 `#sidebar-right .layer-item` | 2 / 3 |  |  |
| `--max` / `--min` | 1 / 1 | slider-styles.css:20, 19 `input[type=range]` | 2 / 3 | js/06-slider-updater.js:15, 14; js/20-mixer-layout.js:5001/5000, 5243/5242, 6433/6432 | slider fill |
| `--mp-peer` | 0 | — | 2 (21-sidebar) | js/06e-mp-panel.js:376 | JS-only; player colour |
| `--ok` | 1 | 00-tokens.css:48 | 7 |  |  |
| `--peer` | 1 | 21-sidebar.css:1521 `.remote-cursor` | 2 | js/06e-mp-panel.js:171 | player colour |
| `--pos` | 1 | slider-styles.css:28 `input[type=range]` | 3 |  | derived from `--val` |
| `--radius-sm` / `-md` / `-lg` | 3 | 00-tokens.css:80–82 | 0 |  | never read, all `0` |
| `--rng` | 1 | slider-styles.css:22 | 0 |  | never read |
| `--row-h` / `--row-pad` | 1 / 1 | 21-sidebar.css:164–165 | 2 / 1 |  |  |
| `--rows` | 0 | — | 1 (21-sidebar) | js/20-mixer-layout.js:2665, js/43-ui-visibility.js:292 | JS-only |
| `--sec-c` / `--sec-h` | 4 / 4 | 01-buttons.css:29–30, 43–45 | 30 / 68 |  | §8a |
| `--sidebar-width` | 1 | init-responsive.css:9 | 0 | js/20-mixer-layout.js:227 (`:root`) | written, never read in CSS |
| `--sp-1` … `--sp-5` | 5 | 00-tokens.css:73–77 | 0 |  | never read |
| `--space-xs` / `-sm` / `-md` / `-lg` | 4 | init-responsive.css:16–19 | 0 / 1 / 0 / 0 |  | three never read |
| `--ss-frame-ratio` | 0 | — | 1 (21-sidebar) | js/04d-anim-ascend-star.js:475 | JS-only |
| `--strip-h` | 1 | init-responsive.css:10 | 0 |  | never read |
| `--text-dim` / `--text-secondary` | 2 | 00-tokens.css:70, 69 | 2 / 6 |  |  |
| `--text-primary` | 1 | 00-tokens.css:68 | 0 |  | never read |
| `--thumb-h` / `--thumb-w` | 1 / 2 | slider-styles.css:49, 50 (+ :227 coarse) | 3 / 2 |  |  |
| `--track-g` / `--track-h` / `--track-ticks` / `--track-w` | 4 | slider-styles.css:42, 39, 46, 38 | 2 / 4 / 3 / 1 |  |  |
| `--ui-scale` | 1 | init-responsive.css:8 | 39 (init-responsive ×32, 22-overlays ×4, 21-sidebar ×2, styles ×1) | js/20-mixer-layout.js:181 (`:root`) | §11 |
| `--val` | 1 | slider-styles.css:21 `input[type=range]` | 1 | 65 call sites (js/05h-slider-bindings.js ×21, js/20-mixer-layout.js ×21, js/05f-kaleido-controls.js ×5, js/06-slider-updater.js ×4 …) | slider fill |
| `--warn` | 1 | 00-tokens.css:49 | 10 |  |  |
| `--z-canvas` / `-ui` / `-overlay` / `-modal` / `-toast` / `-splash` | 6 | 00-tokens.css:89–94 | 0 |  | never read; 115 z-index literals in the CSV instead |

Never read anywhere: 24 tokens (§2c) + `--font-lg/md/xl`, `--space-xs/md/lg`, `--strip-h`, `--rng` = **32 of 96**. `--sidebar-width` is written by JS and read by nothing in CSS.

### 8c. Written from JS (`style.setProperty('--…')` grep, static §10b)

| property | call sites | where |
|---|---|---|
| `--val` | 65 | js/04f-canvas-actions.js:123, js/05d-input-replay.js:1978, js/05e-effect-controls.js:434, js/05f-kaleido-controls.js:49, 55, 67, 151, 166, js/05h-slider-bindings.js:379, 402, 428, 465, 49… (21 in 05h, 21 in js/20, 4 in js/06, 3 in js/13, 4 in js/14, 4 in js/29 …) |
| `--max` / `--min` | 4 / 4 | js/06-slider-updater.js:15 / :14, js/20-mixer-layout.js:5001 / :5000, :5243 / :5242, :6433 / :6432 |
| `--i` / `--rows` | 2 / 2 | js/20-mixer-layout.js:2666 / :2665, js/43-ui-visibility.js:293 / :292 |
| `--app-height` | 1 | js/01-config.js:1557 (`:root`) |
| `--mp-peer` | 1 | js/06e-mp-panel.js:376 |
| `--peer` | 1 | js/06e-mp-panel.js:171 |
| `--sidebar-width` | 1 | js/20-mixer-layout.js:227 (`:root`, while dragging the sidebar handle) |
| `--ss-frame-ratio` | 1 | js/04d-anim-ascend-star.js:475 |
| `--ui-scale` | 1 | js/20-mixer-layout.js:181 (`:root`, on resize and DPR change) |

`js/44-recipes.js` (not referenced by `index.html`) also carries a `--val` writer and inline-style writers; it is counted in the grep but never loads.

### 8d. Observed at run time (C2's `setProperty` hook, phase × writer)

| phase | writes | names |
|---|---|---|
| boot (load → splash gone) | 385 | `--app-height` ×1 (js/01:1557, `:root`, `805px`); `--ui-scale` ×1 (js/20:181, `:root`, `1`); `--i` ×31 and `--rows` ×31 on `.sidebar-section` (js/43:293/292 ×17, js/20:2666/2665 ×14, **two writers for the same properties**); `--min`/`--max`/`--val` ×94 each on 89 sliders (js/06:14–16) + js/20:5000–5002 ×3, :5242–5244 ×2; `--ss-frame-ratio` ×5 on `#ssOriginFrame` (js/04d:475); `--val` on the 4 `.ch-perceptual` proxies ×12 (js/20:1101) and the 7 light-source / light-shift sliders ×1 each (js/13:323, 328, 333; js/14:623, 628, 633, 638) |
| idle (~0.3–0.6 s windows) | 1 + 1 | `--val` on `#brushSizePerceptual` (js/20:1101), the 250 ms `startPerceptualFaderPoll` (js/20:1113–1118) re-seating a proxy thumb after boot |
| sections (opening all 17) | 41 | `--ss-frame-ratio` ×2 (js/04d:475), `--val` ×39 on `#brushSizePerceptual` (js/20:1101) |
| f1 / radial / picker / presets | 3 each | `--val` on `#brushSizePerceptual` (js/20:1101) |
| stroke (24-step trusted drag on the canvas) | 5 | `--val` on `#brushSizePerceptual` (js/20:1101) |
| slider (`#curl` 0 → 45, `input` + `change`) | 4 | `--val` on `#curl` ×2 (js/06-slider-updater.js:23) + proxy ×2 |
| slider-restore | 3 | `--val` on `#curl` ×2 (js/06:23) + proxy ×1 |

Computed values that changed: after the stroke **0** on `:root`, `body`, `#mixer-strip`, the fader, `#sidebar-right`, a section; after the slider move **2**, both on `#curl` (`--val` 0 → 45, `--pos` recomputed). **Nothing writes a custom property per frame**; the only unprompted writer is the 250 ms poll, which writes only when a perceptual proxy disagrees with its canonical slider by more than half a step (`reflect`, js/20:1091–1102). For prep step 5, the existing code paths that run on a control's state change are the slider path (`js/06-slider-updater.js:23`), the perceptual proxy (`js/20:1101`), the section entrance stagger (`js/20:2665–2666`, `js/43:292–293`) and the player-colour writers (`js/06e:171, 376`, not reached without a room).

## 9. Unlayered and injected styles

Once the app CSS moves into `@layer legacy` (prep step 1), any unlayered stylesheet beats it regardless of specificity, and an inline `style` attribute beats every layer. (static §11)

### 9a. Stylesheets outside the 12 linked files

| where | block | standing | rules | decls | !important | note |
|---|---|---|---|---|---|---|
| js/00a-boot.js:368–369 | `#boot-cursor-style` | unlayered in the app document, **removed after the title card** (`stopCursor`) | 1 | 1 | 1 | `html.boot-cursor, html.boot-cursor *` → `cursor: url("…") … , progress !important` |
| js/32-file-drop.js:77–79 | (no id) `.file-drop-hover` | unlayered in the app document, **appended at load, never removed** | 1 | 3 | 2 | `outline: 2px dashed rgba(110, 200, 255, 0.85) !important; outline-offset: -2px; background-color: rgba(110, 200, 255, 0.08) !important` (hard-coded blue the theme cannot reach) |
| js/16-sam-integration.js:268–277 | `#samModalStyles` | unlayered in the app document, **added on first SAM modal, never removed** | 0 | 4 | 0 | `@keyframes fadeIn` / `fadeOut` only; also referenced by js/23-depth-collision.js:205, 223, which does not inject it |
| js/47-pen-window.js:275–316 | pen window `<style>` | **separate document** (`window.open`), not in the app cascade | 28 | 146 | 1 | whole stylesheet of the pen window: `html,body` `#stage` `#box` `#mirror` `#blank` `#ghost` `#ghostArms` `#ring` `#bar` (+ `.idle`, `b`, `.grow`, `label`, `select,button`, `:hover`, `:focus`, `input[type=checkbox]`) `.guide` `#guidesMenu` (+ `label`, `input`, `b`, `small`); 26 colour literals / 16 unique (`#000`, `#0b0e13`, `#cfd6e0`, `#e8ecf2`, `#9aa6b8`, `#78b4ff`, `rgba(255,255,255,0.07/0.13/0.16)` …), its own `system-ui` font stack; full rule list static §11 |
| index.html:249–301 | `#photoWarn` inline `<style>` | unlayered in the app document, **after the 12 links** | 20 | 80 | 0 | PhotoSafe dialog; first painted frame, deliberately independent of `css/`; exempt in `auditButtons()`; 20 selectors all carry `#photoWarn` (static §8b) |

Live after boot the page holds 14 sheets: the 12 `css/` files, the js/32 block and the `index.html` block (`#boot-cursor-style` is already gone, `#samModalStyles` not yet injected).

### 9b. Inline `style=""` attributes in `index.html`, by surface

**130 inline style attributes**; 128 sit in the static `.controls` panel that `js/20-mixer-layout.js` re-parents at boot, so they travel with the nodes into the strip and sidebars. 20 are only `display:none` initial states that script flips; the rest are spacing (`margin` ×37, `margin-top` ×32, `width` ×25, `font-size` ×13, `margin-bottom` ×11, `background` ×10, `border-radius` ×8 …). (static §11a)

| surface | style= attrs | of which only display:none | properties set | lines |
|---|---|---|---|---|
| `#splash-screen` | 1 | 0 | bottom, font-size, opacity, position, right | 522 |
| `#canvas-area` | 1 | 1 | display | 581 |
| `.controls` | 128 | 20 | margin ×37, margin-top ×32, display ×30, width ×25, font-size ×13, margin-bottom ×11, background ×10, border-radius ×8, … | 641–1591 |

By the nearest ancestor with an id inside `.controls` (the group the node ends up in), the dense pockets are: no id ancestor 43 (26 `label`s and 13 `.control-group`s with `margin` / `margin-top`); `#lightSourceControls` 3 + `#lightMode` 1 + `#lightGridContainer` 5 + `#lightDot` 1 + `#lightSpeedControl` 1 (index.html:1241–1257); `#lightShiftControls` 6 + `#lightShiftWheel` 1 + `#lightShiftMode` 1 + `#clearLightShiftPath` 1 (1284–1330); `#mandalaPanel` 5; the preset rows `#userPresetsList` … `#openPresetsFolderBtn` 11 (1372–1387); the animation buttons `#jellyfishBtn` / `#portalBtn` / `#chimeraBtn` 3 each (1485–1496); the multiplayer `display:none` set `#multiplayerToggle` `#mpError` `#reconnectBtn` `#mpConnected` `#mpActivity` `#roomQr` `#lockRoomBtn` (1389–1478); single `width`/`flex`/`display` attributes on `#saveSettingsBtn` `#loadSettingsBtn` `#clearSettingsBtn` `#pauseBtn` `#freezeBtn` `#captureBtn` `#uploadBtn` `#imageUpload` `#recKeepRow` and others (full 60-row table static §11a).

**53 attributes carry a colour / font / radius / shadow / z-index literal** (the ones a theme cannot reach from CSS):

| line | element | category | property | value |
|---|---|---|---|---|
| 522 | `div.splash-version` | font-size | `font-size` | `11px` |
| 1241 | `div#lightSourceControls` | colour ×2, radius | `background` / `border-left` / `border-radius` | `rgba(100, 150, 255, 0.05)` / `rgba(100, 150, 255, 0.3)` / `4px` |
| 1243 | `label` | font-size | `font-size` | `12px` |
| 1244 | `select#lightMode` | colour ×3, radius | `background` / `border` / `color` / `border-radius` | `rgba(0,0,0,0.3)` / `rgba(100,150,255,0.3)` / `white` / `4px` |
| 1249 | `div#lightGridContainer` | colour ×3, radius | `background` ×2 / `border` / `border-radius` | `rgba(20, 30, 50, 0.5)` `rgba(30, 20, 50, 0.5)` / `rgba(100, 150, 255, 0.3)` / `4px` |
| 1251–1252 | `div.grid-line` ×2 | colour | `background` | `rgba(100, 150, 255, 0.15)` |
| 1254 | `div#lightDot` | colour ×6, radius, shadow, z-index | `background` ×4 / `border` / `box-shadow` / `border-radius` / `z-index` | `rgba(255, 200, 50, 0.6)` `rgba(255, 220, 100, 0.9)` `rgba(255, 255, 200, 1)` `transparent` / `rgba(255, 255, 255, 0.8)` / `0 0 8px rgba(255, 255, 200, 0.8)` / `50%` / `10` |
| 1284 | `div#lightShiftControls` | colour ×2, radius | `background` / `border-left` / `border-radius` | `rgba(255, 150, 100, 0.05)` / `rgba(255, 150, 100, 0.3)` / `4px` |
| 1286 | `label` | colour, font-size | `color` / `font-size` | `rgba(255, 255, 255, 0.7)` / `11px` |
| 1289 | `canvas#lightShiftWheel` | colour, radius | `border` / `border-radius` | `rgba(255, 150, 100, 0.3)` / `4px` |
| 1292 | `label` | font-size | `font-size` | `12px` |
| 1293 | `select#lightShiftMode` | colour ×3, radius | `background` / `border` / `color` / `border-radius` | `rgba(0,0,0,0.3)` / `rgba(255,150,100,0.3)` / `white` / `4px` |
| 1377 | `input#userPresetNameInput` | colour ×3, radius, font-size | `background` / `border` / `color` / `border-radius` / `font-size` | `rgba(255,255,255,0.1)` / `rgba(255,255,255,0.2)` / `white` / `4px` / `11px` |
| 1381 | `div#userPresetStatus` | colour, font-size | `color` / `font-size` | `#3fb950` (= `--ok`) / `10px` |
| 1486–1487, 1491–1492, 1495–1496 | `div` ×6 (animation button captions) | font-size | `font-size` | `1.1em` / `0.7em` |
| 1500 | `div.anim-toggle-row` | colour | `background` | `rgba(255,220,100,0.1)` |
| 1522 | `label` | font-size | `font-size` | `10px` |
| 1554–1555 | `div` ×2 | font-weight, font-size | `font-weight` / `font-size` | `bold` / `11px` |

The Light Source (`index.html:1241–1257`) and Light Shift (`1284–1293`) groups are the two blocks styled almost entirely inline (blue and orange tints, `4px` radii, `white` text).

### 9c. Inline style strings in `js/*.js`

Grep-level counts per file: `style="…"` inside template strings, `.style.cssText =`, `el.style.<prop> =` (`literal` = plain string right-hand side, so the value is in the CSV), `style.setProperty('--…')`. Files `index.html` does not reference are marked. An inline style set from JS outranks every stylesheet and layer; **colours set this way cannot be re-themed from CSS**. (static §11b)

| file | ref'd | style="…" | .style.cssText | el.style.x = | of which literal | setProperty('--') | CSV rows |
|---|---|---|---|---|---|---|---|
| `js/00a-boot.js` | yes | 0 | 0 | 1 | 0 | 0 | 0 |
| `js/01-config.js` | yes | 0 | 0 | 23 | 1 | 1 | 0 |
| `js/02-palettes.js` | yes | 0 | 0 | 14 | 7 | 0 | 0 |
| `js/03-recording.js` | yes | 0 | 0 | 4 | 2 | 0 | 0 |
| `js/04a-canvas-gl-config.js` | yes | 3 | 3 | 1 | 1 | 0 | 26 |
| `js/04d-anim-ascend-star.js` | yes | 0 | 0 | 2 | 0 | 1 | 0 |
| `js/04e-anim-portal.js` | yes | 0 | 0 | 4 | 2 | 0 | 2 |
| `js/04f-canvas-actions.js` | yes | 0 | 0 | 5 | 2 | 1 | 0 |
| `js/04g-hover-capture.js` | yes | 0 | 0 | 21 | 7 | 0 | 0 |
| `js/05d-input-replay.js` | yes | 0 | 1 | 3 | 3 | 1 | 7 |
| `js/05e-effect-controls.js` | yes | 0 | 0 | 11 | 1 | 1 | 0 |
| `js/05f-kaleido-controls.js` | yes | 0 | 0 | 0 | 0 | 5 | 0 |
| `js/05g-arm-colors.js` | yes | 0 | 0 | 1 | 1 | 0 | 0 |
| `js/05h-slider-bindings.js` | yes | 0 | 0 | 8 | 5 | 21 | 1 |
| `js/05j-update-loop.js` | yes | 0 | 0 | 4 | 0 | 0 | 0 |
| `js/05k-layers-render.js` | yes | 1 | 0 | 5 | 0 | 0 | 0 |
| `js/05l-layers-transform.js` | yes | 0 | 0 | 23 | 11 | 0 | 0 |
| `js/05m-layer-masks.js` | yes | 0 | 0 | 18 | 6 | 0 | 0 |
| `js/05n-hotkeys-init.js` | yes | 0 | 1 | 11 | 3 | 2 | 11 |
| `js/06-slider-updater.js` | yes | 0 | 0 | 0 | 0 | 4 | 0 |
| `js/06a-mp-core.js` | yes | 0 | 0 | 2 | 0 | 0 | 0 |
| `js/06c-mp-glide.js` | yes | 0 | 0 | 0 | 0 | 1 | 0 |
| `js/06e-mp-panel.js` | yes | 0 | 0 | 24 | 10 | 2 | 0 |
| `js/08-stats-panel.js` | yes | 0 | 0 | 5 | 3 | 0 | 0 |
| `js/08a-quality-governor.js` | yes | 0 | 0 | 1 | 0 | 0 | 0 |
| `js/10-draggable.js` | yes | 0 | 0 | 18 | 8 | 0 | 0 |
| `js/12-save-load.js` | yes | 1 | 0 | 44 | 12 | 2 | 1 |
| `js/12b-preset-vault.js` | yes | 0 | 0 | 1 | 0 | 0 | 0 |
| `js/13-drag-scroll.js` | yes | 0 | 0 | 6 | 2 | 0 | 0 |
| `js/13-light-source.js` | yes | 0 | 0 | 8 | 0 | 3 | 0 |
| `js/14-light-shift.js` | yes | 0 | 0 | 3 | 1 | 4 | 0 |
| `js/15-layer-masking.js` | yes | 30 | 0 | 30 | 17 | 1 | 20 |
| `js/16-sam-integration.js` | yes | 8 | 1 | 5 | 3 | 0 | 35 |
| `js/20-mixer-layout.js` | yes | 2 | 111 | 157 | 71 | 21 | 126 |
| `js/21-focus-mode.js` | yes | 0 | 0 | 8 | 0 | 0 | 0 |
| `js/22-audio-reactive.js` | yes | 0 | 1 | 3 | 2 | 0 | 7 |
| `js/23-depth-collision.js` | yes | 8 | 1 | 14 | 5 | 0 | 35 |
| `js/23-text-overlays.js` | yes | 0 | 2 | 33 | 12 | 0 | 8 |
| `js/24-path-layers.js` | yes | 0 | 0 | 4 | 2 | 0 | 2 |
| `js/24-video-export.js` | yes | 0 | 1 | 9 | 6 | 0 | 7 |
| `js/26-layer-transform.js` | yes | 0 | 0 | 5 | 0 | 0 | 0 |
| `js/28-studio-drawer.js` | yes | 0 | 0 | 1 | 0 | 0 | 0 |
| `js/29-material-modes.js` | yes | 0 | 0 | 4 | 1 | 4 | 0 |
| `js/30-audio-scenes.js` | yes | 0 | 1 | 1 | 0 | 0 | 0 |
| `js/31-brush-cursor.js` | yes | 1 | 7 | 41 | 21 | 0 | 12 |
| `js/32-file-drop.js` | yes | 0 | 1 | 2 | 2 | 0 | 7 |
| `js/34-mandala-mode.js` | yes | 0 | 1 | 7 | 0 | 2 | 0 |
| `js/35-zoom-view.js` | yes | 0 | 2 | 25 | 17 | 0 | 26 |
| `js/37-nav-idle-glow.js` | yes | 0 | 0 | 2 | 0 | 0 | 0 |
| `js/40-audio-timing.js` | yes | 0 | 0 | 19 | 4 | 0 | 0 |
| `js/40b-audio-cue-editor.js` | yes | 0 | 0 | 1 | 0 | 0 | 0 |
| `js/43-ui-visibility.js` | yes | 0 | 0 | 0 | 0 | 2 | 0 |
| `js/44-recipes.js` | **NO** | 0 | 0 | 7 | 1 | 1 | 0 |
| `js/45-breathing.js` | yes | 0 | 0 | 2 | 0 | 0 | 0 |
| `js/46-strip-more.js` | yes | 0 | 0 | 8 | 4 | 0 | 0 |
| `js/47-pen-window.js` | yes | 1 | 0 | 18 | 5 | 0 | 0 (+47 for its stylesheet) |
| `js/49-hotkey-binds.js` | yes | 0 | 0 | 12 | 0 | 2 | 0 |
| `js/50-look-links.js` | yes | 0 | 1 | 4 | 4 | 0 | 6 |
| `js/51-open-in-desktop.js` | yes | 0 | 0 | 7 | 3 | 0 | 0 |
| `js/52-demo-clock.js` | yes | 0 | 0 | 5 | 0 | 0 | 0 |
| `js/56-stroke-lock.js` | yes | 0 | 1 | 9 | 3 | 0 | 0 |
| `js/58-radial-menu.js` | yes | 0 | 0 | 12 | 0 | 1 | 0 |
| `js/60-reset-app.js` | yes | 0 | 0 | 2 | 0 | 0 | 0 |
| `js/63-kaleido-guides.js` | yes | 0 | 1 | 7 | 2 | 0 | 0 |
| `js/64-colour-picker.js` | yes | 0 | 0 | 24 | 0 | 0 | 0 |
| `js/65-palette-from-image.js` | yes | 0 | 0 | 5 | 0 | 0 | 0 |
| `js/66-skip-menu.js` | yes | 0 | 0 | 2 | 1 | 0 | 0 |
| `js/68-dither.js` | yes | 0 | 0 | 2 | 0 | 0 | 0 |
| `js/comfyui-bridge.js` | yes | 0 | 1 | 3 | 2 | 0 | 7 |

**Totals: `style="…"` 55, `cssText` 138, `el.style.x` 771 (276 literal), `setProperty('--')` 83, other `setProperty` 0, `removeProperty` 0.** Most-assigned `el.style` properties: `display` ×259, `left` ×60, `top` ×58, `width` ×45, `height` ×35, `opacity` ×35, `background-image` ×26, `cursor` ×23, `background` ×21, `transform` ×19, `color` ×13, `z-index` ×13, `background-color` ×9, `pointer-events` ×9, `position` ×9. `el.style.x = expr` with a non-literal right-hand side (495 of 771) is counted but carries no value.

**Literal values carried by JS inline styles: 344** (colour ×159, font-size ×65, radius ×36, z-index ×22, font-family ×18, font-weight ×15, shadow ×12, duration ×7, easing ×6, animation-name ×4). Colours set from JS, unique by computed value (65):

| computed | count | files | token |
|---|---|---|---|
| `rgba(0, 0, 0, 0.3)` | 14 | 20-mixer-layout ×12, 16-sam-integration ×1, 23-depth-collision ×1 |  |
| `rgba(255, 255, 255, 0.1)` | 13 | 20-mixer-layout ×8, 16-sam-integration ×1, 22-audio-reactive ×1, 23-depth-collision ×1 … | `--bg-raised-hover` |
| `#ffffff` | 9 | 20-mixer-layout ×6, 05d-input-replay ×1, 32-file-drop ×1, 35-zoom-view ×1 |  |
| `#3fb950` | 7 | 15-layer-masking ×3, 16-sam-integration ×3, 20-mixer-layout ×1 | `--ok` |
| `#58a6ff` | 7 | 15-layer-masking ×4, 20-mixer-layout ×2, 50-look-links ×1 |  |
| `#8b949e` | 6 | 15-layer-masking ×4, 16-sam-integration ×1, 23-depth-collision ×1 |  |
| `#e6edf3` | 6 | 04a-canvas-gl-config ×1, 05n-hotkeys-init ×1, 22-audio-reactive ×1, 24-video-export ×1 … |  |
| `#c9d1d9` | 5 | 20-mixer-layout ×4, 15-layer-masking ×1 |  |
| `rgba(255, 255, 255, 0.35)` | 5 | 20-mixer-layout ×4, 35-zoom-view ×1 |  |
| `rgba(13, 17, 23, 0.95)` | 4 | 22-audio-reactive, 24-video-export, 50-look-links, comfyui-bridge ×1 each |  |
| `rgba(255, 255, 255, 0.45)` | 4 | 20-mixer-layout ×4 |  |
| `#f2f3f5` | 3 | 20-mixer-layout ×2, 35-zoom-view ×1 | `--ink-100` `--text-primary` |
| `#ff8850` | 3 | 23-depth-collision ×3 |  |
| `rgba(255, 255, 255, 0.5)` | 3 | 20-mixer-layout ×3 |  |
| `rgba(255, 255, 255, 0.8)` | 3 | 20-mixer-layout ×2, 31-brush-cursor ×1 |  |
| `transparent` | 2 | 05h-slider-bindings ×1, 20-mixer-layout ×1 |  |
| `rgba(0, 0, 0, 0.55)` / `0.8` / `0.85` / `0.9` | 2 each | 05n-hotkeys-init, 35-zoom-view / 16-sam, 23-depth / 31-brush-cursor ×2 / 16-sam, 23-depth |  |
| `#000000` | 2 | 20-mixer-layout ×2 |  |
| `#6e7681` | 2 | 16-sam-integration ×1, 23-depth-collision ×1 |  |
| `rgba(15, 20, 27, 0.9)` | 2 | 05d-input-replay ×1, 32-file-drop ×1 |  |
| `#0f141b` | 2 | 16-sam-integration ×1, 23-depth-collision ×1 |  |
| `#ec3013` | 2 | 35-zoom-view ×2 | `--accent` `--accent-cool` |
| `#f0d47a` | 2 | 04a-canvas-gl-config ×2 |  |
| `rgba(255, 100, 255, 0.2)` | 2 | 04e-anim-portal ×2 |  |
| `#ffb74d` | 2 | 24-path-layers ×2 |  |
| `rgba(255, 200, 100, 0.3)` | 2 | 20-mixer-layout ×2 |  |
| `rgba(255, 255, 255, 0.08)` | 2 | 20-mixer-layout ×2 |  |
| `rgba(255, 255, 255, 0.12)` | 2 | 20-mixer-layout ×2 | `--border-strong` |
| `#1a1f2a` | 2 | 16-sam-integration ×1, 23-depth-collision ×1 |  |
| one-offs (34) | 1 each | `rgba(0,0,0,0.4/0.5/0.7)`, `rgba(100,200,255,0.4)`, `rgba(110,200,255,0.45)`, `rgba(13,17,23,0.92)`, `#0d1117`, `rgba(18,20,24,0.82)`, `rgba(184,134,11,0.4/0.533)`, `#d2a8ff`, `#e85d26`, `#ff6b6b` (= `--danger`), `rgba(255,120,80,0.3)`, `#ff7b72`, `rgba(255,136,80,0.6)`, `rgba(255,200,100,0.1/0.35)`, `rgba(255,225,180,0.95)`, `rgba(255,255,255,0.04)` (= `--border-subtle`), `rgba(255,255,255,0.05/0.14/0.18/0.3/0.4/0.6/0.85)`, `#238636`, `#2b2311`, `#3a3016`, `rgba(63,185,80,0.6)`, `rgba(88,166,255,0.05/0.3)` | 04a, 05d, 05n, 15, 16, 20, 23 ×2, 31, 32, 35 … | 3 of them |

Fonts, radii, shadows and z-indices set from JS (58 distinct values, full list static §11b): `font-size` `10px` ×19 (20-mixer-layout ×18), `11px` ×11, `14px` ×10, `9px` ×7, `12px` ×5, `13px` `18px` `20px` `24px` `48px` ×2, `15px` `17px` `40px` ×1; `font-weight` `600` ×12, `700` ×2, `500` ×1; `font-family` `Segoe UI`/`sans-serif` ×7 (04a ×3, 35 ×3, 05n ×1), `monospace` ×4; `border-radius` `4px` ×16 (20-mixer-layout ×15), `8px` ×7, `10px` ×3, `16px` `3px` `50%` `6px` ×2, `2px` `999px` ×1; shadows ×12 (`0 0 2px rgba(0,0,0,0.85)` ×2 on the brush cursor, `0 20px 60px rgba(0,0,0,0.8)` ×2 on the SAM / depth modals, `inset 0 0 0 3px var(--accent, #ec3013)` in 35-zoom-view …); `z-index` `10049` ×4 and `10050` (31-brush-cursor), `99999` ×4 (22, 24, 50, comfyui toasts), `10001` ×2, `10004` ×2, `51` ×2, `2147483645`/`2147483646` (04a no-GL screen), `9000`, `1001`, `10010`, `59`, `60`; `animation` `fadeIn`/`fadeOut` `0.3s ease` ×6 (16-sam, 23-depth).

The files whose inline colours are UI chrome rather than canvas-side or transient: `js/20-mixer-layout.js` (65 colour literals: fader readouts, preset cards, section rows), `js/15-layer-masking.js` (15), `js/16-sam-integration.js` (14), `js/23-depth-collision.js` (14), `js/35-zoom-view.js` (8), `js/31-brush-cursor.js` (4, the cursor ring), `js/04a-canvas-gl-config.js` (9, the no-WebGL screen).

## 10. Rules nothing matches (measured live)

Method (live "Method and caveats"): for every `CSSStyleRule` in `document.styleSheets` (recursing into `@media` / `@supports` / `@container` / `@layer` / `@import` / nested rules) each comma-separated selector had its pseudo-classes and pseudo-elements stripped (structural ones kept with their arguments stripped) and was passed to `document.querySelectorAll` in eight states. A selector is **unmatched** when no element matched in **any** state. A match does not mean the rule ever applied; Chrome's rule-usage tracking (`CSS.startRuleUsageTracking`, armed before the reload) answers that separately. Selectors invalid after stripping: 0.

**Caveat, read first:** lazily created UI is legitimately unmatched here: the pen window (js/47), the SAM / Magic Mask modal and its injected `#samModalStyles`, palette-from-image, the mask editor (all of `css/mask-editor.css`), toasts, the close-ask dialog, the delete-palette modal, the Swirl Together room menu / Invite popover / peer tints, the More panel (`#mixer-more-panel`, below ~900 px), the compact-window layout (`body.compact-ui`), the Electron `#custom-titlebar` chrome, `.file-drop-hover`, the boot cursor, drag / drop / recording / hover / focus states. Their rows mean "not reachable in these states", not dead CSS.

### 10a. Counts

| count | value |
|---|---|
| stylesheets enumerated | 14 |
| style rules (all depths) | 1,787 |
| selectors (rules split on top-level commas) | 1,996 |
| **selectors unmatched in every state** | **1,020** |
| … under a `@media` that does not apply at this viewport | 18 |
| … under a `@container` (applicability not evaluated) | 5 |
| … **with a class/id token `index.html` + `js/*.js` never mention (strongest dead signal)** | **70 selectors in 64 rules** |
| rules whose every selector is unmatched in every state | 888 |
| rules Chrome applied at least once (rule-usage) | 643 |
| rules Chrome never applied (rule-usage) | 1,143 |
| rules matched by `querySelectorAll` but never applied (pseudo-class / media gated) | 274 |
| selector lines resolved from the source files | 1,786 of 1,787 |

### 10b. States

| state | how | matched | unmatched | first matched here |
|---|---|---|---|---|
| boot | scratch profile defaults: layout Everything, left bar open, Brush open, nothing else | 902 | 1,094 | 902 |
| right-sections-open | every `#sidebar-right .sidebar-section` opened (trusted Shift-click on `.section-title`, additive); 14/14 open: Swirl Together, Simulation, Colors and palettes, Layers, Mutate shader, Effects, Animations, Audio, Kaleidoscope, Text, Focus, Display, Export, Settings | 904 | 1,092 | 2 |
| left-open | left bar with Brush (already open), Multi-Brush, Stroke and replay opened (right still open) | 918 | 1,078 | 17 |
| left-folded | left bar folded to its rail via `window.Sidebars.left.fold(true)` (non-persisting), then `restore()` | 922 | 1,074 | 4 |
| f1-overlay | F1 (js/05n `toggleHotkeys`), `#hotkeyOverlay` shown | 920 | 1,076 | 2 |
| radial-menu | pointer over the canvas centre, E (js/58), `#radialMenu` open | 932 | 1,064 | 12 |
| colour-picker | trusted click on `#colorPicker` (js/64), `.cp-pop` shown | 958 | 1,038 | 37 |
| presets-popup | trusted click on `#mixerPresetsTrigger` (js/20), `.mixer-presets-panel` shown | 922 | 1,074 | 0 |

Sidebar states are cumulative, overlay states transient (each opened, measured, closed with Escape). The Presets popup added no first-time matches because its panel is in the DOM (hidden) from boot.

### 10c. Per stylesheet

| # | sheet | top-level rules | style rules | selectors | unmatched in every state | Chrome never applied |
|---|---|---|---|---|---|---|
| 0 | css/00-tokens.css | 1 | 1 | 1 | 0 | 0 |
| 1 | css/01-buttons.css | 51 | 50 | 96 | 35 | 21 |
| 2 | css/styles.css | 236 | 235 | 277 | 120 | 144 |
| 3 | css/slider-styles.css | 17 | 18 | 21 | 1 | 5 |
| 4 | css/mask-editor.css | 110 | 106 | 109 | **109** | 106 |
| 5 | css/light-source.css | 2 | 2 | 2 | 0 | 2 |
| 6 | css/20-mixer-strip.css | 220 | 220 | 236 | 83 | 94 |
| 7 | css/21-sidebar.css | 401 | 403 | 427 | 105 | 230 |
| 8 | css/22-overlays.css | 519 | 523 | 567 | **416** | 402 |
| 9 | css/23-colour-picker.css | 103 | 102 | 122 | 58 | 54 |
| 10 | css/24-palette-from-image.css | 26 | 26 | 26 | 25 | 25 |
| 11 | css/init-responsive.css | 82 | 80 | 91 | 66 | 41 |
| 12 | js/32-file-drop.js:76 (injected) | 1 | 1 | 1 | 1 | 1 |
| 13 | index.html:249 (inline) | 20 | 20 | 20 | 1 | 18 |

`css/mask-editor.css` and `css/24-palette-from-image.css` are whole-feature sheets for UI the states never open; `css/22-overlays.css` holds the modals, the hotkey binder, the radial menu's hot/off states, the recipe modal (js/44, parked), the demo clock / reset-app / phone-pad / wishlist modals, focus mode and text-arrange; `css/styles.css` holds the pre-mixer layout (saved colours, palette tags, layer resize handles, capture area, recording overlays).

### 10d. Unmatched selectors by hint

A selector can carry several hints; hints are heuristics for reading, not verdicts. `(none)` 471 (plain classes or ids that **are** mentioned in `js/` or `index.html` but had no element in these states: lazily built UI or markup behind a feature flag; B's selector contract says which script creates them), `lazy-ui?` 238, `class-state?` 214 (`.active`, `.is-*`, `.dragging`, `.compact-ui`, `.focus-mode` …), **`no-ref` 70**, `attr-state` 33 (`[hidden]`, `[aria-*]`, `[data-*]`), `boot-only` 33 (splash / `html.boot-fade` / `.ui-enter`, applied at boot per rule-usage), `media` 18, `container` 5. Full per-selector tables (1,020 rows, with the stripped form, enclosing conditions, rule-applied flag and hint): live "Selectors unmatched in every state, grouped by file"; raw: `prep/work/css-unmatched.json` `selectors[]`.

### 10e. Dead-CSS candidates: unmatched in every state AND the token appears nowhere in `index.html` or `js/*.js` (70 selectors, 64 rules)

A string-built class name could still escape the substring test; `.layer-mask-btn`, `.instant-roto-btn`, `.stamp-menu-btn` (mask editor) are the ones most likely reached by code the scan cannot see. "Applied" = Chrome's rule-usage in the session (`yes` means a sibling selector in the same rule applied).

| file | line | selector | no-ref token(s) | applied |
|---|---|---|---|---|
| css/01-buttons.css | 96 | `.btn-lg`, `.btn-lg button` | `.btn-lg` | never |
| css/01-buttons.css | 103 | `.btn-icons button` | `.btn-icons` | yes |
| css/20-mixer-strip.css | 404, 411 | `.ch-color-head`, `.ch-color-head .ch-label` | `.ch-color-head` | never |
| css/20-mixer-strip.css | 650 | `.mixer-actions .transport-btn` | `.transport-btn` | yes |
| css/20-mixer-strip.css | 760 | `.mixer-presets-list .preset-sep` | `.preset-sep` | never |
| css/20-mixer-strip.css | 778 | `.mixer-user-presets` | `.mixer-user-presets` | never |
| css/20-mixer-strip.css | 797 | `.mixer-user-preset-delete` | `.mixer-user-preset-delete` | never |
| css/20-mixer-strip.css | 896 | `.arm-colors-hint` | `.arm-colors-hint` | never |
| css/20-mixer-strip.css | 1079, 1086 | `.brush-settings-panel.slide-left`, `….slide-left.visible` | `.slide-left` | never |
| css/21-sidebar.css | 742, 746 | `.settings-btn-row`, `.settings-btn-row button` | `.settings-btn-row` | never |
| css/21-sidebar.css | 850, 853 | `body.compact-ui #sidebar-right > #mixer-strip .ch-wide .ch-color-head(:empty)` | `.ch-color-head` | never |
| css/21-sidebar.css | 1059 | `#sidebar-right .palette-tag` | `.palette-tag` | never |
| css/21-sidebar.css | 1091 | `#sidebar-right .saved-colors` | `.saved-colors` | never |
| css/21-sidebar.css | 1828 | `body.rec-open #sidebar-right` | `.rec-open` | never |
| css/22-overlays.css | 8 | `body.focus-mode .title-bar` | `.title-bar` | never |
| css/22-overlays.css | 1813–1820, 1823–1825 (coarse), 1829 | `.atv-rz-n` `.atv-rz-s` `.atv-rz-w` `.atv-rz-e` `.atv-rz-nw` `.atv-rz-ne` `.atv-rz-sw` `.atv-rz-se` (+ `::after`) | the eight `.atv-rz-*` grips | never |
| css/22-overlays.css | 1849, 1850, 1851 | `.atv-file-row`, `.atv-file-btn`, `.atv-fname` | same | never |
| css/init-responsive.css | 269 | `#colorBar` | `#colorBar` | never |
| css/init-responsive.css | 285, 288 | `#settingsToggleBtn`, `#settingsPanel` | same | never |
| css/init-responsive.css | 294 | `.fps-notification` | `.fps-notification` | never |
| css/mask-editor.css | 259, 264, 269 | `.layer-mask-btn`, `.layer-mask-btn.has-mask`, `.layer-mask-btn.active` | `.layer-mask-btn`, `.has-mask` | never |
| css/mask-editor.css | 307 | `.instant-roto-btn:disabled` | `.instant-roto-btn` | never |
| css/mask-editor.css | 313, 317, 322 | `.stamp-menu-btn`, `.stamp-menu-btn .stamp-caret`, `.stamp-menu-btn.open .stamp-caret` | `.stamp-menu-btn`, `.stamp-caret` | never |
| css/styles.css | 311 | `#rippleCanvas` | `#rippleCanvas` | never |
| css/styles.css | 316 | `#trailCanvas` | `#trailCanvas` | yes (sibling `#canvas`) |
| css/styles.css | 622, 628 | `.color-actions`, `.color-actions button` | `.color-actions` | never |
| css/styles.css | 632 | `.saved-colors` | `.saved-colors` | never |
| css/styles.css | 643, 652, 653 | `.swatch-wrap`, `.swatch-remove`, `.swatch-wrap:hover .swatch-remove` | same | never |
| css/styles.css | 656, 659, 662, 663, 664 ×2, 668, 669, 670 | `.palette-tag` (+ `.active`, `.dragging`, `.drop-before::before`, `.drop-after::after`, `.editing`) | `.palette-tag` | never |
| css/styles.css | 671 | `.palette-tag-input` | `.palette-tag-input` | never |
| css/styles.css | 684, 685 | `.palette-step`, `.palette-step .chip` | `.palette-step` | never |

Three clusters: the old saved-colours / palette-tag UI in `css/styles.css:622–685` and `21-sidebar.css:1059, 1091` (replaced by the palette dropdown, 2026-10-08), the audio-timing panel's resize grips and file row in `css/22-overlays.css:1813–1851`, and the pre-mixer ids in `css/init-responsive.css:269–294` (`#colorBar`, `#settingsToggleBtn`, `#settingsPanel`, `.fps-notification`). `borderRotate` / `glassShimmer` (§4e) are the keyframe equivalents.

### 10f. Matched but never applied (274 rules)

These have an element for their stripped selector but Chrome never applied them in the session: the gate is `:hover`, `:focus-visible`, `:active`, `:checked`, `:disabled`, a `@container` or `(pointer: coarse)` condition, or an interaction state not exercised. Per file: 21-sidebar.css 135, styles.css 48, 22-overlays.css 27, 20-mixer-strip.css 23, index.html 17, 23-colour-picker.css 7, 01-buttons.css 6, init-responsive.css 5, slider-styles.css 4, light-source.css 2. They are **not** removal candidates; they are the state rules the theme must restyle through ARIA / `data-ui` hooks, and none is covered by a baseline screenshot state today. Per-rule list: JSON rows with `ruleApplied: false` and a non-empty `matchedIn`.

Rule-usage counts drift by a few between runs (648 applied in one run, 643 in the next; selector counts identical across three runs): pointer position, the `#fpsCap` option set that follows the measured refresh rate, the one-off perceptual-fader re-seat. `matchedAny` is the deterministic column; `ruleApplied` is a hint.

## 11. `zoom: var(--ui-scale)`

18 declarations: 16 `zoom: var(--ui-scale)`, one `zoom: 1` reset, one on each sidebar edge. (static §12)

| where | selector |
|---|---|
| css/init-responsive.css:261, 264, 267, 270 | `#sidebar-right`, `#sidebar-left`, `#mixer-strip`, `#colorBar` (dead id, §10e) |
| css/init-responsive.css:274, 277, 280, 283 | `.stats-panel`, `.rec-drawer`, `#hotkeyOverlay`, `.delete-modal` |
| css/init-responsive.css:286, 289 | `#settingsToggleBtn`, `#settingsPanel` (dead ids, §10e) |
| css/init-responsive.css:292, 295, 298, 301, 304 | `.mask-editor-overlay`, `.fps-notification` (dead), `.arm-colors-panel`, `.fx-tip`, `#recipePill` |
| css/21-sidebar.css:2415, 2472 | `.lsb-edge`, `.rsb-edge` |
| css/21-sidebar.css:2502 | `#sidebar-left .arm-colors-panel` → `zoom: 1` (undoes the double zoom when the panel is inside the already-zoomed left bar) |

`--ui-scale` is written once at boot and again only on `resize` and DPR change (`js/20-mixer-layout.js:181`, `initResponsiveScale`): 1.0 up to 1600 CSS px wide, then `round(min(1.8, 1 + (w − 1600) × 0.00036), 2)`, so **1.12 at 1920, 1.35 at 2560, 1.8 at 3840**; 1.15 when DPR ≥ 2 at ≥ 1200 px wide and the width rule gave 1.0. C2 measured `1` at 1584 px. Consequences for the pixel baselines: screenshots at 1920 and 2560 are of a zoomed UI (every px in those subtrees is 1.12× / 1.35× a style px, text re-rasterised at the zoomed size); `100vh` inside a zoomed subtree still measures the full viewport (`css/init-responsive.css:616` note on `.layers-panel`); fixed-position maths in JS converts through `window.UIScale`; body-mounted guide / ring overlays (`#recipeGuide`, `#radialMenu`, the brush cursor) are deliberately not zoomed; the `calc(… * var(--ui-scale))` font tokens (`--font-xs/sm`) inside a zoomed subtree scale twice. Any theme texture sized in px inside these subtrees will be zoomed too. The theme must not add elements to this list, or remove any, without re-baselining; 1366 and 1440 are the only widths where scale is 1.0.

## 12. `window.auditButtons()` (js/38-button-audit.js)

What it sanctions today (`isSanctioned`, `js/38-button-audit.js:20–31`): any rule whose sheet href matches `/01-buttons\.css/`; any selector containing `btn--destructive` or `btn--record` wherever declared; any selector containing `#photoWarn` (the PhotoSafe dialog is painted before `css/` loads and carries the protection state in its colours). It walks every `button, .btn`, names the rules outside those that set `background*`, `border*` or `color` on one (`COLOUR_PROPS`, `:15–17`), and reports inline `style` colours on buttons as a second class of offender. **A `@layer theme` stylesheet would be reported by name**: the function tests the sheet's href and the selector text, not the layer.

Run live by C2 at boot and with every section open (collapsed sections are still in the DOM, so the two differ only by lazily built controls). Raw: `prep/work/css/button-audit.json`.

| run | buttons | clean | coloured by legacy rules | offending rules | inline offenders |
|---|---|---|---|---|---|
| boot | 258 | 258 | 0 | 0 | 0 |
| every section open | 264 | 264 | 0 | 0 | 0 |

Clean: every button reads its colour from the section tokens (`--sec-h` / `--sec-c`, §8a) through `css/01-buttons.css`. The button total can move by one between runs (`#fpsCap` options follow the measured refresh rate; the Reset-app hint varies), see `prep/baseline/dom/NOTES.md`.

## 13. How to re-run

Both scripts are plain Node (v25), add nothing to `package.json`, and write only under `prep/`. Run them from the repo root.

**Static half** (seconds; deterministic, so outputs diff cleanly after each CSS step):

```
node prep/scripts/css-audit.js            # writes prep/css-values.csv + prep/work/css/static.md, prints the Counts line
node prep/scripts/css-audit.js --no-live  # same; the flag is accepted so the brief's command line works (this file has no live part)
node prep/scripts/css-audit.js --out <dir>  # write css-values.csv and static.md into <dir> instead (e.g. to diff two revisions)
```

It reads the `<link>` list from `index.html` (so a re-ordered or added sheet is picked up), the inline `<style>` blocks, the three injected strings at their fixed `js/` lines, the pen-window string, inline `style=""` attributes and every `js/*.js`. The CSV is sorted by file, line, property. Parser caveats: hand-written tokeniser, not a validator; malformed input is skipped; `el.style.x = expr` with a non-literal right-hand side is counted without a value; `${…}` in templates becomes `__JS__`. If a later step adds `@layer` blocks the parser already handles them as grouping at-rules (`context` column).

**Live half** (60–90 s; needs Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, `CHROME=` overrides):

```
node prep/scripts/css-live.js             # writes prep/work/css-unmatched.json, prep/work/css/live.md,
                                          #        prep/work/css/button-audit.json, prep/work/css/live-custom-props.json
```

It boots the web build in its own headless Chrome through `scripts/test/radial-menu/driver.js` (`boot()`: own static server on the repo root, scratch profile with PhotoSafe / the startup fork / the first-run hint already answered), reloads once so the `setProperty` hook and `CSS.startRuleUsageTracking` precede the app's first script, walks the eight states of §10b with trusted input, runs `auditButtons()` twice, and closes Chrome in a `finally`. No dev server, no Electron, nothing installed; one instance per agent; never attach to port 9333. No persisting app setter is called (GUIDANCE.md §2b): state changes are trusted clicks/keys on real controls, one `input` + `change` dispatch on the real `#curl` slider (restored the same way), and `Sidebars.left.fold()` / `restore()` ("without keeping"). Expected drift between runs: Chrome's rule-usage count ±5, button totals ±1; `matchedAny` and the selector counts are deterministic.

**This report** is a hand-merge of `prep/work/css/static.md` and `prep/work/css/live.md`; after a re-run, diff those two files against the numbers here (the `## Counts` line at the end of static.md and the `## Counts` table at the top of live.md are the quick check) and update the sections that moved. Gates for the later CSS steps: `css-values.csv` row count and the `token` column (step 2 should shrink the literal rows and grow the var rows by the same amount), `!important` count unchanged (step 1), `unmatchedAllStates` unchanged or lower, `buttonAuditOffenders` 0, `writers` unchanged, and no new sheet in the live stylesheet list that is not inside `@layer`.

## 14. What this audit does not cover

- **Out of scope by the brief, listed only** (static §14): `phone/phone.css` (13,078 B) and `phone/index.html` (9,481 B), the pad-only PWA with its own stylesheet; `scripts/copy-sink/index.html` (62,945 B), a dev tool; `interaction-design-concept/public/styles.css` (4,818 B) and `index.html` (1,479 B); `Design system breakdown exploration/design_handoff_control_surface/Control Surface Breakdown.dc.html` (92,566 B) and `Control Surface Prototype.dc.html` (43,990 B), design exports not shipped.
- **UI states not reached live**: hover, focus, active, drag, recording, export capture, a Swirl Together room (room menu, Invite popover, peer tints: `--peer` / `--mp-peer` were never written), compact width (`body.compact-ui`, the More panel below ~900 px), Electron (`#custom-titlebar`, `body.transparent-mode`, `display-borderless` / `display-fullscreen`), focus mode, text-arrange, layer transform, the SAM / Magic Mask modal (`#samModalStyles` never injected), the mask editor, palette-from-image, the pen window, the delete / close-ask / reset-app / wishlist / phone-pad / open-in-desktop modals, toasts, the recipe modal (js/44, parked). The 1,020 unmatched selectors are "unmatched in the states tried", not dead, except where §10e's no-ref test adds evidence.
- **Other viewports and media**: the audit ran at one size (1584×805 CSS px, DPR 1, `--ui-scale` 1, fine pointer, no reduced-motion). The 18 selectors under non-applying `@media` and the 5 under `@container` were not evaluated at their own breakpoints; nothing was measured at 1366 / 1440 / 1920 / 2560 or with `--ui-scale` > 1.
- **Values the parser cannot see**: `el.style.x = expr` with a non-literal right-hand side (495 of 771 assignments), string-built class names, `${…}` template expressions, the contents of the 3 `data:` URIs, colours written to canvases or shaders (not CSS), anything inside `js/vendor/`.
- **Rendering**: no pixel output, frame time, forced-layout or style-recalc counts (workstream F); no check that two spellings of one colour render identically (they do by definition for sRGB; `oklch()` values were not converted for the token comparison, only hex / rgb / hsl).
- **Specificity inside `:is()`**: computed as the CSS spec says (the most specific argument), so `:is(#sidebar-right, #sidebar-left) …` counts as an id selector; `:where()` as zero.
- **Static vs live rule count**: the parser finds 1,793 style rules in the 14 sheets Chrome loaded, Chrome reports 1,787 (styles.css 236 → 235, slider-styles.css 21 → 18, 20-mixer-strip.css 221 → 220, 22-overlays.css 524 → 523). The 6 missing rules were not identified; the likely cause is selectors Chrome drops as invalid (vendor pseudo-elements such as `::-moz-range-*`), see §15.
- **Cross-checks with other workstreams not done here**: which `(none)`-hinted unmatched selectors a script creates (B's selector contract), and which control each custom-property writer belongs to (A's inventory).

## 15. Open questions

Consolidated from C1 (`prep/work/open-items/C1-static.md`, items 1–11), C2 (`prep/work/open-items/C2.md`, questions 1–7) and this merge; also written to `prep/work/open-items/C.md`. Nothing here is a decision.

| # | question | evidence | from |
|---|---|---|---|
| C-1 | The three radius tokens are all `0` and never read; 37 literal `border-radius: 0` match them, 291 other radius literals (4px ×68, 6px ×68, 8px ×41, 50% ×33 …) match nothing. Do `--ui-radius-sm/md` carry today's most common literals (4px / 6px) so step 2 is a visual no-op, or stay `0` with the literals left alone until the theme? | §4a, §2d | C1-1 |
| C-2 | 24 of 51 tokens in `css/00-tokens.css` are never read, several with literal twins in the sheets (`rgba(255,255,255,0.1)` ×40 = `--bg-raised-hover`, `#f2f3f5` ×23 = `--ink-100` / `--text-primary`). Does step 2 retire the unread aliases (`--text-primary` vs `--ink-100`, `--border-default` vs `--ground-500`, `--accent-cool` vs `--accent`, `--bg-app` vs `--ground-950`) or keep both names? The CSV `token` column lists both where a literal matches two. | §2c, §2d, §8b | C1-2 |
| C-3 | 72 `!important` declarations in `css/` (46 in 22-overlays, 32 of them the focus-mode block at 22-overlays.css:18–71) plus 1 boot-cursor, 2 file-drop, 1 pen window. Inside layers an important declaration in `legacy` beats a normal one in `theme`. For each row of §5: keep (behaviour: `.ui-hidden`, `[hidden]`, focus mode, reduced motion, eyedropper) or confirm the theme never needs to override it? The three colour ones (`#captureBtn.debounce`, file-drop outline + background) are the only ones a theme would want to reach. | §5 | C1-3 |
| C-4 | Two unlayered `<style>` blocks stay in the document for the whole session: the file-drop hover rule (js/32-file-drop.js:77–79, two `!important`s, hard-coded blue) and `#samModalStyles` (js/16-sam-integration.js:268–277, keyframes only; also used by js/23-depth-collision.js). Once legacy is layered they outrank it. List them as sanctioned unlayered exceptions in the CSS plan, or (later, outside prep) move the two rules into `css/` under the layer? | §9a | C1-4 |
| C-5 | `js/44-recipes.js` is the only `js/` file `index.html` does not reference (parked, per memory); it still carries a `--val` writer and inline-style writers that the grep counts. Confirm it stays out of scope for the theme, or note it as dead code for later. | §8c, §9c | C1-5 |
| C-6 | 128 of 130 inline `style=""` attributes sit in the `.controls` panel js/20 re-parents; 53 carry colour / font / radius / shadow literals, concentrated in the Light Source and Light Shift groups (index.html:1241–1293) and the preset-name input (1377). Inline attributes beat every layer. Do the theme-blocking ones move into `css/` during prep step 2 (markup change, no behaviour change) or wait for the theme? | §9b | C1-6 |
| C-7 | JS inline styles carry 159 colour literals (plus 28 in `index.html` attributes and 26 in the pen window's own stylesheet): the UI-chrome ones (js/20-mixer-layout.js ×65, js/15 ×15, js/16 ×14, js/23-depth ×14, js/35 ×8) cannot be re-themed from CSS. Triage: which are UI chrome (theme must reach them, a later code change outside prep) and which are canvas-side / transient (cursor ring, no-GL screen, download modal) and may stay? | §9c | C1-7 |
| C-8 | The `--ui-scale` zoom list (§11) means baselines at 1920 and 2560 are 1.12× / 1.35× zoomed, and any `background-size` in px inside those subtrees (the herringbone) zooms too. Confirm F captures 1366 / 1440 (scale 1.0) as the primary pixel gate and treats 1920 / 2560 as zoomed renderings; decide whether the texture is sized in zoomed or screen px. | §11 | C1-8 |
| C-9 | Keyframes `borderRotate` and `glassShimmer` (css/styles.css:879, 917) are referenced by nothing in CSS or JS; C2's rule-usage cannot see `@keyframes`, so there is no live corroboration. Confirm dead before the legacy move; no change in prep. | §4e | C1-9, C2 |
| C-10 | The token cross-reference covers `css/00-tokens.css` only; the responsive tokens in `css/init-responsive.css` `:root` (`--font-xs…xl`, `--space-*`, `--strip-h`) are `calc()` on `--ui-scale`, so none of the 422 `font-size` literals (11px ×103, 10px ×89, 12px ×72) matches them by text. If step 2's `--ui-font-*` tokens replace px literals, note that inside a zoomed subtree a `calc(… * var(--ui-scale))` size already scales twice (once through the token, once through `zoom:`); check before tokenising any font-size literal. | §3b, §11 | C1-10 |
| C-11 | **Name collision for prep step 5**: the theme plans `--i` (brightness 0–1) per control, but `--i` is already written on every `.sidebar-section` as its row index for the entrance stagger (js/20-mixer-layout.js:2666 and js/43-ui-visibility.js:293, two writers for the same property, read at 21-sidebar.css). A brightness `--i` on a control inside a section would be shadowed / inherit the row index. The theme property needs another name or a scope that cannot inherit from a section; who decides? Also: whichever of the two writers the inventory names as "the code path that runs on state change" should be the one. | §8b, §8d | C2-6 |
| C-12 | Dead-CSS candidates, 70 selectors in 64 rules (§10e): token unmentioned in `index.html` + `js/*.js`, matched nothing in eight states, never applied by Chrome. Safe to drop in the CSS prep, or does any belong to a string-built class or to the pen window (js/47, not in the list)? `.layer-mask-btn`, `.instant-roto-btn`, `.stamp-menu-btn` are the most likely to be reached by code the scan cannot see. | §10e | C2-1 |
| C-13 | `window.auditButtons()` sanctions by sheet name and selector text (js/38-button-audit.js:20–31). It is clean today (0 of 264). A `@layer theme` rule that colours a button will be reported as an offender. Should the audit learn the layer (`CSSLayerBlockRule` ancestry) or the theme file name, and does that change land with the first theme step or before it? | §12 | C2-2 |
| C-14 | 274 rules are matched but never applied (`:hover`, `:focus-visible`, `:active`, `:checked`, `:disabled`, `@container`, `(pointer: coarse)`), §10f: exactly the state rules the theme must restyle through ARIA / `data-ui` hooks, and none has a pixel gate today. Does the CSS plan want a hover / focus / active / pressed state pass added to F's baseline screenshots? | §10f | C2-3 |
| C-15 | States not reached (§14): a second live pass could add a compact-width state (`Emulation.setDeviceMetricsOverride` 900 px, as `scripts/test/popup-focus/run.js` does), a simulated room (`#mpConnected` shown by hand, as the popup-focus suite does), runs at 800 and 520 px, and `Emulation.setEmulatedMedia` for coarse pointer / reduced motion, to settle the 18 media-gated and 5 container-gated selectors and the `body.compact-ui` block (23 selectors, the two-id specificity peak of §6a). Wanted before the legacy move? | §10, §7, §6a | C2-5, C2-7 |
| C-16 | Rule-usage counts drift by a few between runs (648 vs 643 applied; `#fpsCap` option set, pointer position, the perceptual-fader re-seat); the button total moves by one. Treat `ruleApplied` and the button count as hints, `matchedAny` and the selector counts as the gate? | §10f, §12 | C2-4 |
| C-17 | The static parser counts 1,793 style rules in the 14 sheets Chrome loaded; Chrome holds 1,787 (styles.css −1, slider-styles.css −3, 20-mixer-strip.css −1, 22-overlays.css −1). The 6 rules Chrome drops were not identified by either half (most likely selectors with vendor pseudo-elements Chrome rejects, e.g. `::-moz-range-thumb`; `css/slider-styles.css` is the slider sheet). Worth naming them before step 1, since a rule Chrome drops today is one the legacy layer need not carry. | §1, §10a | C3 |
| C-18 | The README's rough sizing numbers (972 colour literals / 341 unique, 95 custom properties, 77 `!important` / 48 in 22-overlays) differ slightly from the scripts' (1,107 / 349 in the app document, 96, 76 / 46). The scripts' numbers are the ones to track; should the README's "Rough CSS numbers" paragraph be updated to point here? (README is outside `prep/`'s write set for this agent.) | §1, §2, §5, §8 | C3 |
| C-19 | `body` (`css/styles.css:181`) sets the UI font as a literal that omits `'Inter'`, while `--font-ui` includes it; three different monospace stacks are in use (`'Courier New', monospace` ×11, `monospace` ×21, `ui-monospace, Consolas, monospace` ×3). Step 2's `--ui-font-body` / `--ui-font-mono` will unify them: is that an acceptable (tiny) visual change for the pixel gate at step 2, or does it wait for the theme step (where the fonts change anyway)? | §3a | C3 |
| C-20 | Nothing styles `[aria-expanded]` on `.section-title` (open/closed is `.collapsed`), and `.btn.active` / `.btn--record.active` class twins exist beside every `[aria-pressed]` rule. Step 4 adds ARIA-based rules beside the classes; confirm the section open state is `aria-expanded` on `.section-title` (33 JS writes, README) and that B's contract lists `.collapsed` as a write hook so both can coexist. | §6f | C3 |

Also carried, not a question: the brief asked for the open questions to be appended to `prep/OPEN-ITEMS.md` under `## C`; the preamble routes them through `prep/work/open-items/<id>.md` for a final consolidator, so they are in `prep/work/open-items/C.md` (this list), `C1-static.md` and `C2.md`, and `prep/OPEN-ITEMS.md` is left for that agent.
