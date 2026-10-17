# Study map (generated) and its check against the kit's v19 table

Written 2026-10-17 from the output of `prep/scripts/study-map.js` run on `design/walnut-copper-study.html` (version 19: 3,332 lines, 2,189,409 bytes, CRLF). Nobody read the study file directly for this report; everything below is the script's output. Regenerate after a republish with:

```bash
node prep/scripts/study-map.js design/walnut-copper-study.html > prep/study-map.md        # then put this header back
node prep/scripts/study-map.js design/walnut-copper-study.html --lite design/study-lite.html
```

Extras for checking a hand-written map: `--find <regex>` lists matching lines with an 80-character excerpt, `--lines a-b` prints 80-character excerpts of a range (60 lines max); neither ever prints a long line. `STUDY_MAP_DEBUG=1` prints tokenizer state histograms per script block on stderr.

## Lite copy check

`--lite` was written to a scratch path and compared with `cmp` against `design/study-lite.html`: **identical, byte for byte** (3,330 lines, 222,881 bytes; the `\r` of every CRLF line is kept, as gawk kept it; every line ends in `\n`). The removed lines are 1199 and 1200, so lite line numbers are 2 lower from full-file line 1201 on (section 5 below).

## Comparison with the v19 table in `prep/README.kit.md` ("Map of the study file")

Every range in the kit table was checked against the section comments, `:root`/at-rule rows, markup landmarks and declarations in the generated map, and against 80-character excerpts of the boundary lines (`--lines`; saved in `prep/work/study-map.checks.md`). Line numbers are full-file.

