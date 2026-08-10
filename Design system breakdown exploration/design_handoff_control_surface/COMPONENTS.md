# Component reference

Full specs for every component, plus the token table. The work order in `README.md` refers to these by number. Where the two disagree, README wins — it is scoped to what we are actually shipping.

## The grid: rack units

Every control occupies one full-width row of fixed height, stacked like 19-inch rack gear. One control per row, no two-ups. Panels are runs of rows under a header. The whole surface is one scrolling column.

| Metric | Value |
| --- | --- |
| Row height, value control | 76px |
| Row height, boolean / action | 54px |
| Row inset | 18px horizontal, 14px top |
| Row divider | 2px, `#0a0b0e` |
| Panel width | 300px fixed, 340px comfortable |
| Minimum hit target | 44px, full row width |
| Corner radius | 0 everywhere |

Dependent rows (Glow Intensity under Glow, Spin Speed under Animate Rotation) indent from 18px to 34px and drop their label to `#b9bec7` when the parent is off. **Never hide a dependent row.**

## Components

### 4.1 Fader — the default value control (`~51 controls`)

The workhorse. Replaces the panel slider and the ramp slider.

- Row: label left, value right, both on one baseline, 12px gap to the scale.
- Label: 800 / 15px / `.09em` / uppercase / `#f2f3f5`.
- Value: 700 / 18px / tabular numerals / `#f2f3f5`, right-aligned to the row inset.
- Scale row: three printed stops (min, mid, max) at 700 / 10px / `.08em` / `#7b828e`, `14px` above and `5px` below.
- Track: 26px tall, `#0a0b0e` fill, `1px solid #2a2e37` border, 9 evenly spaced 1px tick marks in `#2a2e37`.
- Fill: `linear-gradient(90deg, #f0a626, #e0432a)`, inset 1px from the border, 6px vertical padding inside the track.
- Knob: 16px wide, 2px taller than the track on each side, `linear-gradient(180deg, #f6f7f9, #9aa1ad)`, `1px solid #0a0b0e`, `translateX(-50%)` on the fill percentage.
- Hit target: the whole row, not just the track. `cursor: ew-resize`.

The printed scale is the point of this component — the current sliders have none, so a value of 0.8 says nothing about where 0.8 sits.

### 4.2 Spinner — distance-tracked value

No track. The readout itself is the control: pointer-down on it, drag in any direction, value follows `(dx - dy) * k`. Use pointer lock so an unbounded range costs no width.

- Cell: `#232830` fill, `1px solid #2a2e37`, `8px 14px` padding, `cursor: ns-resize`.
- Value: 700 / 18px / tabular, flanked by a `◂▸` glyph at 12px `#7b828e` on the left and the unit suffix at 12px `#7b828e` on the right.
- Sensitivity: `k = 0.6` per px coarse, `0.06` with Shift.

For: Segments, Angle, Spin Speed, Twist, Pressure Iteration, V-Cycles, Pre/Post-Smooth, Coarse Solve, Max Speed, Shooting Star Frequency — anything whose range is huge or whose scale can't be honestly labelled.

### 4.3 Fine-drag modifier (a behaviour, not a component)

Both 4.1 and 4.2 inherit it. Hold Shift, **or** drag more than 40px away from the track vertically, and the pointer-travel-to-value ratio drops to 1:10 (implemented as `value += (target - value) * 0.08` per move event). While active, the row shows `FINE — 1:10` in `#ec3013` where it otherwise shows `COARSE — 1:1` in `#7b828e`. Showing the ratio is how the user learns the modifier exists.

### 4.4 Stepper cell — the hidden-affordance fix

For Brush Size and Fluid's splat count. A raised bordered cell with two nudge caps; the cell is what says "editable".

- Outer border: `1px solid #2a2e37`.
- Nudge caps: 34 × 38px, `linear-gradient(180deg, #2b303a, #1c2027)`, 800 / 16px label, divider `1px solid #2a2e37`.
- Value well: min 66px × 38px, `#232830`, 700 / 18px tabular, centered. Click to type.

### 4.5 Segmented switch

2–5 mutually exclusive options, all visible, one filled. 6+ stays a select.

- Container border `1px solid #2a2e37`; segments `flex: 1`, 40px tall, divided by `1px solid #2a2e37`.
- Unselected: `#232830` / `#b9bec7`. Selected: `#ec3013` / `#fff`.
- Label: 800 / 12px / `.09em` / uppercase (13px tabular for numeric options like `1×`–`8×`).

Absorbs: RND / STEP / GATE, Multi-Brush 1×–8×, Fluid mode, Light Source Manual/Random, Recording Mode, Replay Speed, Replay Mode. **The blue-outlined pill style and the gold pill are retired.**

### 4.6 Select, boolean, text input

