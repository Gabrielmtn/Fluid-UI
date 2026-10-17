# theme-lint: Walnut & Copper consistency checker

Measures the reskin against the study's rules in headless Chrome and lists every place that breaks one. Read-only: it never types, never persists, and clicks nothing but drawer titles.

```
node scripts/test/theme-lint/run.js              # report only
node scripts/test/theme-lint/run.js --check      # exit 1 if any issue is not in the baseline
node scripts/test/theme-lint/run.js --update     # rewrite the baseline (prep/baseline/theme-lint.json)
node scripts/test/theme-lint/run.js --study      # calibration: the same checks on the study must come back clean
```

| Flag | Default | |
|---|---|---|
| `--widths` | `1920,1440` | Sizes for the full sweep (`1920` or `1920x1080`; `none` skips it) |
| `--small` | `1000x480,760x700,1200x500,800x600,770x700,1280x720` | Small windows: top bar, underbar and folded bars only (`none` skips them) |
| `--out DIR` | `prep/work/theme-lint` | Where `report.md` and `report.json` go (`--study` writes to `DIR/study`) |
| `--check [FILE]` | `prep/baseline/theme-lint.json` | Compare issue by issue; prints the new ones and exits 1 if there are any |
| `--update [FILE]` | `prep/baseline/theme-lint.json` | Write the issues as the new baseline |
| `--drawers REGEX` | all | Only report the drawers whose title matches (for debugging a check) |
| `--study` | | Run the page code on `design/walnut-copper-study.html` at the first `--widths` size instead of the app |

A full run takes 30 to 35 s, `--study` about 17 s. Both need only Node and Chrome (the shared driver, `scripts/test/radial-menu/driver.js`; no `sharp`).

## What a run does

1. Boots the app with the shared driver (own static server, scratch profile), emulates `prefers-reduced-motion: reduce` so the theme's springs settle at once, and passes `--disable-gpu-compositing`.
2. At each sweep size: scans the top bar (`#mixer-strip`), the left sidebar head (`.lsb-head`) and the underbar, then opens each drawer of both sidebars alone (clicks its `.section-title`, closes the others) and scans its front and open tray.
3. At each small size, resized in place:
   - In a compact window (js/13: 768 px wide or less, or 500 px tall or less up to 1200 wide; `body.compact-ui`, the strip moves into `#sidebar-right`), it folds both bars with js/13's own call (`Sidebars.left/right.fold(true)`, never persisted) and measures them (`fold-width`). It then opens the right bar the way js/13 does (`Sidebars.right.fold(false)`) and runs `clipped-text`, `wrapped-pane` and `overlap` on the strip there.
   - Otherwise it runs the same three on the top bar. 800x600 and 770x700 sit in the band just above compact (769 to about 830 px), where the bar runs out of room. 1280x720 is in js/46's More band (1201 to 1366).
   - At every size the underbar must keep off both sidebars.

## The checks

Each issue is `{ check, width, drawer, path, text, detail }`; `path` is a short CSS path (state classes such as `active` left out), `text` the node's source text.

