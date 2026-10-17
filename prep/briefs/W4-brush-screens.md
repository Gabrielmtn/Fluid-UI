# W4: the Multi-brush drawer and the brush stamp screens

Read `prep/briefs/00-shared.md` first.

**You own** `css/38-theme-brush-screens.css` and `js/73-theme-brush-screens.js`. Outside them, you may add small presentation hooks (a class or data attribute, never a behaviour change) in `js/20-mixer-layout.js` where the arm rows and the brush stamps are built, if observing the DOM can't do it. Keep those hunks small.

## Gabriel's words

> "The thoughtful layout of the brush options in the multi brush picker, with the active state."
> "Multi brush layout broken and mis-structured."

This is the most visible gap in the app. Compare `prep/compare/1920/multibrush-pair.png`: the app (left) shows a count slider, the Symmetry field, two checkboxes, Hold symmetry, then each arm as a cramped row (number, red swatch, a 2-by-2 radio box with clipped words "CUSTO" and "RANDO", a ring button, a Pressure checkbox). The study (right) shows "Brushes 8" on a tube with ticks, an 8-tile VFD screen, and an editor for the selected brush.

## 1. The 8-tile brush screen

Port the study's Multi-brush (markup 726-760, CSS 291-316 and the screen recipe 267-290, script `refreshTiles` 1885, `syncEditor` 1896, `bindRadio` 1910, stamps 2078-2160):

- A VFD screen (`.scr`: dark teal glass, the VFD mesh, scanlines, the copper bezel) holding one tile per arm, four to a row.
- Each tile shows the arm's stamp as phosphor in that arm's colour, its number top left, and its mode letter top right (M main, C custom, R random, P palette).
- The selected tile has copper corner brackets.
- Below the screen: "Brush N" with the arm's colour lamp, the joined MAIN / CUSTOM / RANDOM / PALETTE strip (the arm's existing mode radios), the scrollable CUSTOM BRUSH screen (the arm's existing tip choices as phosphor stamps), and Pressure as a checkbox pane.

The app's controls stay the truth. The arm rows are built by `buildArmColorsDropdown` in `js/20` (~8620; see also `js/05g` and the arm tip menu, `.arm-tip-menu`). The tile screen is new presentation: tiles select which arm's row the editor shows, and the other arms' rows are hidden by a theme class. That selection is local view state: not synced, not saved. Every arm stays editable by picking its tile, and every existing control keeps its id, handler and keyboard behaviour. The tiles are a single tab stop with arrow keys (a radiogroup, or the study's pattern if it differs), named "Brush 1, custom VANS"-style. Follow the arm count: when the count slider changes, tiles appear and disappear, and the selection stays valid.

Stamps: render each arm's tip as phosphor in the arm's colour, for example a CSS mask of the tip image over the arm's colour plus the study's glow. Find where tips come from (the arm tip menu, the Brush drawer's custom brushes). Draw them once on change, never per frame. Lit and selected states use `ThemeMotion.pane` so they strike and fade on the study's timing.

## 2. The Brush drawer's stamp screen

The Brush drawer's custom brush stamps show as white icons on black. Put them on the study's phosphor screen (`.scr` / `.stamps`, 267-290: seven columns, 3 px gap, `.scr-cap` caption): stamps in phosphor, the selected one lit, the screen glass, mesh and bezel. Same stamp rendering as the tiles.

## 3. Fit and finish

Nothing clips, at 1440 and 1920 wide, with 1 to 8 arms, with long custom brush names. The count slider's label reads as the study's ("Brushes" with its value) only if the app's label text already says so; don't rename controls.

## Check

The Multi-brush drawer with 1, 4 and 8 arms, each mode selected, next to the study's. The Brush drawer's stamp screen next to the study's. Keyboard: Tab reaches the tile screen once, arrows move the selection, the editor follows, every arm control is reachable. All suites; the a11y and tab-order gates will differ in this drawer, so explain each difference.
