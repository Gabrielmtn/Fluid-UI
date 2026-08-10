# Control surface — input work order

## Scope

**Fix the inputs. Leave the information architecture alone.**

Every control stays in the panel it is in, in the order it is in. No regrouping, no moving controls between the sidebar and the strip, no restructuring the strip, no new navigation. What changes is how each input looks and behaves.

This is deliberately narrower than the design audit (`Control Surface Breakdown.dc.html`), which proposes a full rack-grid rebuild. That rebuild is a later conversation. Everything below is a component-level replacement that can ship one task at a time without touching layout.

### Explicitly out of scope

- The rack grid and its 76px/54px row heights
- The section rail and filter field in the prototype's panel
- The prototype's two-row toolbar strip
- Moving Visual Quality / Physics Detail off the strip
- The Light Shift playhead on canvas (§6.1 of the audit)
- Preset card reflow (§4.8)

If a task below seems to require one of these, stop and flag it rather than expanding.

## Environment

Vanilla JS + CSS in an Electron shell. No framework, no bundler, no build step for the UI. Stylesheets are numbered and linked in order from `index.html` with `css/00-tokens.css` first; JS files are numbered and loaded in order from the loader array in `index.html`. Put new CSS in the numbered stylesheet that already owns the surface; put new behaviour in the numbered JS file that already owns the control.

## About the design files

`Control Surface Breakdown.dc.html` (the audit) and `Control Surface Prototype.dc.html` (a live prototype of the components) are **design references written in HTML**. Do not copy their markup. Open the prototype in a browser and interact with it — the faders, steppers, segmented switches, colour picker, ignite latch and brush cursor are all live, and the feel is part of the spec. `COMPONENTS.md` has the exact numbers.

Fidelity is high: colours, type, sizes and hit targets are deliberate. Match them.

---

## The one thing to read first

`css/slider-styles.css` already does most of the work. Sliders are native `input[type=range]` driven by custom properties:

```css
--min: 0;  --max: 100;  --val: 50;
--pos: calc((var(--val) - var(--min)) / (var(--max) - var(--min)) * 100%);
```

`--val` is kept in sync by `js/06-slider-updater.js`, and `--pos` is already the fill percentage. That means the fader is largely a **restyle of existing pseudo-elements plus one added scale row** — not a new component. Most of Task 1 is deleting CSS.

---

## Task 1 — Collapse five slider treatments into one

**File:** `css/slider-styles.css`

Delete the variant classes `.slider-star`, `.slider-blue`, `.slider-pink`, `.slider-green`, `.slider-gray` and every reference to them in markup and JS. One treatment, no exceptions. This alone removes four of the twelve visual treatments the audit counted.

Then change the base treatment:

| Property | From | To |
| --- | --- | --- |
| `--track-c0-rgb` / `--track-c1-rgb` | `226,182,8` → `184,2,2` | `240,166,38` → `224,67,42` (`#f0a626` → `#e0432a`) |
| `--track-fill-alpha` / `-alpha-b` | `0.65` / `0.76` | `1` / `1` |
| Track background | Six layered metallic gradients over `#9a9a9a` | Flat `#0a0b0e` with `inset 0 0 0 1px #2a2e37` |
| `--track-h` | `0.875em` | `22px` |
| `--track-r`, `border-radius`, `--thumb-r` | `50%` / rounded | `0` everywhere |
| `--thumb-w` | `= --thumb-h` (round) | `16px` |
| `--thumb-h` | `1.75em` | `26px` |
| Thumb background | Conic-gradient chrome ball | `linear-gradient(180deg, #f6f7f9, #9aa1ad)`, `1px solid #0a0b0e` |
| Element `box-shadow` / `background` | Bevelled dark gradient | Remove — the row supplies the ground |
| `:hover` / `:focus` outline | `2px var(--track-c1)` | `:focus-visible { outline: 2px solid #ec3013; outline-offset: 2px }` |

The `--track-e` radial edge mask exists only to round the fill's end cap. With `--track-r: 0` it can go.

Keep the `.js { --js: 1 }` gate, the Firefox `::-moz-range-progress` block (same values), and the `@media (pointer: coarse)` rules.

## Task 2 — Printed scale under every fader

**Files:** `js/06-slider-updater.js`, `css/slider-styles.css`

Three stops — min, midpoint, max — at `800 10px/.08em uppercase #7b828e`, in a flex row with `space-between`, `14px` above the track and `5px` below the label.