- **Select**: 40px, `#232830`, `1px solid #2a2e37`, `0 14px` padding, value 700 / 15px `#f2f3f5`, `▼` at 11px `#7b828e` right.
- **Boolean**: 44px row, full-row hit target, 20px box with `2px` border. On: `#ec3013` fill, `#7b828e` border, label `#f2f3f5`. Off: `#0a0b0e` fill, `#2a2e37` border, label `#7b828e`. No separate on/off word — the label states it.
- **Text input**: select chrome plus a `2px × 20px` `#ec3013` caret. Room code sets `letter-spacing: .3em` at 700 / 17px tabular.

### 4.7 Buttons — three weights only

| Weight | Spec |
| --- | --- |
| Primary | 44px, `#ec3013` fill, `#fff` label, flush left at 16px |
| Secondary | 44px, `#232830`, `1px solid #2a2e37`, `#f2f3f5` label, flush left |
| Ghost | 44px, transparent, `2px solid #2a2e37`, `#b9bec7` label, flush left |
| Icon / transport | 44 × 44px square, secondary chrome; record is `#ec3013` |

Labels: 800 / 13px / `.1em` / uppercase, **flush left, never centered**. The gradient-filled buttons (Create Room, Paint with a stranger) become primary and secondary — the heat gradient is reserved for range fills.

### 4.8 Preset card

Fills its width. Serves gesture cards, physics presets and recorded layers.

- Row: `14px 16px` padding, `#16181d`, `2px solid #0a0b0e` divider, `14px` gap.
- Preview block: 54px wide, full row height, `1px solid #2a2e37`. Render the gesture's own stroke into it; the specimen uses a hatch as a stand-in.
- Name: 800 / 15px / `.09em` / uppercase `#f2f3f5`.
- Hint: 500 / 12.5px `#b9bec7` — "Left click — collide · Right click — expand". The current 8px hint line is not readable.
- Hotkey cap: 26 × 26px, `#232830`, `1px solid #2a2e37`, 800 / 12px `#b9bec7`.

### 4.9 Color well and palette chip

- Well: **38px square**, `1px solid #2a2e37`; selected gets `2px solid #ec3013`. The circular fluid-colour swatch is the only round object in the app and reads as decoration — square it.
- Palette chip: `1px solid #2a2e37` (selected: `2px solid #ec3013`), 8px padding, a 20px band of the palette's own swatches above a 800 / 11px / `.09em` uppercase caption.

## Edge cases

