# W2: tubes (every range slider)

Read `prep/briefs/00-shared.md` first.

**You own** `css/36-theme-tubes.css` and `js/72-theme-tubes.js`. Move the tube rules out of `css/31-theme-components.css` (the "Bargraph tube" section, ~125-175) into 36 and rewrite them there. Leave the rest of 31 alone: W3 is editing it.

## Gabriel's words

> "slider states at zero (which go off the slider, so a bug)"
> "Look at the beautiful combinations of disabled checkboxes, full bright brush sliders, low dark hold symmetry slider."
> "labels and values mis aligned in the top nav"

## 1. The zero-state bug

At value 0 the thumb's copper diamonds and the white-hot head sit on the tube's rounded end and poke out of the tube; at max the same happens on the right. See `prep/work/zero-symmetryHold.png` and `prep/work/zero-curl.png`. The study insets the travel by 16 px on each side (`.lad`, study-lite 232-257): the head, the halo and the diamonds sit at `16px + p * (100% - 32px)`, the colour column fills the glass up to that point, and the native thumb is 32 px wide so its centre travels exactly that span. Make the app's tubes match at every value: the fill end, the head and both diamonds must coincide with the thumb's centre at 0, at max, and in between, at every tube width in both sidebars and the top bar. Write a check that sets each slider to min, max and a middle value and measures the diamonds and fill end against the tube's straight section (computed style and geometry, then a zoomed screenshot to confirm).

The app draws tubes on the input itself (track and thumb backgrounds, no extra DOM); js/06 writes `--val`, `--min`, `--max` on every range, and js/71 writes `--sp` (0 to 1) and `--spp` (percent) while the value springs. Use `--sp` with a fallback computed from `--val`/`--min`/`--max`. Mind the perceptual proxies (`#colorBlendPerceptual`, `#timeScalePerceptual`, `#brushSizePerceptual`): they are the visible inputs and the canonical ones are hidden.

## 2. Brightness follows the value

In the study a tube at a low value is a dark glass with a faint short column, and a full tube is bright neon with a white-hot head and halo (`.col`, `.halo`, `.glass`, 234-244; the peer tint 338-340). Match it, including the empty glass at exactly 0 (no stray glow, the filament line `.fila` visible). Laminar fills from the centre today; keep that and fix its zero state too.

## 3. Detent ticks

Stepped sliders get the study's copper ticks under the tube (`.ticks`, 250-251: 1.2 px by 4 px, `rgba(214,140,92,.8)`, spread between 16 px and 100% - 16 px). Decide which sliders are stepped (few discrete values, for example the Multi-brush count) and list them. Inputs can't have pseudo-elements, so draw ticks as an extra background layer on the input, or on the row wrapper. js/72 may write a `--steps` count once at init and when `min`, `max` or `step` change (a MutationObserver on those attributes), never per frame.

## 4. Head rows and sizes

The study's slider rows: label left, value right, one line above the tube; tube heights 44 px (38 px small); value in the mono face, lit; label in the engraved display face. Align the app's label and value rows to the tube ends in both sidebars, and fix the top bar's slider label/value alignment if it is off (the Material slider's head row lives in `css/33`; you may edit only that rule there).

## 5. Disabled

Disabled sliders: dark glass, unlit, no head glow, `cursor: default`, as the study's disabled panes dim.

## Check

A contact sheet of every slider family at 0, middle and max, in both sidebars and the top bar, next to the study's tubes at the same zoom. All suites (the radial-menu and stroke-lock suites drag sliders).