Generate them in `06-slider-updater.js` from each input's existing `--min` / `--max` rather than adding markup to ~57 controls by hand: on init, for every `input[type=range]`, insert a scale row before the input and fill it from those two values, respecting the control's decimal precision. One place, no markup churn, and it stays correct when a range changes.

This is the single highest-value change in the list. A value of `0.8` currently tells the user nothing about where `0.8` sits.

## Task 3 — Tick marks

**File:** `css/slider-styles.css`

Nine 1px `#2a2e37` ticks inside the track well. Pure CSS — add a `repeating-linear-gradient` to the `::-webkit-slider-container` background stack (and the Firefox track), beneath the fill layer so the fill covers them as it advances.

## Task 4 — Full-row hit target

**Files:** `css/21-sidebar.css`, `css/20-mixer-strip.css`

Every control's row is its target, minimum 44px tall.

**Expect this one to fight you.** A native `input[type=range]` cannot extend its hit area past its own box, so "the whole row is draggable" is not a CSS property — it needs one of these, in rough order of preference:

1. **Grow the input, not the row.** Raise `--input-p` so the input's own box fills the row's height, and pull the visible track back to 22px with the existing `--track-h`. The padding is already transparent and already part of the input, so it becomes hit area for free. Cheapest, and works with zero JS.
2. **Wrap the row in a `<label>`** whose `for` is the input. Clicking a label forwards to its control natively — but only a click, not a drag, so the pointer would have to land and release without moving. Not enough on its own for a slider.
3. **Forward pointer events from the row.** `pointerdown` on the row container computes the fraction from its own rect and writes the value, then tracks `pointermove` on `window` — the same code path the prototype's fader uses. Most control, most code, and it means the row no longer relies on the native input for dragging.

Option 1 first; fall back to 3 for rows where the label and track are separate elements. Verify with a pointer test at the row's top and bottom edges, not just the middle — the failure mode is a row that looks 44px tall and only responds in its middle 22px.

## Task 5 — Brush Size and Fluid get real affordances

**Files:** `index.html` (strip markup), `css/20-mixer-strip.css`

Both currently render as text with a small marker and are the most-used controls in the app.

- **Brush Size** → stepper cell (`COMPONENTS.md` 4.4): outer `1px solid #2a2e37`; `–` / `+` caps 34 × 38px in `linear-gradient(180deg,#2b303a,#1c2027)`; value well `#232830`, `700 18px` tabular, min 66px. Click the number to type. Keep the `[` / `]` bindings.
- **Fluid** splits in two: the count `25` becomes its own stepper cell; the mode (Fluid / Paint-Wet / Paint-Thick) becomes a segmented switch. Retire the `▼` that opens the hidden popover.

## Task 6 — Colour mode: one radio, one toggle

**Files:** `index.html`, `css/20-mixer-strip.css`, `js/05g-arm-colors.js`

RND / STEP / 🌈 are **mutually exclusive** — draw them as one segmented switch: a single container with `1px solid #2a2e37`, segments divided by `1px solid #2a2e37` and **no gaps**, selected `#ec3013`/`#fff`, unselected `#232830`/`#b9bec7`.

GATE is **not part of that choice** — draw it as a separate bordered toggle with a `10px` gap from the switch. Same fill states, own border.

Touching cells mean pick one; separated cells mean pick any. Drawing all four as identical pills is what made them read as a single group. Keep the `R` and `A` bindings.

## Task 7 — Make the Ignite latch visible

**Files:** `index.html`, `css/20-mixer-strip.css`, plus wherever Ignite's hold is handled

Ignite fires while held and can be latched on, and nothing on screen says the second mode exists. Add a `30px` square cell to the right of the button holding a `9px` indicator: hollow `1px #7b828e` border when unlatched, filled `#fff` on `#ec3013` when latched. Clicking the cell toggles the latch; the button then stays lit hands-free.

Firing fills the button with `#ec3013`, **not** the heat gradient. Heat means "this much of a range is filled" and a momentary action has no range.

## Task 8 — Colour picker

**File:** `css/22-overlays.css`

Keep the picker's structure — it works. Two changes: square every corner (`border-radius: 0`), and move the R / G / B captions **under** their fields at `800 10px/.14em uppercase #7b828e` instead of between them. The number fields take the same chrome as the stepper well from Task 5 at 30px tall.

The picker is the only component in the system allowed to float and the only one allowed a shadow. Everything else is flat.

