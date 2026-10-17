# D — Study survey (study version 19 is in the repo)

Read `prep/briefs/_preamble.md` first, then the "Session notes" in `prep/README.md` and all of `prep/work/open-items/claude-session.md` (Gabriel's design notes and the parity questions already found).

## Inputs

- `design/study-lite.html` only (never the full file). Line numbers below are **full-file v19 numbers**; in the lite copy subtract 2 after line 1198.
- CSS: tokens 8–26 and 134–138, top bar base 36–110, sidebar components 164–417, cabinet and drawers 418–474, top bar specifics 475–574. Markup: top bar 577–641, sidebars 642–1108 (left cabinet 652: Brush 653, Multi-brush 726, Input 763; right cabinet 814: Swirl Together 815, Simulation 846, Colors and palettes 865, Layers 898, Mutate shader 972, Effects 982, Animations 992, Audio 1002, Kaleidoscope 1048, Text 1058, Focus 1068, Display 1078, Export 1088, Settings 1098). Motion 1201–1248. Wiring 1249–1711 (top bar), 1773–2843 (sidebar, cabinet, room) when you need to know which runtime property a component reads. Skip 111–133 and 1109–1196 (dock), 1712–1772 (simulated players), 2903–3332 (console glass: note only which top-bar elements it draws, from the element registry at 1289–1311 and the theme doc).
- `design/walnut-copper-theme.md`, all of it.

## Do

1. **Component catalogue.** One row per component family the study uses (pane, radio/checkbox pane, joined pair, field, text field, bargraph tube, cathode dial, telegraph, keycap, copper ring, VFD screen, spectrum screen, colour CRT, phosphor scope, timing tubes, pilot lamp, nixies, drawer front, Ignite + lock, player chip, bead-row divider with atom, sub-group dotted rule, stamps screen, layer row, …):

| Family | Study selector(s) | What it is | Element + ARIA pattern (role, state attrs, keyboard per the wiring) | States shown and how (class / aria / custom prop) | Runtime props read (`--i`, `--ga`, `--gc`, `--pc`, `--dp`, `--p`, others) | Drawn by CSS / SVG / 2D canvas / console glass | Lines | Notes |

2. **Study control list.** Every control in the study's top bar and both cabinets, in document order: label, family, study id/class, the app control it stands in for (name only; E does the exact mapping), and **a parity flag** where the study shows something the app does not have today or changes a behaviour (new control, new keyboard behaviour, different range, different IA). Use `prep/work/open-items/claude-session.md` rows 2–7 as known examples; find the rest. Also list app features you know of that the study does NOT show (from `prep/README.md`'s surface list: e.g. the quality underbar, More cell, hotkey maker, radial menu) under "Not in the study".

3. **Tokens** on `:root` and at 134–138: name → role (values are in the theme doc; do not restate them).

4. **Motion primitives** (1201–1248): springs, cathode timing, atom; what each is used for; which run per frame vs on change.

5. **Wood and cabinet facts for Gabriel's notes:** how the cabinet panel, the drawer front and the "nub"/pull on the right are built (selectors, lines), where the parquet vs herringbone choice lives (`DP_SRC`/`HB_SRC`, the pattern switch), and where the stain overlay is set, so the later theme step can follow his instruction (herringbone background, parquet headers, no nub).

6. **Atom occurrences.** The atom motif is being replaced by the yin-yang filigree in `design/yin-yang-filigree/` (read its README.md: usable at 64–120 px, noise below 40 px). List every place the study draws an atom (dial hubs, divider atoms, ornaments, the console glass element types, anything else): selector, lines, rendered size in px, whether it rotates and what drives the rotation, and whether the replacement glyph can fit at that size per its README (fits / too small / needs a decision).

Don't extract or rewrite CSS. Skip the intro, dock, tuning panel and simulated players.

## Output

`prep/study-survey.md` with those six sections and `## Open questions`; also `prep/work/open-items/D.md`. Return counts (families, study controls, parity flags, atom occurrences).
