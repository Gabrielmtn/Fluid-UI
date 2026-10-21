# Polish checklist (per stop, before calling anything "clean")

A colour/font audit answers "is it themed?". These answer "does it look right
and work in the states people reach?". Learned 2026-10-17, when Gabriel found
five problems a themed-ness sweep had passed.

## 1. Reach every state
- **Open it.** Every dropdown and popup, by mouse and keyboard. A native
  `<select>` popup is OS chrome: a DOM check never sees it (the geometry
  check flags these as `native`).
- **Cycle it.** Every mode field (Audio Mode, Material, Replay Mode, button
  roles…). Each mode can lay the drawer out differently.
- **Switch it on.** Each feature toggle, to show the sub-panel it hides.
- **Make it.** Content that only exists after an action: Mutate cards, layer
  rows, text lines, animation slots, a playing take, an open room.
- **Hover and focus it.** Some controls only appear on hover (slot ✕).
- **Check the extremes.** Sliders at 0 and at max, disabled, checked and
  unchecked, long names.

## 2. Look at real pixels
- Use `node scripts/polish-tour/shoot.js` (headless, exact size, DPR 2, a
  tall window so long drawers aren't cut off). Read the PNGs, one drawer per
  image. The Browser pane's ~800 px screenshots are too soft to judge.
- Small caps sit low in their line box. A box "centred on the line" looks
  high, so measure ink (pixel rows), not boxes.

## 3. Geometry flags (`geometry.js`, also on the tour card)
`cut` a word wider than its box · `overlap` a control covering words ·
`align` checkbox text off its siblings' line · `uneven` side-by-side
controls of different heights · `empty` a control showing nothing ·
`nested` a frame inside a frame · `heavy` a thick border on a small
control · `emoji` a colour emoji glyph · `native` an OS dropdown ·
`native-box` a browser checkbox.
Flags are leads, not verdicts. Look at each one.

## 4. Before saying done
- Re-shoot what you changed and look again. Fixes introduce their own
  problems (the "Records" label pushed its strip off the edge).
- Run the suites the change touches (theme-fields, theme-tubes, slider-keys,
  radial-menu, dialog-focus).