| Kit row (v19) | Generated map says | Verdict |
|---|---|---|
| Never load 1199 and 1200: herringbone and parquet textures as base64 data URIs | Long lines are 1199 (1,147,561 chars) and 1200 (818,965). Each is a one-line `<script>` setting `window.HB_SRC` / `window.DP_SRC`, read at 1762 (pattern switch), 2860 (`--parquet` on `.sidebars`) and 3251 (GL texture image) | Agree. Note: they are script globals, not CSS |
| Lite copy is two lines shorter; numbers after 1198 are 2 lower | 1–1198 same; 1201–3332 become 1199–3330 | Agree |
| 8–26 tokens on `:root` | `:root{` 8 … `}` 26 | Agree |
| 134–138 copper tokens and the three mesh URIs, "inside the dock block" | `:root` 134–139 (`--cu`, `--cu-hi`, `--cu-lo` at 135; `--mesh-dim/-lit/-vfd` 136–138; `}` 139), headed by the decorated comment at 133 "sidebar panels: the theme in plain CSS, no shaders" | Agree on the lines. Disagree on the place: this is the head of the sidebar-panel CSS, not part of the dock (next row) |
| 36–110 top bar base; player chips beside-the-control variant 96–99 | "console" comment 36; `.chip.aside` rules 96–99; `@media (forced-colors:active)` 105–109; "dock" comment 111 | Agree |
| 111–163 dock styles (study only), apart from the tokens above | Dock comment 111 … `.sr` 131, blank 132. From 133 on: the sidebar heading comment (133), `:root` tokens (134–139), `.sidebars` grid (140), … `.presets`, `.line`, `.head` (159–162), blank 163 | **Disagree: the dock is 111–132. Lines 133–163 are the sidebar shell's base CSS** (tokens, `.sidebars` layout, `.presets`/`.line`/`.head`). An agent that skips 111–163 misses them; D's reading list should add 133–163 |
| 164–417 sidebar components | Comment 164 "sections inside a sidebar: no box of their own…"; next decorated comment 418 | Agree |
| 418–474 cabinet and drawer fronts, room drawer, nixies | Comment 418 "the sidebar cabinet: one parquet panel, one copper line, a drawer per section"; "swirl together room" 458; next 475 | Agree |
| 475–574 top bar specifics: telegraphs 484–503, change log 492–494, material slider 495–497, full-width layout 521–560, lit-label halo 562, idle easter egg 564–566 | Comment 475 "final console top bar"; `.teles` grid 482–483, `.tele` 484–490 and 498–503; `.feed` 491, `.rnotes`/`.nempty` 492–494; `.mslide` 495–497; comment 521 "full-bleed app bar", `@media` 551–559 and 560; halo comment 561, rule 562; `.cabR .dtitle` 564–565 with its reduced-motion rule 566; `@media (max-width:820px)` 567–574; `</style>` 575 | Agree (the telegraph grid wrapper starts at 482 and the change-log wrapper `.feed` at 491, two and one lines early) |
| 577–641 top bar markup | `<section class="console full" id="console">` 577 … `</section>` 640, blank 641 | Agree |
| 642–1108 sidebar markup; left cabinet 652 (Brush 653, Multi-brush 726, Input 763); right cabinet 814 (Swirl Together 815, Simulation 846, Colors and palettes 865, Layers 898, Mutate shader 972, Effects 982, Animations 992, Audio 1002, Kaleidoscope 1048, Text 1058, Focus 1068, Display 1078, Export 1088, Settings 1098) | 642 `<main class="wrap">`; **643–647 `<header class="intro">`** (eyebrow, `<h1>Walnut &amp; Copper</h1>`, lede: the study page's own intro); 650 `.lower`, 651 `.sidebars.cabinet`; 652 `role="region" aria-label="Brush sidebar"`; `<section class="sp drw">` at 653, 726, 763; 814 `role="region" aria-label="Sections"`; drawer sections at 815, 846, 865, 898, 972, 982, 992, 1002, 1048, 1058, 1068, 1078, 1088, 1098; each `<h2 id="sp-…">` is two lines later (655, 728, 765, 817, 848, 867, 900, 974, 984, 994, 1004, 1050, 1060, 1070, 1080, 1090, 1100); closes 1106–1108 | Agree. The kit's numbers are the `<section class="sp drw">` lines, the heading landmarks are +2. The intro header 643–647 is scaffolding the kit's skip list does not name |
| 1109–1196 dock markup (study only) | `<section class="dock" aria-label="Rules and tuning">` 1109 … `</section>` 1194; `</div>` 1195 closes `.lower`; **1196 is `<div class="sr" aria-live="polite" id="announce">`**, the live region `announce()` (1468) writes to; `</main>` 1197 | Disagree on the last line: dock markup is 1109–1194; 1196 is the announcements live region (Multiplayer), not skippable |
| 1201–1248 springs, cathode timing, atoms | `<script>` 1201; IIFE `(() => {` 1202; reduced-motion 1204–1205; `PROF` 1209; `class Spring` 1210; `class Cathode` 1221; atoms 1236–1239; `OUTER`, `$`, `con` 1245–1247 | Agree |
| 1249–1396 parameters (with the material slider labels), element registry, pane width rule, state sync, material swap, change targets | parameters 1249 (`MAT_SLIDER` 1258); players 1282; element registry 1289; pane width rule 1312; state sync 1333; `targetsFor` 1354; `matSwap` 1369; `applyChange` 1374; `release` 1395 | Agree |
| 1397–1494 change log, announcements, player chips | "cathode screen notifications" 1397; `notify` 1420; `announce` 1468; `showChip` 1475; `updateReadout` 1489 | Agree |
| 1495–1711 input wiring; held Ignite and its lock (1522); fields and commands (1559); telegraphs, hover preview and the order flag (1567–1711) | "input wiring" 1495; ignite comment 1522, `igHolders` 1523, `igHold` 1524; "top bar fields and commands" 1559; "engine order telegraphs" 1567, `TELE` 1568 … `flagTo` 1674, `stepTeles` 1689; next section 1712 | Agree, exactly |
| 1712–1772 simulated remote players and tuning (study only) | "simulated remote players" 1712; "tuning" 1739; next 1773 | Agree |
| 1773–2276 sidebar wiring: brush screen, radios, checkboxes, sliders, keycaps, comboboxes, swatches, press surge, sharing split, player tints | "light" 1773–1781 (the console glass's light-source mode: `[data-light]` buttons, pointer following, `lx`/`ly` springs); divider 1783 "Sidebar panels: personal settings, rendered in plain CSS"; multi-brush 1876, indicators 1908, radio groups 1911, checkboxes 1929, ladders 1936, keycaps 1953, comboboxes 1999, swatches 2077, brush organizer 2092, press surge 2173; divider 2176 "Shared sidebar settings (layers, gates)"; sharing split 2216; tints 2220; gates at 2277 | Agree on the range. Note: 1773–1781 is a console-glass block driven from the dock, not sidebar wiring; the panels' wiring starts at 1783 |
| 2277–2721 gates, light shift CRT, layers, timing, gravity scope | gates 2277; light shift 2424; layers 2521; timing 2586; gravity 2654; cabinet 2722 | Agree |
| 2722–2843 drawers, idle easter egg, closed-drawer lamp, room drawer, change log empty state | cabinet 2722; idle 2736; lamp 2757; room 2761; `stepFeed` 2837 (empty state "Quiet · no changes yet" 2840); last statement 2843 | Agree |
| 2844–2902 filigree ornaments as small SVGs | comment 2844; `(function ornaments(){` 2845; `filSections` 2864; **`sidebarFrame(dt)` 2874** (the sidebars' per-frame step); ladder readouts 2900 | Agree on the range; the row misses `sidebarFrame`, a per-frame function that matters under the performance freeze |
| 2903–3332 WebGL console glass; draw (3266); frame loop (3293) | "WebGL" 2903; `VS` 2904; `FS` 2907 (one template literal to about 3222); `gl` 3223; `PQ` 3224; `resize` 3256; `draw()` 3266; `frame(now)` 3293; `requestAnimationFrame(frame)` 3330; `})();` 3331; `</script>` 3332 | Agree, exactly |

The kit's header also holds: 3,332 lines, 2.19 MB, one `<style>` block (6–575) and the whole script inside one IIFE (1202–3331).

### Disagreements, in short

1. **111–163 "dock"**: the dock CSS ends at 132. Lines 133–163 are the sidebar shell (heading comment 133, copper and mesh tokens 134–139, `.sidebars` layout 140–162). The kit's skip range, and the D reading list copied into `prep/README.md`'s session notes (tokens 134–138, sidebar components from 164), leave 140–163 unread.
2. **1196** is the `#announce` live region, not dock markup; dock markup is 1109–1194.
3. **643–647** is the study page's intro header (study-only scaffolding) inside the "sidebar markup" range and absent from the kit's skip list (dock, simulated players).
4. **1773–1781** (light-source mode for the console glass) sits at the head of "sidebar wiring"; the sidebar panels' wiring starts at the divider at 1783.
5. Minor: the drawer numbers (653, 726, …, 1098) are `<section class="sp drw">` lines; each `<h2 id="sp-…">` landmark is 2 lines later. Telegraph CSS starts at 482 (`.teles`), change-log CSS at 491 (`.feed`). `sidebarFrame(dt)` at 2874 is in the ornaments range.

### Other things the map shows (not line disagreements)

- The study has `@media (forced-colors:active)` at 105–109, 322–326 and 399, and `prefers-reduced-motion` at 256, 398 and 566; the app has no forced-colors rules today (session notes in `prep/README.md`).
- Fonts load from Google Fonts at lines 3–5 (CSS prep step 6 bundles them).
- The textures reach the page three ways: `--parquet` is set on `.sidebars` from JS at 2860, the herringbone becomes a GL texture image at 3251, and the dock's pattern switch reads both at 1762. Step 6 ("referenced by URL") has to cover the first two.
- `prep/README.md`'s own "Map of the study file" is still the v18 table (long lines 1183–1184); its session notes already defer to the kit's v19 table. The generated map below can replace both whenever the study is republished.

---

## Study map: `walnut-copper-study.html`

Generated by `prep/scripts/study-map.js` on 2026-10-17. Line numbers are for the full file; the **Lite** column is the same line in the texture-stripped copy (section 5).

- 3,332 lines, 2,189,409 bytes (2.19 MB)
- 2 lines of 20,000+ characters (1199, 1200)
- 1 `<style>` block: 6–575
- 3 `<script>` blocks: 1199–1199, 1200–1200, 1201–3332
- markup outside those blocks: 1–6, 575–1201, 3332
- 234 markup landmarks (183 with an id, 41 with aria-label, 2 role=region, 26 h2, 21 buttons with aria-expanded)

### 1. Long lines (never load these)

| Line | Length (chars) | First 60 characters |
|---|---|---|
| 1199 | 1,147,561 | `<script>window.HB_SRC="data:image/jpeg;base64,/9j/4AAQSkZJRg` |
| 1200 | 818,965 | `<script>window.DP_SRC="data:image/jpeg;base64,/9j/4AAQSkZJRg` |

Rule: a line is long when its length (including a trailing CR) is 20,000 or more, the complement of `awk 'length($0) < 20000'`.

### 2. `<style>` blocks and their section comments

#### Style block 1: lines 6–575

30 comment rows (comments on their own line; **bold** = decorated), 16 rule rows (top-level `:root` blocks and at-rules, listed so token ranges can be checked).

| Line | Lite | Kind | Section comment / rule | Note |
|---|---|---|---|---|
| 7 | 7 | comment | Layout: one hi-fi console (veneer fascia, drawer bay, main nav of cathode dials, sidebar … |  |
| 8–26 | 8–26 | rule | `:root` |  |
| 36 | 36 | comment | **console** |  |
| 63 | 63 | comment | cathode panes: the label is the glyph; --i is cathode brightness 0..1, --ga is another pl… |  |
| 105–109 | 105–109 | rule | `@media (forced-colors:active)` |  |
| 111 | 111 | comment | **dock** |  |
| 133 | 133 | comment | **sidebar panels: the theme in plain CSS, no shaders** |  |
| 134–139 | 134–139 | rule | `:root` |  |
| 164 | 164 | comment | sections inside a sidebar: no box of their own. A bead-row divider opens each one, with a… |  |
| 171 | 171 | comment | cathode pane |  |
| 187 | 187 | comment | indicators: round cathode for radios, square cathode with a check for checkboxes |  |
| 198 | 198 | comment | joined pair: one strip, square inner corners |  |
| 205 | 205 | comment | field (select-only combobox) |  |
| 217 | 217 | comment | keycap: a cathode window with a second copper line inside, like a keycap face |  |
| 231 | 231 | comment | sidebar sliders: the console's bargraph tube (IN-9 style) in CSS |  |
| 255 | 255 | rule | `@keyframes neonflick` |  |
| 256 | 256 | rule | `@media (prefers-reduced-motion:reduce)` |  |
| 257 | 257 | comment | tip glyphs |  |
| 266 | 266 | comment | brush organizer: a VFD screen, stamps drawn as phosphor |  |
| 282 | 282 | comment | multi-brush: brush tiles on the screen; each brush's stamp glows in its own colour |  |
| 298 | 298 | comment | multi-brush channel cards |  |
| 317 | 317 | comment | stroke locks |  |
| 322–326 | 322–326 | rule | `@media (forced-colors:active)` |  |
| 329 | 329 | comment | **new components: gates screen, color CRT, pilot lamp, text field, disclosure, layer rows** |  |
| 341 | 341 | comment | gates: VFD spectrum with copper-lidded gates |  |
| 360 | 360 | comment | light shift: a colour CRT with an aperture-grille mask |  |
| 367 | 367 | comment | pilot lamp: a round cathode used for on/off like layer visibility |  |
| 373 | 373 | comment | text field: unlit until focused, then it strikes |  |
| 381 | 381 | comment | layers |  |
| 398 | 398 | rule | `@media (prefers-reduced-motion:reduce)` |  |
| 399 | 399 | rule | `@media (forced-colors:active)` |  |
| 401 | 401 | comment | timing: neon tubes with falling cues |  |
| 410 | 410 | comment | gravity: a round phosphor scope |  |
| 418 | 418 | comment | **the sidebar cabinet: one parquet panel, one copper line, a drawer per section** |  |
| 425 | 425 | rule | `@media (max-width:1180px)` |  |
| 426 | 426 | rule | `@media (max-width:760px)` |  |
| 458 | 458 | comment | swirl together room |  |
| 475 | 475 | comment | **final console top bar** |  |
| 518 | 518 | rule | `@media (max-width:980px)` |  |
| 521 | 521 | comment | **full-bleed app bar: the real nav's order, edge to edge** |  |
| 551–559 | 551–559 | rule | `@media (max-width:1700px)` |  |
| 560 | 560 | rule | `@media (max-width:1430px)` |  |
| 561 | 561 | comment | lit panes keep their label legible: a dark halo under the cathode glow |  |
| 563 | 563 | rule | `@media (max-width:640px)` |  |
| 566 | 566 | rule | `@media (prefers-reduced-motion:reduce)` |  |
| 567–574 | 567–574 | rule | `@media (max-width:820px)` |  |

### 3. Markup landmarks (lines 1–6, 575–1201, 3332)

Every element with an `id`, with `aria-label` or `role="region"`, every `<h2>`, and every `<button>` with `aria-expanded`. Depth = number of open ancestors at that point (the `<style>`/`<script>` elements count; their contents are not scanned). Text is the element's own text when its closing tag is on the same line.

| Line | Lite | Depth | Element | id | ARIA | class | Text |
|---|---|---|---|---|---|---|---|
| 577 | 577 | 0 | `section` | `console` | aria-label="Swirl Together controls" | `console full` |  |
| 578 | 578 | 1 | `canvas` | `gl` | aria-hidden=true |  |  |
| 581 | 581 | 2 | `div` | `ornMat` |  | `orn ngrp nmat` |  |
| 583 | 583 | 4 | `span` | `lbl-mat` |  | `lbl` | Material type |
| 584 | 584 | 4 | `div` | `matPane` |  | `cap msel` |  |
| 584 | 584 | 5 | `select` | `matSel` | aria-labelledby=lbl-mat |  |  |
| 589 | 589 | 5 | `span` | `lbl-matv` |  | `lbl` | Vorticity |
| 589 | 589 | 5 | `span` | `val-matv` |  | `val` | 0.50 |
| 590 | 590 | 4 | `div` | `trk-matv` |  | `track` |  |
| 590 | 590 | 5 | `input[type=range]` | `in-matv` | aria-labelledby=lbl-matv |  |  |
| 593 | 593 | 2 | `div` | `ornDialsA` |  | `orn ngrp np` |  |
| 595 | 595 | 5 | `span` | `lbl-viscosity` |  | `lbl` | Viscosity |
| 595 | 595 | 5 | `span` | `val-viscosity` |  | `knob-val` | 0.30 |
| 596 | 596 | 5 | `span` | `lbl-isolation` |  | `lbl` | Isolation |
| 596 | 596 | 5 | `span` | `val-isolation` |  | `knob-val` | 4.507 |
| 599 | 599 | 2 | `div` | `ornTele` |  | `orn ngrp np` |  |
| 601 | 601 | 5 | `span` | `lbl-laminar` |  | `lbl` | Laminar / Blend |
| 602 | 602 | 5 | `span` | `lbl-time` |  | `lbl` | Time |
| 605 | 605 | 2 | `div` | `ornDialsB` |  | `orn ngrp np` |  |
| 607 | 607 | 5 | `span` | `lbl-density` |  | `lbl` | Density |
| 607 | 607 | 5 | `span` | `val-density` |  | `knob-val` | 0.9989 |
| 608 | 608 | 5 | `span` | `lbl-velocity` |  | `lbl` | Velocity |
| 608 | 608 | 5 | `span` | `val-velocity` |  | `knob-val` | 0.9587 |
| 611 | 611 | 2 | `div` | `ornAct` |  | `orn ngrp nact` |  |
| 613 | 613 | 4 | `div` | `modeGroup` | role=radiogroup aria-label="Color mode" | `row` |  |
| 618 | 618 | 4 | `button` | `limitBtn` | aria-pressed=true | `cap` | Limit |
| 621 | 621 | 4 | `span` |  | role=img aria-label="Current color: warm yellow" | `lamp cswatch` |  |
| 622 | 622 | 4 | `button` | `igniteBtn` |  | `cap igb` | Ignite |
| 623 | 623 | 4 | `button` | `sqBtn` | aria-label="Lock ignite on" aria-pressed=false | `cap sq` |  |
| 626 | 626 | 2 | `div` | `ornScene` |  | `orn ngrp nscn` |  |
| 628 | 628 | 4 | `div` | `presetPane` |  | `cap msel psel` |  |
| 628 | 628 | 5 | `select` | `presetSel` | aria-label="Presets" |  |  |
| 633 | 633 | 4 | `button` | `clearBtn` |  | `cap danger` | Clear |
| 634 | 634 | 4 | `button` | `pauseBtn` | aria-label="Pause" aria-pressed=false | `cap sq` |  |
| 635 | 635 | 4 | `button` | `stopBtn` |  | `cap` | Stop |
| 639 | 639 | 1 | `div` | `chips` | aria-hidden=true |  |  |
| 652 | 652 | 3 | `div` |  | role=region aria-label="Brush sidebar" | `cab cabL` |  |
| 655 | 655 | 6 | `h2` | `sp-brush` |  | `dh` | Brush |
| 655 | 655 | 7 | `button` |  | aria-expanded=false | `dfront` | Brush |
| 658 | 658 | 5 | `div` | `db-sp-brush` |  | `dbody` |  |
| 661 | 661 | 9 | `h3` | `h-presets` |  | `sect` | Presets |
| 663 | 663 | 10 | `div` | `presetGroup` | role=radiogroup aria-labelledby=h-presets | `row` |  |
| 669 | 669 | 9 | `h3` | `h-paint` |  | `sect` | Paint into |
| 676 | 676 | 10 | `button` | `cb-cursor` | role=checkbox | `cp sm ic` | Show cursor |
| 683 | 683 | 10 | `input[type=range]` |  | aria-label="Brush ghost opacity" |  |  |
| 687 | 687 | 9 | `h3` | `h-tip` |  | `sect` | Tip |
| 689 | 689 | 10 | `button` |  | role=radio aria-label="Small dot" | `cp sm sq` |  |
| 690 | 690 | 10 | `button` |  | role=radio aria-label="Disc" | `cp sm sq` |  |
| 691 | 691 | 10 | `button` |  | role=radio aria-label="Square" | `cp sm sq` |  |
| 692 | 692 | 10 | `button` |  | role=radio aria-label="Wide rectangle" | `cp sm sq` |  |
| 693 | 693 | 10 | `button` |  | role=radio aria-label="Ring" | `cp sm sq` |  |
| 695 | 695 | 10 | `div` | `stamps` | role=radiogroup aria-label="Stamp" | `stamps` |  |
| 697 | 697 | 10 | `span` | `stampName` | aria-live=off | `scr-cap` | VANS |
| 699 | 699 | 11 | `button` |  | aria-label="Add a stamp" | `cp sm sq` | + |
| 707 | 707 | 10 | `input[type=range]` | `in-texture` |  |  |  |
| 709 | 709 | 10 | `input[type=range]` | `in-angle` |  |  |  |
| 710 | 710 | 9 | `span` | `h-stroke` |  | `lbl` | Stroke |
| 716 | 716 | 10 | `input[type=range]` | `in-interval` |  |  |  |
| 718 | 718 | 10 | `input[type=range]` | `in-flow` |  |  |  |
| 720 | 720 | 10 | `input[type=range]` | `in-jitter` |  |  |  |
| 728 | 728 | 6 | `h2` | `sp-multi` |  | `dh` | Multi-brush |
| 728 | 728 | 7 | `button` |  | aria-expanded=false | `dfront` | Multi-brush |
| 731 | 731 | 5 | `div` | `db-sp-multi` |  | `dbody` |  |
| 735 | 735 | 10 | `span` | `lbl-sym` |  | `lbl` | Symmetry |
| 741 | 741 | 10 | `input[type=range]` | `in-hold` |  |  |  |
| 745 | 745 | 10 | `input[type=range]` | `in-mb` |  |  |  |
| 746 | 746 | 10 | `div` | `btiles` | role=radiogroup aria-label="Brush to edit" | `btiles` |  |
| 747 | 747 | 10 | `span` | `bedit-t` |  | `lbl` | Brush 1 |
| 747 | 747 | 10 | `label` | `bsw` |  | `sw` |  |
| 747 | 747 | 11 | `input[type=color]` |  | aria-label="Custom color for the selected brush" |  |  |
| 748 | 748 | 9 | `div` |  | role=radiogroup aria-label="Color source" | `joined` |  |
| 754 | 754 | 10 | `span` | `lbl-bpre` |  | `lbl` | Custom brush |
| 754 | 754 | 10 | `span` | `bpreName` |  | `scr-cap` |  |
| 755 | 755 | 10 | `div` | `mstamps` | role=radiogroup aria-labelledby=lbl-bpre | `mstamps` |  |
| 765 | 765 | 6 | `h2` | `sp-input` |  | `dh` | Input |
| 765 | 765 | 7 | `button` |  | aria-expanded=false | `dfront` | Input |
| 768 | 768 | 5 | `div` | `db-sp-input` |  | `dbody` |  |
| 772 | 772 | 10 | `span` | `lbl-left` |  | `lbl` | Left click |
| 774 | 774 | 10 | `span` | `lbl-right` |  | `lbl` | Right click |
| 776 | 776 | 10 | `span` | `lbl-mid` |  | `lbl` | Middle click |
| 784 | 784 | 10 | `button` |  | aria-label="Clear the Keep distance key" | `clr` |  |
| 785 | 785 | 11 | `span` | `d-dist` |  | `sub` | Circles round the center |
| 789 | 789 | 10 | `button` |  | aria-label="Clear the Keep angle key" | `clr` |  |
| 790 | 790 | 11 | `span` | `d-angle` |  | `sub` | To and from the center |
| 795 | 795 | 9 | `h3` | `h-replay` |  | `sect` | Replay |
| 801 | 801 | 10 | `input[type=range]` | `in-rspeed` |  |  |  |
| 803 | 803 | 10 | `span` | `lbl-sin` |  | `lbl` | Splat in |
| 805 | 805 | 10 | `span` | `lbl-sout` |  | `lbl` | Splat out |
| 814 | 814 | 3 | `div` |  | role=region aria-label="Sections" | `cab cabR` |  |
| 817 | 817 | 6 | `h2` | `sp-room` |  | `dh` | Swirl Together |
| 817 | 817 | 7 | `button` |  | aria-expanded=false | `dfront` | Swirl Together |
| 820 | 820 | 5 | `div` | `db-sp-room` |  | `dbody` |  |
| 822 | 822 | 8 | `div` | `roomLive` |  | `fil` |  |
| 823 | 823 | 11 | `i` | `roomLamp` | aria-hidden=true | `lamp live` |  |
| 823 | 823 | 11 | `span` | `roomStatus` |  | `lbl` | Sharing settings · 3 here |
| 824 | 824 | 9 | `div` | `roomNix` | role=img aria-label="Room code" | `nixies` |  |
| 825 | 825 | 10 | `div` | `notes` | role=log aria-label="Recent changes in this room" | `notes rnotes` |  |
| 825 | 825 | 10 | `div` | `notesEmpty` | aria-hidden=true | `nempty` | Quiet · no changes yet |
| 826 | 826 | 10 | `button` | `roomCopy` |  | `cp sm` | Copy code |
| 826 | 826 | 10 | `button` | `roomLeave` |  | `cp sm danger` | Leave |
| 828 | 828 | 8 | `div` | `roomIdle` |  | `fil` |  |
| 829 | 829 | 10 | `button` | `roomStart` |  | `cp` | Start a room |
| 829 | 829 | 10 | `button` | `roomStranger` |  | `cp` | Stranger |
| 830 | 830 | 10 | `input` | `roomCode` | aria-label="Room code" | `tf` | Join |
| 830 | 830 | 10 | `button` | `roomJoin` |  | `cp sm` | Join |
| 833 | 833 | 9 | `button` | `roomSync` | aria-expanded=false | `cp sm wide` | Sync phone |
| 834 | 834 | 9 | `div` | `roomPair` |  | `pairbox` |  |
| 835 | 835 | 10 | `div` | `pairNix` | role=img aria-label="Pairing code" | `nixies` |  |
| 836 | 836 | 11 | `span` | `pairLeft` |  |  | 60 |
| 838 | 838 | 9 | `button` | `roomLinkBtn` |  | `cp sm wide` | Link to current settings |
| 839 | 839 | 9 | `input` | `roomLink` | aria-label="Link to current settings" | `tf` |  |
| 840 | 840 | 9 | `span` | `roomMsg` | aria-live=polite | `scr-cap` |  |
| 848 | 848 | 6 | `h2` | `sp-grav` |  | `dh` | Simulation |
| 848 | 848 | 7 | `button` |  | aria-expanded=false | `dfront` | Simulation |
| 851 | 851 | 5 | `div` | `db-sp-grav` |  | `dbody` |  |
| 855 | 855 | 9 | `div` | `scope` | role=group aria-label="Gravity direction" | `scope` |  |
| 856 | 856 | 10 | `canvas` | `scv` | aria-hidden=true |  |  |
| 858 | 858 | 10 | `span` | `gravRead` |  | `scr-cap` |  |
| 859 | 859 | 9 | `p` | `gravHelp` |  | `hint` | Drag the dot to point gravity; further from the c… |
| 867 | 867 | 6 | `h2` | `sp-light` |  | `dh` | Colors and palettes |
| 867 | 867 | 7 | `button` |  | aria-expanded=false | `dfront` | Colors and palettes |
| 868 | 868 | 7 | `span` | `lsLamp` | aria-hidden=true | `lamp cur` |  |
| 870 | 870 | 5 | `div` | `db-sp-light` |  | `dbody` |  |
| 873 | 873 | 9 | `span` | `lbl-crt` |  | `lbl` | Draw a path through color |
| 874 | 874 | 9 | `div` | `crt` | role=group aria-labelledby=lbl-crt | `crt` |  |
| 875 | 875 | 10 | `canvas` | `crtcv` | aria-hidden=true |  |  |
| 877 | 877 | 9 | `p` | `crtHelp` |  | `hint` | Drag to draw. From the keyboard, the arrow keys m… |
| 878 | 878 | 10 | `span` | `crtInfo` | aria-live=polite | `scr-cap` |  |
| 878 | 878 | 10 | `span` | `crtNow` | aria-hidden=true | `scr-cap` |  |
| 881 | 881 | 10 | `span` | `lbl-blend` |  | `lbl` | Blend mode |
| 884 | 884 | 10 | `input[type=range]` | `in-lsspeed` |  |  |  |
| 886 | 886 | 10 | `input[type=range]` | `in-lsth` |  |  |  |
| 888 | 888 | 10 | `input[type=range]` | `in-lsint` |  |  |  |
| 890 | 890 | 10 | `input[type=range]` | `in-lssat` |  |  |  |
| 900 | 900 | 6 | `h2` | `sp-layers` |  | `dh` | Layers |
| 900 | 900 | 7 | `button` |  | aria-expanded=false | `dfront` | Layers |
| 901 | 901 | 7 | `span` | `layerCount` |  | `val` | 2 layers |
| 903 | 903 | 5 | `div` | `db-sp-layers` |  | `dbody` |  |
| 907 | 907 | 10 | `button` |  | aria-label="Capture 0 settings" aria-expanded=true | `disc` |  |
| 908 | 908 | 11 | `img` | `th0` |  |  |  |
| 909 | 909 | 10 | `input[type=text]` |  | aria-label="Layer name" | `tf` |  |
| 912 | 912 | 10 | `button` |  | role=checkbox aria-label="Show Capture 0" | `cp sm ic` | Show |
| 913 | 913 | 10 | `button` |  | aria-label="Delete Capture 0" | `cp sm danger` | Delete |
| 915 | 915 | 9 | `div` | `lyr0b` |  | `lyr-body` |  |
| 917 | 917 | 12 | `input[type=range]` | `in-l0op` |  |  |  |
| 925 | 925 | 12 | `input[type=range]` | `in-l0mt` |  |  |  |
| 927 | 927 | 13 | `span` | `lbl-clip0` |  | `lbl` | Clip |
| 929 | 929 | 12 | `button` |  | role=checkbox aria-label="Invert clip" | `cp sm ic` | Inv |
| 936 | 936 | 10 | `button` |  | aria-label="Canvas settings" aria-expanded=true | `disc` |  |
| 937 | 937 | 11 | `img` | `th1` |  |  |  |
| 938 | 938 | 10 | `input[type=text]` |  | aria-label="Layer name" | `tf` |  |
| 941 | 941 | 10 | `button` |  | role=checkbox aria-label="Show Canvas" | `cp sm ic` | Show |
| 942 | 942 | 10 | `button` |  | aria-label="Delete Canvas" | `cp sm danger` | Delete |
| 944 | 944 | 9 | `div` | `lyr1b` |  | `lyr-body` |  |
| 946 | 946 | 12 | `input[type=range]` | `in-l1op` |  |  |  |
| 947 | 947 | 13 | `input[type=color]` |  | aria-label="Canvas layer color" |  |  |
| 951 | 951 | 12 | `span` | `lbl-l1mode` |  | `lbl` | Collision mode |
| 954 | 954 | 12 | `input[type=range]` | `in-l1st` |  |  |  |
| 956 | 956 | 12 | `input[type=range]` | `in-l1th` |  |  |  |
| 958 | 958 | 12 | `input[type=range]` | `in-l1fe` |  |  |  |
| 974 | 974 | 6 | `h2` | `sp-mutate` |  | `dh` | Mutate shader |
| 974 | 974 | 7 | `button` |  | aria-expanded=false | `dfront` | Mutate shader |
| 977 | 977 | 5 | `div` | `db-sp-mutate` |  | `dbody` |  |
| 984 | 984 | 6 | `h2` | `sp-effects` |  | `dh` | Effects |
| 984 | 984 | 7 | `button` |  | aria-expanded=false | `dfront` | Effects |
| 987 | 987 | 5 | `div` | `db-sp-effects` |  | `dbody` |  |
| 994 | 994 | 6 | `h2` | `sp-anim` |  | `dh` | Animations |
| 994 | 994 | 7 | `button` |  | aria-expanded=false | `dfront` | Animations |
| 997 | 997 | 5 | `div` | `db-sp-anim` |  | `dbody` |  |
| 1004 | 1004 | 6 | `h2` | `sp-gates` |  | `dh` | Audio |
| 1004 | 1004 | 7 | `button` |  | aria-expanded=false | `dfront` | Audio |
| 1005 | 1005 | 7 | `span` | `gateCount` |  | `val` | 0 gates |
| 1007 | 1007 | 5 | `div` | `db-sp-gates` |  | `dbody` |  |
| 1009 | 1009 | 8 | `div` | `gatesFil` |  | `fil` |  |
| 1010 | 1010 | 9 | `div` | `gscr` |  | `scr gscr` |  |
| 1011 | 1011 | 10 | `canvas` | `gcv` | aria-hidden=true |  |  |
| 1013 | 1013 | 10 | `div` | `glayer` | role=group aria-label="Gates on the spectrum" | `glayer` |  |
| 1015 | 1015 | 9 | `p` | `gHelp` |  | `hint` | Drag across the screen to draw a gate; its lid is… |
| 1022 | 1022 | 10 | `span` | `lbl-nogate` |  | `lbl` | No-gate mode |
| 1025 | 1025 | 10 | `input[type=range]` | `in-ggain` |  |  |  |
| 1027 | 1027 | 10 | `input[type=range]` | `in-gvol` |  |  |  |
| 1029 | 1029 | 10 | `input[type=range]` | `in-gspeed` |  |  |  |
| 1035 | 1035 | 8 | `span` | `sp-timing` |  | `lbl` | Timing lanes |
| 1035 | 1035 | 8 | `span` | `timCap` |  | `scr-cap` |  |
| 1035 | 1035 | 8 | `button` | `timClose` | aria-label="Hide timing lanes" aria-expanded=true | `clr sm` |  |
| 1037 | 1037 | 8 | `div` | `timBody` |  | `fil` |  |
| 1038 | 1038 | 10 | `canvas` | `tcv` | aria-hidden=true |  |  |
| 1050 | 1050 | 6 | `h2` | `sp-kaleido` |  | `dh` | Kaleidoscope |
| 1050 | 1050 | 7 | `button` |  | aria-expanded=false | `dfront` | Kaleidoscope |
| 1053 | 1053 | 5 | `div` | `db-sp-kaleido` |  | `dbody` |  |
| 1060 | 1060 | 6 | `h2` | `sp-text` |  | `dh` | Text |
| 1060 | 1060 | 7 | `button` |  | aria-expanded=false | `dfront` | Text |
| 1063 | 1063 | 5 | `div` | `db-sp-text` |  | `dbody` |  |
| 1070 | 1070 | 6 | `h2` | `sp-focus` |  | `dh` | Focus |
| 1070 | 1070 | 7 | `button` |  | aria-expanded=false | `dfront` | Focus |
| 1073 | 1073 | 5 | `div` | `db-sp-focus` |  | `dbody` |  |
| 1080 | 1080 | 6 | `h2` | `sp-display` |  | `dh` | Display |
| 1080 | 1080 | 7 | `button` |  | aria-expanded=false | `dfront` | Display |
| 1083 | 1083 | 5 | `div` | `db-sp-display` |  | `dbody` |  |
| 1090 | 1090 | 6 | `h2` | `sp-export` |  | `dh` | Export |
| 1090 | 1090 | 7 | `button` |  | aria-expanded=false | `dfront` | Export |
| 1093 | 1093 | 5 | `div` | `db-sp-export` |  | `dbody` |  |
| 1100 | 1100 | 6 | `h2` | `sp-settings` |  | `dh` | Settings |
| 1100 | 1100 | 7 | `button` |  | aria-expanded=false | `dfront` | Settings |
| 1103 | 1103 | 5 | `div` | `db-sp-settings` |  | `dbody` |  |
| 1109 | 1109 | 2 | `section` |  | aria-label="Rules and tuning" | `dock` |  |
| 1111 | 1111 | 4 | `h2` |  |  |  | Study settings |
| 1113 | 1113 | 5 | `button` | `remoteBtn` | aria-pressed=true | `pill` | Other players active |
| 1115 | 1115 | 4 | `h2` |  |  |  | Tune the cathode screen |
| 1117 | 1117 | 6 | `output` | `oLines` |  |  | 3 |
| 1117 | 1117 | 6 | `input[type=range]` | `tLines` |  |  |  |
| 1118 | 1118 | 6 | `output` | `oDwellYou` |  |  | 1.8 s |
| 1118 | 1118 | 6 | `input[type=range]` | `tDwellYou` |  |  |  |
| 1119 | 1119 | 6 | `output` | `oDwell` |  |  | 4.5 s |
| 1119 | 1119 | 6 | `input[type=range]` | `tDwell` |  |  |  |
| 1120 | 1120 | 6 | `output` | `oMerge` |  |  | 900 ms |
| 1120 | 1120 | 6 | `input[type=range]` | `tMerge` |  |  |  |
| 1122 | 1122 | 4 | `h2` |  |  |  | Tune the herringbone |
| 1124 | 1124 | 6 | `output` | `oStain` |  |  | 72% |
| 1124 | 1124 | 6 | `input[type=range]` | `tStain` |  |  |  |
| 1125 | 1125 | 6 | `output` | `oSlat` |  |  | 120 px |
| 1125 | 1125 | 6 | `input[type=range]` | `tSlat` |  |  |  |
| 1128 | 1128 | 4 | `h2` |  |  |  | Tune the parquet |
| 1129 | 1129 | 4 | `div` | `pqPattern` | role=radiogroup aria-label="Sidebar floor pattern" | `pills` |  |
| 1134 | 1134 | 6 | `output` | `oPqStain` |  |  | 85% |
| 1134 | 1134 | 6 | `input[type=range]` | `tPqStain` |  |  |  |
| 1135 | 1135 | 6 | `output` | `oPqPlank` |  |  | 100 px |
| 1135 | 1135 | 6 | `input[type=range]` | `tPqPlank` |  |  |  |
| 1138 | 1138 | 4 | `h2` |  |  |  | Motion by event |
| 1152 | 1152 | 4 | `h2` |  |  |  | Pane width rule |
| 1160 | 1160 | 4 | `h2` |  |  |  | Sidebar pattern rules |
| 1173 | 1173 | 4 | `h2` |  |  |  | Cathode screen rules |
| 1182 | 1182 | 4 | `h2` |  |  |  | Inbound changes beyond the console |
| 1196 | 1196 | 1 | `div` | `announce` | aria-live=polite | `sr` |  |

### 4. `<script>` blocks: section comments and top-level declarations

Top level = brace, paren and bracket depth 0 outside strings, template literals and comments. **Bold** rows are decorated comments (`// ---- x ----`, `// ==== x ====`); plain comment rows are runs of top-level comment lines (first line shown). Declaration rows give the kind (`function`, `const`, `const fn` for an arrow or function expression, `let`, `var`, `class`) and the name or pattern.

#### Script block 1: lines 1199–1199

0 top-level functions, 0 top-level const/let/var/class declarations, 0 comment rows.

Nothing at top level.

#### Script block 2: lines 1200–1200

0 top-level functions, 0 top-level const/let/var/class declarations, 0 comment rows.

Nothing at top level.

#### Script block 3: lines 1201–3332

105 top-level functions, 156 top-level const/let/var/class declarations, 45 comment rows. Top level here is brace/paren/bracket depth 1/1/0: the code is wrapped (an IIFE or similar), and declarations sit inside the wrapper.

| Line | Lite | Kind | Name / comment |
|---|---|---|---|
| 1204 | 1202 | const | `rmq` |
| 1205 | 1203 | let | `RM` |
| 1207 | 1205 | let | `T` |
| 1209 | 1207 | const | `PROF` |
| 1210 | 1208 | class | `Spring` |
| 1221 | 1219 | class | `Cathode` |
| 1236 | 1234 | comment | atoms rest until something in their section changes, then ease into a short spin and sett… |
| 1237 | 1235 | function | `newAtom()` |
| 1238 | 1236 | function | `kickAtom(at)` |
| 1239 | 1237 | function | `stepAtom(at, dt)` |
| 1245 | 1243 | const | `OUTER` |
| 1246 | 1244 | const fn | `$` |
| 1247 | 1245 | const | `con` |
| 1249 | 1247 | section | **parameters** |
| 1250 | 1248 | const | `PARAMS` |
| 1258 | 1256 | const | `MAT_SLIDER` |
| 1259 | 1257 | const | `matVals` |
| 1261 | 1259 | const | `DISCRETE` |
| 1274 | 1272 | const | `META` |
| 1275 | 1273 | const | `S` |
| 1276 | 1274 | const fn | `norm` |
| 1277 | 1275 | const fn | `denorm` |
| 1278 | 1276 | const | `sp` |
| 1280 | 1278 | let | `ignite` |
| 1282 | 1280 | section | **players** |
| 1283 | 1281 | const | `YOU` |
| 1284 | 1282 | const | `PL` |
| 1289 | 1287 | section | **element registry, in shader order** |
| 1290 | 1288 | const | `E` |
| 1291 | 1289 | function | `reg(el, type, opt = {})` |
| 1295 | 1293 | comment | no group frames: each control carries its own filigree |
| 1296 | 1294 | const | `fMat` |
| 1297 | 1295 | const | `FRAME_OF` |
| 1298 | 1296 | const | `matE` |
| 1299 | 1297 | const | `tubeE` |
| 1300 | 1298 | const | `dialE` |
| 1302 | 1300 | const | `modeBtns` |
| 1303 | 1301 | const | `layerBtns` |
| 1304 | 1302 | const | `teleE` |
| 1305 | 1303 | const | `limitE` |
| 1306 | 1304 | const | `igniteE` |
| 1307 | 1305 | const | `sqE` |
| 1308 | 1306 | const | `presetE` |
| 1309 | 1307 | const | `clearE` |
| 1312 | 1310 | section | **pane width rule: 24 px module, banks share their widest width** |
| 1313 | 1311 | const | `MODULE` |
| 1314 | 1312 | function | `sizePanes()` |
| 1333 | 1331 | section | **state sync** |
| 1334 | 1332 | function | `setLatch(o, on, remote)` |
| 1335 | 1333 | function | `syncToggles(remote)` |
| 1344 | 1342 | function | `syncControl(k)` |
| 1353 | 1351 | const | `held` |
| 1354 | 1352 | function | `targetsFor(k)` |
| 1369 | 1367 | function | `matSwap(remote)` |
| 1374 | 1372 | function | `applyChange(k, v, who, tag)` |
| 1395 | 1393 | function | `release(k)` |
| 1397 | 1395 | section | **cathode screen notifications** |
| 1398 | 1396 | const | `NR` |
| 1399 | 1397 | const | `DIM` |
| 1400 | 1398 | const | `LINE_H` |
| 1401 | 1399 | const | `notesEl` |
| 1402 | 1400 | let | `lines` |
| 1403 | 1401 | function | `lineText(L)` |
| 1411 | 1409 | function | `renderLine(L)` |
| 1420 | 1418 | function | `notify(who, key, from, to, tag)` |
| 1437 | 1435 | function | `restack(prof)` |
| 1445 | 1443 | function | `stepLines(dt, now)` |
| 1465 | 1463 | function | `setLines(n)` |
| 1467 | 1465 | const | `ann` |
| 1468 | 1466 | function | `announce(msg)` |
| 1474 | 1472 | const | `chipLayer` |
| 1475 | 1473 | function | `showChip(o, who)` |
| 1488 | 1486 | const fn | `setTxt` |
| 1489 | 1487 | function | `updateReadout()` |
| 1495 | 1493 | section | **input wiring** |
| 1496 | 1494 | function | `bindPress(o)` |
| 1506 | 1504 | function | `radioGroup(list, key, parse)` |
| 1521 | 1519 | let | `igTimer` |
| 1522 | 1520 | comment | ignite is held: it burns while any player holds it, or while it is locked on |
| 1523 | 1521 | const | `igHolders` |
| 1524 | 1522 | function | `igHold(who, on)` |
| 1540 | 1538 | const fn | `releaseAll` |
| 1559 | 1557 | section | **top bar fields and commands** |
| 1563 | 1561 | function | `strike(o)` |
| 1567 | 1565 | section | **engine order telegraphs: laminar / blend and time** |
| 1568 | 1566 | const | `TELE` |
| 1573 | 1571 | const fn | `ang` |
| 1574 | 1572 | const fn | `polar` |
| 1575 | 1573 | function | `wedge(r0, r1, a0, a1)` |
| 1579 | 1577 | let | `roseD` |
| 1668 | 1666 | function | `orderOf(k, v)` |
| 1669 | 1667 | function | `teleText(k, v)` |
| 1673 | 1671 | comment | the order flag: a brass plate that drops out of the slot and the next one drops in |
| 1674 | 1672 | function | `flagTo(o, i)` |
| 1689 | 1687 | function | `stepTeles(dt)` |
| 1712 | 1710 | section | **simulated remote players** |
| 1713 | 1711 | let | `remoteOn` |
| 1714 | 1712 | const fn | `pick` |
| 1715 | 1713 | function | `burst(who, k)` |
| 1723 | 1721 | let | `remoteSideHook` |
| 1724 | 1722 | function | `remoteAct()` |
| 1736 | 1734 | const | `remoteBtn` |
| 1739 | 1737 | section | **tuning** |
| 1740 | 1738 | const fn | `bindTune` |
| 1747 | 1745 | const | `pqPending` |
| 1748 | 1746 | let | `pqRaf` |
| 1749 | 1747 | function | `pqSet(name, val)` |
| 1754 | 1752 | function | `pqStain(v)` |
| 1756 | 1754 | let | `pqPat` |
| 1757 | 1755 | const fn | `pqSize` |
| 1759 | 1757 | const | `pqBtns` |
| 1760 | 1758 | function | `setPattern(p)` |
| 1773 | 1771 | section | **light** |
| 1774 | 1772 | let | `lightMode` |
| 1780 | 1778 | const | `lx` |
| 1781 | 1779 | let | `lightInit` |
| 1783 | 1781 | section | **Sidebar panels: personal settings, rendered in plain CSS …** |
| 1788 | 1786 | const | `SPEEDS` |
| 1789 | 1787 | const fn | `pct` |
| 1790 | 1788 | const | `LAD` |
| 1825 | 1823 | const | `BRUSH0` |
| 1829 | 1827 | const fn | `lnorm` |
| 1830 | 1828 | const | `lsp` |
| 1832 | 1830 | const | `SB` |
| 1833 | 1831 | function | `rec(el)` |
| 1834 | 1832 | const | `binders` |
| 1835 | 1833 | const fn | `bind` |
| 1836 | 1834 | const fn | `run` |
| 1837 | 1835 | const | `PROXY` |
| 1838 | 1836 | const | `heldSide` |
| 1839 | 1837 | let | `curRemote` |
| 1840 | 1838 | function | `setLocal(k, v, who, tag)` |
| 1858 | 1856 | function | `kickSection(k)` |
| 1866 | 1864 | function | `pressable(el)` |
| 1874 | 1872 | const | `sidebars` |
| 1876 | 1874 | comment | multi-brush: eight brushes on one cathode screen, four to a row; pick one, edit it below |
| 1877 | 1875 | const | `btiles` |
| 1885 | 1883 | const | `tiles` |
| 1886 | 1884 | const | `mstamps` |
| 1887 | 1885 | function | `refreshTiles()` |
| 1898 | 1896 | function | `syncEditor()` |
| 1906 | 1904 | const | `STAMP_URLS` |
| 1908 | 1906 | comment | indicators |
| 1911 | 1909 | comment | radio groups (delegated so presets added later just work) |
| 1912 | 1910 | function | `bindRadio(g)` |
| 1929 | 1927 | comment | checkboxes |
| 1936 | 1934 | comment | ladders |
| 1950 | 1948 | const | `ladders` |
| 1951 | 1949 | const | `outs` |
| 1953 | 1951 | comment | keycaps |
| 1954 | 1952 | const | `SPOKEN` |
| 1955 | 1953 | const fn | `keyGlyph` |
| 1956 | 1954 | const fn | `keyName` |
| 1957 | 1955 | const | `keycaps` |
| 1958 | 1956 | let | `listening` |
| 1959 | 1957 | function | `stopListen()` |
| 1974 | 1972 | const fn | `norm1` |
| 1999 | 1997 | comment | select-only comboboxes (APG pattern) sharing one inline listbox per panel |
| 2000 | 1998 | let | `openSel` |
| 2002 | 2000 | function | `panelLbx(el)` |
| 2003 | 2001 | function | `fillOpts(el)` |
| 2018 | 2016 | function | `setActive(i)` |
| 2025 | 2023 | function | `openSelect(el)` |
| 2036 | 2034 | function | `closeSel(commit, instant)` |
| 2044 | 2042 | const | `selects` |
| 2077 | 2075 | comment | swatches |
| 2078 | 2076 | const | `MAIN_RGB` |
| 2079 | 2077 | const fn | `hexRgb` |
| 2080 | 2078 | function | `hsv(h)` |
| 2081 | 2079 | const | `bswInput` |
| 2084 | 2082 | function | `swatchRGB(i)` |
| 2092 | 2090 | comment | brush organizer: stamps drawn once into small canvases, shown as phosphor through a CSS m… |
| 2093 | 2091 | const | `STAMPS` |
| 2116 | 2114 | function | `txt(c, t, font, dy = 0)` |
| 2117 | 2115 | function | `ring(c, r, w)` |
| 2118 | 2116 | function | `rays(c, n, r0, r1, w)` |
| 2119 | 2117 | function | `rose(c, R, w)` |
| 2120 | 2118 | function | `spiral(c, k, w)` |
| 2121 | 2119 | function | `dots(c, r, n, s)` |
| 2122 | 2120 | function | `bars(c, n, w, h)` |
| 2123 | 2121 | function | `snow(c)` |
| 2124 | 2122 | const | `stampsEl` |
| 2140 | 2138 | function | `drawStamps()` |
| 2158 | 2156 | comment | actions: a short cathode strike; New adds a preset |
| 2159 | 2157 | let | `presetN` |
| 2173 | 2171 | comment | every pane, keycap and option gets the press surge |
| 2176 | 2174 | section | **Shared sidebar settings (layers, gates). These sync between players, so …** |
| 2180 | 2178 | const fn | `onoff` |
| 2181 | 2179 | const fn | `shown` |
| 2216 | 2214 | comment | the left brush sidebar is personal; every section on the right syncs |
| 2217 | 2215 | const | `SHARED_SIDE` |
| 2218 | 2216 | const fn | `clamp` |
| 2220 | 2218 | comment | tints: a control another player touched glows in their colour and fades back |
| 2221 | 2219 | const | `tints` |
| 2222 | 2220 | let fn | `tint` |
| 2223 | 2221 | function | `stepTints(dt)` |
| 2234 | 2232 | function | `sideTargets(k)` |
| 2239 | 2237 | const | `schips` |
| 2240 | 2238 | const | `sideChips` |
| 2241 | 2239 | function | `showSideChip(el, who)` |
| 2251 | 2249 | function | `sideBurst(who, k, from, to)` |
| 2263 | 2261 | comment | aria-pressed toggles (layer modes) |
| 2269 | 2267 | comment | colour fields |
| 2270 | 2268 | const | `colorKeys` |
| 2277 | 2275 | section | **gates** |
| 2278 | 2276 | const | `gscr` |
| 2279 | 2277 | const | `NB` |
| 2280 | 2278 | let | `gates` |
| 2281 | 2279 | const fn | `fHz` |
| 2282 | 2280 | const fn | `gateRange` |
| 2283 | 2281 | const fn | `gateText` |
| 2284 | 2282 | function | `updGateCount()` |
| 2285 | 2283 | function | `placeGate(g)` |
| 2291 | 2289 | function | `selectGate(g)` |
| 2292 | 2290 | function | `gateChanged(g, verb, who, after)` |
| 2297 | 2295 | function | `makeGate(f0, f1, th, who)` |
| 2308 | 2306 | function | `removeGate(g, who)` |
| 2317 | 2315 | function | `bindGate(g)` |
| 2331 | 2329 | function | `relG(e)` |
| 2356 | 2354 | function | `endGateDrag()` |
| 2377 | 2375 | const fn | `gauss` |
| 2378 | 2376 | function | `stepGates(dt)` |
| 2401 | 2399 | function | `drawSpec()` |
| 2424 | 2422 | section | **light shift** |
| 2425 | 2423 | const | `crt` |
| 2426 | 2424 | let | `field` |
| 2428 | 2426 | function | `hsvRgb(h, s, v)` |
| 2429 | 2427 | const fn | `colAt` |
| 2430 | 2428 | const fn | `hex` |
| 2431 | 2429 | const | `HUES` |
| 2432 | 2430 | const fn | `colorName` |
| 2433 | 2431 | function | `relen()` |
| 2434 | 2432 | function | `pointAt(u)` |
| 2441 | 2439 | function | `crtInfo()` |
| 2444 | 2442 | function | `buildField(w, h)` |
| 2460 | 2458 | function | `stepCRT(dt)` |
| 2501 | 2499 | const fn | `crtPos` |
| 2508 | 2506 | const fn | `endCrt` |
| 2521 | 2519 | section | **layers** |
| 2522 | 2520 | function | `thumb(id, draw)` |
| 2532 | 2530 | const | `layerEls` |
| 2533 | 2531 | function | `layerCount()` |
| 2564 | 2562 | comment | other players touch layers and gates too |
| 2586 | 2584 | section | **timing: falling cues** |
| 2587 | 2585 | const | `tcv` |
| 2588 | 2586 | const | `LANES` |
| 2589 | 2587 | const | `laneLamps` |
| 2591 | 2589 | const fn | `hsh` |
| 2592 | 2590 | function | `cuesFor(lane, b)` |
| 2599 | 2597 | let | `lastBeat` |
| 2600 | 2598 | const | `timClose` |
| 2606 | 2604 | function | `stepTiming(dt)` |
| 2652 | 2650 | function | `roundRect(c, x, y, w, h, r)` |
| 2654 | 2652 | section | **gravity: phosphor scope** |
| 2656 | 2654 | const | `DIRS` |
| 2657 | 2655 | function | `gravText(v)` |
| 2667 | 2665 | const | `scope` |
| 2668 | 2666 | let | `strail` |
| 2669 | 2667 | function | `setGrav(x, y, who)` |
| 2670 | 2668 | const fn | `scopePos` |
| 2673 | 2671 | const fn | `endScope` |
| 2682 | 2680 | function | `stepScope(dt)` |
| 2722 | 2720 | section | **the cabinet: drawers pull out on the drawer spring** |
| 2723 | 2721 | const | `drawers` |
| 2724 | 2722 | function | `setDrawer(o, open, instant)` |
| 2736 | 2734 | comment | idle: after 20 s without input, section names glow in the original nav gradient |
| 2737 | 2735 | const | `EGG` |
| 2739 | 2737 | let | `idleT` |
| 2740 | 2738 | const | `cabR` |
| 2741 | 2739 | const fn | `wake` |
| 2744 | 2742 | const fn | `drawerOf` |
| 2745 | 2743 | function | `stepDrawers(dt)` |
| 2757 | 2755 | comment | a change inside a closed drawer flashes that drawer's lamp in the player's colour |
| 2758 | 2756 | const | `tintBase` |
| 2761 | 2759 | section | **Swirl Together: the room** |
| 2763 | 2761 | const | `room` |
| 2764 | 2762 | const | `CODE_CH` |
| 2765 | 2763 | const fn | `newCode` |
| 2766 | 2764 | function | `nixies(box, code, label)` |
| 2771 | 2769 | function | `setRemote(on)` |
| 2772 | 2770 | function | `updatePlayers()` |
| 2777 | 2775 | function | `roomStatus()` |
| 2778 | 2776 | function | `roomMsg(t)` |
| 2779 | 2777 | function | `goLive(code, people)` |
| 2785 | 2783 | let | `joinTimers` |
| 2786 | 2784 | function | `leaveRoom()` |
| 2792 | 2790 | function | `arrive(who, at)` |
| 2807 | 2805 | function | `tryJoin()` |
| 2818 | 2816 | function | `copyText(text, okMsg, fallbackEl)` |
| 2827 | 2825 | let | `pairT` |
| 2837 | 2835 | function | `stepFeed()` |
| 2844 | 2842 | comment | filigree ornaments as small SVGs, built once |
| 2864 | 2862 | const | `filSections` |
| 2874 | 2872 | function | `sidebarFrame(dt)` |
| 2903 | 2901 | section | **WebGL** |
| 2904 | 2902 | const | `VS` |
| 2907 | 2905 | const | `FS` |
| 3223 | 3221 | let | `gl` |
| 3224 | 3222 | const | `PQ` |
| 3256 | 3254 | function | `resize()` |
| 3263 | 3261 | const | `NMAX` |
| 3264 | 3262 | const | `fR` |
| 3265 | 3263 | let | `igFlick` |
| 3266 | 3264 | function | `draw()` |
| 3292 | 3290 | let | `last` |
| 3293 | 3291 | function | `frame(now)` |

### 5. Full-file line → lite-copy line

The lite copy is the full file with every line of 20,000+ characters removed (`awk 'length($0) < 20000'`, or this script's `--lite`). **lite = full − (number of removed lines above full).** A removed line has no lite line. Going back: full = lite + (number of removed lines at or below that point).

| Full-file lines | Lite lines | Shift |
|---|---|---|
| 1–1198 | 1–1198 | same |
| 1199 | — | removed |
| 1200 | — | removed |
| 1201–3332 | 1199–3330 | −2 |

Lite copy: 3330 lines.

