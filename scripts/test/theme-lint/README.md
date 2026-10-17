# theme-lint: Walnut & Copper consistency checker

Measures the reskin against the study's rules in headless Chrome and lists every place that breaks one. Read-only: it never types, never persists, and clicks nothing but drawer titles.

```
node scripts/test/theme-lint/run.js              # report only
node scripts/test/theme-lint/run.js --check      # exit 1 if any check's count went up in any drawer
node scripts/test/theme-lint/run.js --update     # rewrite the baseline (prep/baseline/theme-lint.json)
```

| Flag | Default | |
|---|---|---|
| `--widths` | `1920,1440` | Sizes for the full sweep (`1920` or `1920x1080`; `none` skips it) |
| `--small` | `1000x480,760x700,1200x500` | Compact sizes, overlap only (`none` skips them) |
| `--out DIR` | `prep/work/theme-lint` | Where `report.md` and `report.json` go |
| `--check [FILE]` | `prep/baseline/theme-lint.json` | Compare per drawer and check; prints the new issues and exits 1 if a count went up |
| `--update [FILE]` | `prep/baseline/theme-lint.json` | Write the counts and issues as the new baseline |
| `--drawers REGEX` | all | Only the drawers whose title matches (for debugging a check) |

A full run takes about 30 s and needs only Node and Chrome (the shared driver, `scripts/test/radial-menu/driver.js`; no `sharp`).

## What a run does

1. Boots the app with the shared driver (own static server, scratch profile), emulates `prefers-reduced-motion: reduce` so the theme's springs settle at once, and passes `--disable-gpu-compositing`.
2. At each sweep size: scans the top bar (`#mixer-strip`) and the left sidebar head (`.lsb-head`), then opens each drawer of both sidebars alone (clicks its `.section-title`, closes the others) and scans its front and open tray.
3. At each compact size (js/13: `body.compact-ui`, the strip moves into `#sidebar-right`): resizes, opens the right bar the way js/13 does (`Sidebars.right.fold(false)`, which never persists), and runs the overlap check on the strip.

## The checks

Each issue is `{ check, width, drawer, path, text, detail }`; `path` is a short CSS path (state classes such as `active` left out), `text` the node's source text.

| Check | Flags |
|---|---|
| `clipped-text` | Visible text cut off: its glyphs run past its own box or a clipping ancestor (overflow other than visible; vertically only `hidden`/`clip`, and nothing above a vertical scroller, since scrolled content isn't cut), or `text-overflow: ellipsis` shortened it. Vertical cuts are measured on the glyphs' ink, not the font's line box. |
| `wrapped-pane` | A `button`, `.btn`, `[role=radio\|checkbox\|option]` or `.wc-opt` whose label runs onto more than one line (one text node with client rects on two line tops). The study's panes never wrap. |
| `native-control` | A visible checkbox, radio or colour input drawn by the browser (`appearance` not `none`; a colour input always, since `appearance: none` leaves the browser's swatch). A sidebar `select` not 32 or 48 px tall, or a top-bar `select` not 40 px (CSS px, zoom removed). |
| `off-theme-font` | Visible text or field value in the sidebars or top bar whose first font family isn't Michroma, Share Tech Mono or Libre Franklin. `select.material-mode-select` is exempt (js/29 measures its system font). |
| `off-palette` | A cool saturated colour (hue 190 to 330: blue, indigo, violet, magenta) in a background, gradient stop, text or border, the legacy palette's hues. User colour is content and skipped: swatches, palettes, chips, colour wells, images, canvases, SVG. |
| `inner-box` | Inside an open tray, an element that draws a visible edge (border with alpha 0.15 or more, any dashed or dotted border, an outline, or a hard box-shadow ring): the study's rule is one container per column. Not flagged: controls and what's inside them, labels wrapping an input, keycaps / chips / lamps / swatches / screens, a full frame around a single control (a pane) or around a row of controls (a joined strip), and the theme's bead-row divider, a one-sided dotted copper rule. A divider nested in a sub-group that already opens with one is flagged. |
| `label-style` | Label-like text in the trays (`label`, headings, classes containing label / title / head, short uppercase text beside or above a control; labels of disabled controls skipped) grouped by family, size, weight, letter-spacing, transform and colour. Every group is listed in the report. A group is flagged when it holds under 10 % of that size's labels, or is set in another face than most labels (the study engraves every label in Michroma). Relative rule: fixing many labels can move a small group across the line. |
| `overlap` | Interactive nodes in the top bar whose boxes cross by more than 2 px (ancestor / descendant pairs excluded), and anything of the strip over `#sidebar-left`. At compact sizes also: a strip cell running past the right bar or the window, and the right bar over the left bar. |

## Output

`report.md`: counts per check, a size x drawer x check table, the label-style groups with three examples each, then every issue with its path and detail. `report.json` holds the same data. The baseline keys an issue by check, size, drawer and path (not text: a select's text can differ between machines).
