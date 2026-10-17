# W1: drawers and motion

Read `prep/briefs/00-shared.md` first.

**You own** `css/35-theme-drawers.css` and `js/71-theme-motion.js`. You may also edit: the drawer rules in `css/30-theme-walnut-copper.css` (the "Drawers" section, lines ~159-259, and "One container per column", ~385-406), the tray rosette and bead rows in `css/34-theme-scale.css`, the dial hub rules in `css/33-theme-topbar.css`, and `js/70-theme-telegraphs.js` (lever only). Move drawer rules you rewrite into 35 rather than editing them in place, and delete what you replace.

## Gabriel's words

> "getting rid of the parquet ... the spinning atoms (which don't keep speeding up with more interaction, just kind of peter out) ... What we left was a UX with nice easing everywhere."

## 1. Drawer fronts: the study's `.dfront`, no parquet

Today every `.sidebar-section` header is a parquet drawer front (`--wood-parquet`, `assets/textures/parquet-diagonal.jpg`). Replace it with the study's procedural front, values literal (study-lite 427-458):

- `.dfront` 434-441: 46 px tall, 8 px radius, the vertical-grain `repeating-linear-gradient(90deg, ...)` over `linear-gradient(180deg, #3d2313, #24130a)`, the inset copper line, the top highlight, and the drop shadow that grows with `--dp`. Copy title type, hover colour (`#fff1dc`) and focus ring.
- The closed-drawer lamp (`.lamp.dlamp`, 442; behaviour in 2720-2758: lights when a setting inside a closed drawer changes). Check the app's lamp against it.
- **No pull bar** (`.dpull`, 446-450). Gabriel asked for the nub to go; it stays gone.
- The tray (`.dtray`, 453-458) and the cabinet (`.cab`, 427-431): the tray gradient, margins and radius.
- When nothing references the parquet any more, delete `assets/textures/parquet-diagonal.jpg` and its token.

## 2. Drawer open and close easing

Today the drawer spring drives `--dp` (front shadow, tray contents slide), but the layout snaps: the tray appears at full height at once and every drawer below jumps. Read the study's drawer motion (2720-2758, `setDrawer`, `stepDrawers`, and `.cabinet .sp` 430) and make opening and closing glide the way the study's do, on the drawer spring (k 180, z 0.85).

Constraints: no layout reads in the frame. One measurement at the moment of the toggle is fine. Prefer transforms and clipping: for example, measure the tray and the following fronts once at the toggle, then FLIP the following drawers from their old position with `translateY` on the spring while the tray reveals through `clip-path`. If you conclude a height animation is the only faithful option, it may write a height only while the drawer moves, never read one, and you must show with a performance trace of one toggle that there's no forced layout. Keep `.collapsed` and the app's own collapse logic (js/20, js/43) as the truth: the collapsed tray must stay hidden from screen readers and from Tab at rest, and Shift-click single-open and every suite must still work.

## 3. The atoms: momentum

The tray rosette (`--rot`, the "atom" in each drawer's bead row) is a verbatim port of the study's `kickAtom` / `stepAtom` (study 1234-1242): a kick holds a 2.4 rad/s target for 1.1 s. Two problems:

- **A drag never kicks it.** In js/71's `input` handler, a range held by the pointer returns before `kickSectionOf`, so dragging a slider doesn't spin anything until release. The study kicks on every `setLocal` (1838-1862). Kick on every input in the drawer, including remote changes and checkbox, radio, select and button changes.
- **It doesn't build.** Gabriel wants momentum: more interaction spins it faster, and it coasts down smoothly instead of petering out. Make it a flywheel. Each kick adds an impulse to the target speed (capped), the target decays, and the speed eases toward the target with the study's 0.42 s constant. Tune it so one change reads like the study's spin (about 2.4 rad/s for about a second), steady dragging builds to roughly 3 to 4 times that, and letting go coasts down over about 2 s. Rate-limit kicks to one per frame. Under reduced motion it never spins.
- **The dial hubs.** The top bar's four dials have the yin-yang hub (`css/33`). In the study the dial centre is the same atom figure and spins with its dial (`atomD`, rot from `o.atom.a`). If you can do it as a pseudo-element rotated by a `--rot` that js/71 writes on the dial only while it moves, add it with the same flywheel; otherwise note why.

## 4. Easing everywhere in your area

Walk the study's drawers and fronts and list every motion it has that the app doesn't: lamp strike and decay, hover, press surge on the front, the rosette. Port each through js/71, never with a new loop.

## 5. Telegraph lever spring

`js/70` sets the telegraph lever angle directly. Feed it from a spring (`ThemeMotion.Spring`, local profile for your changes, remote for others') stepped through `ThemeMotion.run`, as the study's `stepTeles` (1687) does.

## 6. If time allows: Ignite flicker falloff

While Ignite burns, the study flickers neighbouring panes with falloff `e^(-d / 220 px)` (search the study for 220). Positions may be measured once when the burn starts, never per frame.

## Check

Shots of a drawer front closed, open, and mid-open, next to the study's. A short frame sequence of an open and a close (several screenshots at fixed delays) to show the easing. Rosette angle sampled over a 3 s drag and the coast after it. All suites. Under reduced motion, drawers open at once and nothing spins.