| Check | Flags |
|---|---|
| `clipped-text` | Visible text cut off: its glyphs run past its own box or a clipping ancestor (overflow other than visible; vertically only `hidden`/`clip`, and nothing above a vertical scroller, since scrolled content isn't cut), or `text-overflow: ellipsis` shortened it. Vertical cuts are measured on the glyphs' ink, not the font's line box. Also text that **spills past its pane** (a button-like control or a checkbox / radio label) when the pane does not clip: the neighbour paints over it (compact strip: RANDOM over PALETTE). And a tray that is **wider inside than out** with `overflow-x` hidden: focusing a control past the edge scrolls the whole tray sideways. |
| `wrapped-pane` | A `button`, `.btn`, `[role=radio\|checkbox\|option]`, `.wc-opt`, or a checkbox / radio `<label>`, whose label runs onto more than one line (one text node with client rects on two line tops). The study's panes never wrap. |
| `native-control` | A visible checkbox, radio or colour input drawn by the browser (`appearance` not `none`; a colour input also when no theme rule, scoped to `[data-theme]` or in `@layer theme`, styles its `::-webkit-color-swatch`: legacy swatch rules don't count). A field off the study's heights (CSS px, zoom removed): a sidebar `select` or text / number / search input not 32 or 48 px tall (the study's `.cp.sel` and `.tf`), or a top-bar `select` not 40 px. |
| `off-theme-font` | Visible text or field value in the sidebars or top bar whose first font family isn't Michroma, Share Tech Mono or Libre Franklin. Also Libre Franklin where the study never uses it: the lettered text of a pane, a `select`'s value or a custom combobox (the study sets those in Michroma, VFD readouts in Share Tech Mono; Libre Franklin is for prose). Icon glyphs (no letter or digit) are left out of that rule. `select.material-mode-select` is exempt (js/29 measures its system font). |
| `off-palette` | A cool saturated colour (hue 190 to 330: blue, indigo, violet, magenta) in a background, gradient stop, text or border, the legacy palette's hues. Skipped as content: user colour (swatches, palettes, chips, colour wells, images, canvases, SVG); a per-item colour a script feeds in through a custom property it writes inline (a peer's tint, a brush tile's colour, the study's idle-egg tints), when the computed colour equals that property's value; text under `#sidebar-right[data-idle-glow]` (the app's idle egg). A colour written inline as a plain property, such as the legacy SIM badge's gradient, is still chrome. |
| `inner-box` | Inside an open tray, an element that draws a visible edge (a solid border with alpha 0.04 or more, any dashed or dotted border, an outline, or a hard box-shadow ring): the study's rule is one container per column. Not flagged: controls and what's inside them, labels wrapping an input, keycaps / chips / lamps / swatches / screens / thumbnails, a full frame around a single control (a pane) or around a row of controls (a joined strip), a text-less part of a one-control widget (a slider's track drawn beside its see-through range input, the study's `.lad .tg`), and the theme's bead-row divider, a one-sided dotted copper rule. A divider nested in a sub-group that already opens with one is flagged. |
| `label-style` | Label-like text in the trays (`label`, headings, classes containing label / title / head, short uppercase text beside or above a control), grouped by family, size, weight, letter-spacing, transform and colour. Left out: labels of disabled controls, a control's own text (a field's value), thumbnail badges, screen readouts (VFD captions, the room feed). Each label is a control label (it names one control) or a heading (it heads a group); the study has a few heading tiers (`.sect`, `.subhd`) beside one control-label style, so each role is judged on its own. A style within 0.5 px of size and 0.15 px of letter-spacing of a bigger group joins it (a drift, listed as a variant). A group is flagged when it holds under 10 % of its role's labels and matches no common style of either role, or when it is set in another face than most labels (the study engraves every label in Michroma). Relative rule: fixing many labels can move a small group across the line. |
| `overlap` | Interactive nodes in the top bar whose boxes cross by more than 2 px (ancestor / descendant pairs excluded), anything of the top bar over a sidebar, and a top-bar control cut off sideways by the window or by an ancestor that hides overflow (not one you can scroll: at 770 px Presets and Stop run past the edge). In a compact window, where the strip sits in the right bar, the cut-off rule becomes: a strip cell running past the right bar or the window; and the right bar must not cross the left bar. At every size: an underbar item (quality drop-downs, Reset app, the demo clock, the playtest label) over a sidebar. |
| `fold-width` | In a compact window, a folded sidebar wider than a rail (48 px; stock 32 px). js/13 folds both bars so the canvas gets the window; a folded bar drawn at full width squeezes it (the detail says how much canvas is left). |

## Calibration (`--study`)

The study is the spec, so `--study` runs the same page code on it: the top bar (`.navbar`), every drawer (`.drw`, opened alone by its `.dfront`, tray `.dtray`), and the right cabinet in its idle-egg state. It exits 1 when any check flags the study, which means an exemption or a threshold is wrong; run it after changing a check. One flag is the study's own fault and is listed, not held against the checker: its "Colors and palettes" front is cut to "COLORS AND PALETT" at 1920.

## Output

`report.md`: counts per check, a size x drawer x check table, the trays' unrendered controls (inside collapsed sub-panels, which no check sees), the label-style groups per role with three examples each, then every issue with its path and detail. `report.json` holds the same data.

## Baseline

The baseline keys an issue by check, size, drawer and path (not text: a select's text can differ between machines), and lists the cells (size x drawer) the run covered. `--check` compares issue by issue in the cells both cover, so a fix and a new fault in the same drawer can't cancel out; issues gone since the baseline are listed as good news. A run with `--drawers`, other `--widths` or other `--small` covers fewer cells: `--check` compares only those, and `--update` replaces only those in the existing baseline and keeps the rest. label-style always collects every drawer's labels, so a `--drawers` run judges labels the same way a full run does.

## Known limits

- The shared driver waits on Chrome without a timeout. If Chrome dies under load (several workstreams run it at once), the run stops after 90 s without an answer (exit 3); run it again.

- Default state only. Controls inside collapsed sub-panels (Effects, Settings, Stroke and replay, Kaleidoscope, Text, Audio ...) are never scanned, since a run clicks nothing but drawer titles; the report's "Not scanned" table counts them.
- The small-window passes check the top bar, the underbar and the folded bars, not the drawers.
- `label-style` and the outlier share are relative; `inner-box` exempts thumbnails' frames (the study frames its layer thumbs).