## Task 9 — Hotkey reminder

**Files:** `js/17-hotkey-reminder.js`, the `.hotkey-reminder` rules in `css/styles.css`, `css/init-responsive.css`

Four problems in the current panel, only one of which is position:

1. It always renders the 16-chip default group **in addition to** the active modifier group — holding Ctrl shows 19 bindings to answer a 3-binding question.
2. **Shift alone triggers it.** Shift is a live painting modifier (coarse brush, rotate brush, save colour), so it fires as noise mid-stroke.
3. It floats over fixed chrome and nothing reflows, so it covers Multi-Brush, Time, Density and Velocity.
4. A binding never appears beside its control, so recall is supported and learning is not.

Replace with, in this order of value:

- **Key caps in place.** Each control row/cell carries a cap in its right margin: 17px tall, `nowrap`, min 30px wide, `800 10px`. At rest `#7b828e` on `1px solid #2a2e37`. Holding a modifier lights the caps it reaches (`#fff` on `#ec3013`) and drops unreached cells to `opacity: 0.35`. **A cell with no binding reserves an empty cap slot with a transparent border** — otherwise rows reflow when a modifier is held, and empty bordered boxes look like rendering artifacts.
- **Delete the default group.** It belongs in the F1 modal, which stays exactly as it is.
- **Never trigger on Shift alone**, and wait a **250ms hold** before showing anything so a modifier used in passing produces no flash.
- **One appended row** for bindings with no visible control (Export, Mutate, Focus, layer keys): 38px full width, in strip chrome, **pushing the canvas down rather than covering it**. Modifier name in a 112px `#ec3013` block, then cap + label pairs at `700 12px #b9bec7` divided by `2px solid #0a0b0e`, `F1 — ALL HOTKEYS` right-aligned at `500 10px #7b828e`.

The existing instant-display toggling (no CSS transitions, to avoid disrupting the WebGL compositor layer) is deliberate — keep it.

## Task 10 — Retire two accents — **DO THIS FIRST**

**File:** `css/00-tokens.css`

**Approved by the product owner.** No further confirmation needed.

Three colours leave the palette: the warm yellow `--accent`, the cool blue `--accent-cool` `#4fc3f7`, and the gold used on Multi-Brush. Selection, primary action, record and focus all become `#ec3013`. Set `--radius-sm/md/lg` to `0`.

It keeps its number for reference, but it runs first. Every other task specifies its colours in the new palette already, so doing this last would mean styling each component twice. Sweep the ramp variables (`--accent-60/-40/-25/-12`) and every literal use of `#4fc3f7` and the Multi-Brush gold at the same time.

The full proposed token table, mapped against the current `00-tokens.css` values, is in `COMPONENTS.md`.

## Task 11 — Leave the brush cursor alone

The canvas cursor — a ring sized to the brush, crossed by a chord whose rotation is the brush angle and whose colour is the upcoming colour — is the best-designed component in the app. Three values, no panel, at the exact point the eye is looking. Do not touch it.

It is also the standard Task 9 is aiming at: nobody needs a legend to learn that scroll resizes the ring, because the control and its feedback are the same object.

---

## Suggested order

**Task 10 first** — it is approved, and every other task already specifies its colours in the new palette, so going last would mean styling everything twice.

Then Tasks 1 → 2 → 3 as one sitting; they deliver most of the value (57 of ~130 controls) and are mostly deletions. Task 4 next, with time budgeted for the hit-target problem. Tasks 5, 6, 7 are independent and each fixes a specific complaint. Task 8 is cosmetic. Task 9 is the biggest behavioural change and stands alone.

## Verifying

For each task, check in the running app: every label's rendered width is not clipped; no element overflows the strip or panel horizontally; the transport cluster and colour well are still visible at the narrowest window the app supports (they are the first things to be pushed off screen when a strip cell refuses to shrink — give value cells `min-width: 0` and the fixed blocks `flex: none`); and every control still reads its bound hotkey.

## Files in this bundle

- `README.md` — this work order.
- `COMPONENTS.md` — full component specs, rack metrics and the token table.
- `Control Surface Prototype.dc.html` — live prototype: 87 controls, the picker, ignite latch, brush cursor, modifier simulation. Interact with it.
- `Control Surface Breakdown.dc.html` — the audit, with the reasoning and the twelve-treatment inventory.
- `doc-page.js`, `support.js` — runtime for the two HTML files.
