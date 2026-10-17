# W3: fields, checkboxes, radio banks

Read `prep/briefs/00-shared.md` first.

**You own** `css/37-theme-fields.css` and `js/69-theme-fields.js`. Move the "Field", "Text field", "Checkbox and radio", "Keycaps" and "Inline field options" sections out of `css/31-theme-components.css` into 37 and rewrite them there. You may adjust the "Cathode pane" section of 31 (~20-124) where a radio or checkbox pane needs it. Leave the tube section alone: W2 is moving it.

## Gabriel's words

> "every part of the selects"
> "Notice the dropdown style ... dropdowns no longer tactile luscious components, just dull select boxes."
> "Look at the beautiful combinations of disabled checkboxes"

## 1. Fields: the study's `.cp.sel`

Every sidebar select becomes the study's field (study-lite 170-216 for the pane recipe, 206-216 for the field): 48 px tall in the sidebars, the glass gradient, the fine hex mesh, the value text in the display face, and the copper chevron cell with its divider on the right. At rest a field glows at the study's field brightness, brighter on hover, focus and while open, on the cathode timing (`ThemeMotion.pane`). The inline listbox (js/69) already opens under the field; port the study's open and close motion (`openSelect` / `closeSel`, 2000-2077, the `--open` value) and the option rows' look, so opening feels like the study. Keyboard handling in js/69 stays as it is.

Also bring the top bar's Material select and the Presets field in line with the study's top-bar field (`.msel`, 506-512) if they differ, without changing the Material select's system font (js/29 measures it).

## 2. Checkbox panes

Every native checkbox in both sidebars becomes the study's checkbox pane (`.cp.ic`, 187-197): the row is a pane (glass, copper line, display-face label), and the box is the square cathode indicator with the check drawn in, lit when checked. Disabled panes dim like the study's. The real `<input type="checkbox">` stays the focus target and the source of truth: Space toggles it, its label still names it, and the focus ring shows on the pane.

The markup varies: `<label><input> text</label>`, `<input id> <label for>`, switch rows (`.anim-switch`), and rows js/20 builds (search `type = 'checkbox'` in js/20; there are about a dozen, plus 44 in `index.html`). Inventory them first, then cover each pattern. Use `ThemeMotion.pane(row)` so the indicator strikes on and fades off on the study's timing, with the resting state in CSS (`:has(input:checked)`), because presets and remote sync change `checked` without an event. Master toggles in panel header bars are part of this pass; decide with the study whether they read as checkbox panes or as the study's wide `ic` pane, and say which in your report.

## 3. Radio banks

Radio groups (for example "Paint into", the arm modes) become the study's radio panes (round indicator, 190-194). They must fit the column: wrap or tighten, never clip a word ("COLLI…" was seen). W4 owns the Multi-brush arm editor's MAIN / CUSTOM / RANDOM / PALETTE strip; leave that one alone.

## 4. Text fields and keycaps

Check text fields and the hotkey keycaps against the study and fix what differs.

## Check

Shots of every field, checkbox pattern and radio bank, checked and unchecked, disabled, focused, open (for fields), next to the study's. `node scripts/test/theme-fields/run.js` must still pass; extend it to cover checkbox panes (Space toggles, the pane's state follows a programmatic `checked` change, the focus ring shows).