- **Kaleidoscope gear knobs.** The toothed gear is drawn as a rotary and behaves as a linear slider — that mismatch is the problem, not the charm. Promote it to a real endless rotary driving the 4.2 spinner behaviour, and confine it to the three genuinely angular values: **Angle, Twist, Spin Speed**. Segments, Zoom and Blend become faders. It appears in no other panel. (Retiring the gear entirely is the cleaner alternative and loses the app's one piece of personality — the audit argues for keeping it, confined.)
- **Transport cluster** is exempt from one-control-per-row: record / pause / stop / play stay one 44px cap row.
- **Saved swatches** are a wrapping grid inside one row whose height grows; the inset does not change.
- **Stats For Nerds** is not a control panel — read-only label/value pairs at 12px, no rack chrome, no hit targets.

## The hotkey reminder (replaces `js/17-hotkey-reminder.js`)

The current panel is a fixed-position layer at top right, shown whenever Shift, Ctrl or Alt is held. Four problems, only one of which is position:

1. It always renders the 16-chip default group **in addition to** the active modifier group — holding Ctrl shows 19 bindings to answer a 3-binding question.
2. **Shift alone triggers it.** Shift is a live painting modifier (coarse brush, rotate brush, save colour), so it fires as noise mid-stroke.
3. It floats over fixed chrome; nothing reflows, so it covers Multi-Brush, Time, Density and Velocity.
4. A binding never appears beside its control, so recall is supported and learning is not.

Replace with three mechanisms:

- **In-place caps (primary).** Every rack row and toolbar cell carries a key cap in its right margin — 17px tall, `nowrap`, min 34px wide, 800 / 10px. At rest: `#7b828e` on `1px solid #2a2e37`. Holding a modifier lights the caps it reaches (`#fff` on `#ec3013`) and drops unreached cells to `opacity: 0.35`. Cells with no binding reserve an empty cap slot with a transparent border so the row doesn't reflow. A 96px modifier badge at the strip's right end names what's held. Nothing opens, nothing moves, nothing is covered.
- **One appended rack row (fallback).** For bindings with no visible control — Export, Mutate, Focus, layer keys. A 38px full-width row in strip chrome that **pushes the canvas down** rather than covering it: modifier name in a 96px `#ec3013` block, then cap + label pairs at 700 / 12px `#b9bec7` divided by `2px solid #0a0b0e`, and `F1 — ALL HOTKEYS` right-aligned at 500 / 10px `#7b828e`. Only the held modifier's bindings. No default group.
- **One-time teaching flash.** The first time a user changes a value by mouse that has a binding, flash that control's cap for 2s. This is the only moment a hotkey hint has the reader's attention.

Rules: **Shift alone never triggers anything.** The appended row waits a **250ms hold** so a modifier used in passing produces no flash. The F1 modal stays exactly as it is — it is the reference, and a 16-item list belongs there.

## Light Shift playhead

A playhead **already exists** in `js/14-light-shift.js`: interpolated position, hue wrapping, inner core set to the exact colour handed to the shader. It is well built and in the wrong place — a small read-only dot inside a picker, while the path it travels is drawn on the canvas and represented nowhere on it.

Keep the interpolation and colour matching untouched. Render the same head **on the canvas** over the drawn stroke: path visible at low opacity, a 22px chrome cap (`linear-gradient(180deg, #f6f7f9, #9aa1ad)`, `2px solid #0a0b0e`) riding it, grab to scrub, release to resume from where it was dropped. Scrubbing maps the pointer to the nearest sampled point on the path by arc length. The picker head stays as the colour readout it already is. Speed stays a fader; position becomes direct.

Once the head is an object on the canvas: the path becomes editable point-by-point, a second cap gives an in/out loop range, and the same mechanism serves recorded layers — which are also paths through time, currently scrubbed through `0/0` arrows.

## Design tokens

The app has real tokens in `css/00-tokens.css`. The proposed set is a **replacement for the surface tokens**, not an addition — implement by editing that file, not by adding a parallel scale.

| Proposed | Value | Role | Current token it supersedes |
| --- | --- | --- | --- |
| `--ground-950` | `#0a0b0e` | Dividers, slider wells, app backdrop | `--bg-app` `#0a0d12` |
| `--ground-900` | `#0e0f12` | Panel body | `--bg-panel` |
| `--ground-800` | `#16181d` | Rack row | — |
| `--ground-700` | `#191c22` | Panel header, row hover | `--bg-panel-2` `#0f141b` |
| `--ground-600` | `#232830` | Raised cell: steppers, inputs, unselected segments | `--bg-raised` |
| `--ground-500` | `#2a2e37` | Cell borders, tick marks | `--border-default` |
| `--ink-100` | `#f2f3f5` | Labels **and** values, both at full strength | `--text-primary` |
| `--ink-300` | `#b9bec7` | Secondary text, unit suffixes | `--text-secondary` |
| `--ink-500` | `#7b828e` | Hints, counts, disabled | `--text-dim` |
| `--accent` | `#ec3013` | Selected state, primary action, record, focus ring | `--accent` (warm yellow), `--accent-cool` `#4fc3f7` |
| `--heat` | `#f0a626 → #e0432a` | Filled portion of a range. **Nothing else.** | — |
| `--chrome` | `#f6f7f9 → #9aa1ad` | Knob and cap faces — the only bevel allowed | — |

Spacing: `4 / 8 / 12 / 16 / 24 / 32`. Radii: **all 0** (`--radius-sm/md/lg` currently 4/6/10 — zero them). Type: 800/15px/.09em/upper for labels, 700/18px tabular for values, 800/12px/.16em/upper for panel headers, 500/12.5px for hints. Font: keep the app's `--font-ui` stack; the audit's Archivo is the document's typeface, not the app's.

Three colors leave the palette: the warm yellow accent, the cool blue `#4fc3f7`, and the gold used on Multi-Brush. Selection is `--accent` everywhere. This is a bigger visual change than the grid work and is worth confirming before starting.

## Order of work

1. **Rack row** — the container everything drops into, and where the legibility win is.
2. **Fader (4.1)** — 51 of the 130 controls.
3. **Stepper cell (4.4) + segmented switch (4.5)** — closes the affordance gap on the three most-used controls.
4. **Buttons, boolean, select, preset card, color well** — consolidation.
5. **Hotkey caps** — after the rows exist, since the cap lives in the row.
6. **Playhead** — a feature, not a cleanup. Build it when the surface has stopped moving.

## Repo files to touch

| Area | Files |
| --- | --- |
| Tokens | `css/00-tokens.css` |
| Toolbar / strip | `css/20-mixer-strip.css` |
| Panels | `css/21-sidebar.css`, `css/slider-styles.css` |
| Overlays | `css/22-overlays.css` |
| Hotkey reminder | `js/17-hotkey-reminder.js`, `.hotkey-reminder` rules in `css/styles.css`, `css/init-responsive.css` |
| Slider behaviour | `js/05h-slider-bindings.js`, `js/06-slider-updater.js` |
| Control registry | `js/01a-param-registry.js`, `CONTROL-MAPPING.md` |
| Kaleidoscope | `js/05f-kaleido-controls.js` |
| Light Shift playhead | `js/14-light-shift.js` |
| Full hotkey reference | `js/05n-hotkeys-init.js`, the `#hotkeyOverlay` markup in `index.html` |

## Assets

None. Every specimen in the audit is type, rule and gradient — no images, no icon files. The preset card's preview block is intended to render the gesture's own stroke at runtime; the hatched fill in the specimen is a stand-in.

## Files in this bundle

- `Control Surface Breakdown.dc.html` — the audit document with all nine figures and three live specimens. Open in a browser; drag Fig. 2, 3, 4 and 6.
- `doc-page.js` — the paged-document shell the audit renders in. Required for the audit to display.
- `support.js` — runtime for the audit document. Required.
- `README.md` — this file.
