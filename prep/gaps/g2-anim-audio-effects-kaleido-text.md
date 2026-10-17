# Gap spec g2: Animations, Audio, Effects, Kaleidoscope, Text

Second-wave work list for the Walnut & Copper reskin, written 2026-10-17 on `walnut-copper` at `a0477e1`, before W1-W7 merge. It lists what is still off against the study in these five right-sidebar drawers once the W briefs land. Anything a W brief already covers is left out, or flagged **partial** where the brief only reaches part of it. Each drawer section ends with a short "covered, verify only" list.

## How this was made

- **Study.** I read `design/study-lite.html` only. Line numbers are lite numbers. "Rule N" means the study's design rules list, lines 1154-1191.
- **App.** I opened each drawer alone in the main checkout through `scripts/test/radial-menu/driver.js`, with a scratch profile, reduced motion and `--disable-gpu-compositing`, at 1920x1080 and 1440x900. Sub-panels were revealed by clicking the real inputs (feature toggles, Add Text, Record/Stop/Keep) or by dispatching `change` on real selects (Audio mode, Dither pattern). No app setter was called.
- **Scripts.** `prep/work/gaps/explore.js`, `probe2.js` and `probe3.js`. DOM dumps with computed styles are in `prep/work/gaps/dom/*.json`.
- **Shots** (scale 2, chunked): `prep/work/gaps/shots/`.
  - Animations: `animations-{1920,1440}-{closed,lib}-*`, plus `animations-1920-{countdown,recording,keep,filled}-*`.
  - Audio: `audio-{1920,1440}-{closed,tunnel,min,full}-*`, `audio-1920-timing-body.png`, `audio-1920-atv-foot.png`.
  - Effects: `effects-{1920,1440}-{closed,open}-*`, `effects-1920-dither-draw.png`.
  - Kaleidoscope: `kaleido-{1920,1440}-{closed,open}-*`.
  - Text: `text-{1920,1440}-{closed,open}-*`.
  - Study references: `study-sp-{gates,brush,layers,grav,light,input,multi}-*`.
- **What the study shows.** The study only has real markup for Audio (lite 1002-1046). Effects (982-990), Animations (992-1000), Kaleidoscope (1048-1056) and Text (1058-1066) are placeholders that say the drawer "keeps its current controls and behaviour; each one takes the matching component from the other drawers". For those four, the target is the matching study component named in each row.

### Where the work goes

- **New sheet `css/41-theme-drawer-panels.css`.** The contents of these five drawers, in `@layer theme` and scoped to `html[data-theme="walnut-copper"]`. The button audit allows a `4x-theme-*.css` sheet to colour buttons (`js/38` line 27, regex `(3[13-9]|4\d)-theme-`), so the pane paint can live here too.
- **Existing sheets** where the component already has an owner:
  - 36: tube row structure.
  - 37: compact field, text field, swatch and keycap variants.
  - 38: reuse of the `.scr` screen recipe.
  - 40: the bottom studio drawer.
  - 31: the danger-pane recipe.
- **Inline styles.** Many targets are painted by inline `style` (`style.cssText` in js/20 and js/30, `style=""` in index.html). Rows marked **!imp** need `!important` on the painted properties.
- **Display is not ours.** Scripts toggle `display` inline on most sub-panels (`#audioMini`, `#audioSceneBox`, `.atv-controls`, `#recKeepRow`, `.feature-body`, `#lightSourceControls`, `.anim-lib-list`, `#ditherDrawGroup`, the Text editor). The theme must never set `display` on those elements.

## Study reference card (values used below)

| Id | Component (lite lines) | Literal values |
|---|---|---|
| R1 | `.lbl` (40-41) | Michroma 400 10.5px/1.2, letter-spacing .18em, uppercase, colour `#e7d2b2`, text-shadow `0 1px 1px rgba(0,0,0,.85), 0 0 10px rgba(0,0,0,.5)` |
| R2 | `.val` (88, colour 40) | Share Tech Mono 400 13px/1, .06em, tabular-nums, colour `#e7d2b2`, same shadow as R1 |
| R3 | `.head` (162), `.head+.lad` (170) | flex, space-between, baseline, gap 8px, padding 0 4px; the tube under it pulls up `margin-top:-9px` |
| R4 | `.hint` (331) | Libre Franklin 12px/1.45, `#cdb79f`, text-shadow `0 1px 1px rgba(0,0,0,.9)`, margin 0, left-aligned |
| R5 | `.sub` (320) | 12px/1.3, `#c9b39b`, text-shadow `0 1px 1px rgba(0,0,0,.9)` |
| R6 | `.scr-cap` (281) | Share Tech Mono 400 12px/1, .08em, `#72f2d4`, text-shadow `0 0 6px rgba(114,242,212,.6)` |
| R7 | `.subhd` (394-395) | flex, centred, gap 8px, Michroma 9.5px/1, .22em, uppercase, `#e7d2b2`, margin-top 4px, text-shadow `0 1px 1px rgba(0,0,0,.9)`. `::before` and `::after`: flex 1, border-top `1.5px dotted rgba(214,140,92,.45)` |
| R8 | `.fil` (165-169) | grid, gap 8px, padding `22px 2px 8px`. Bead row `::before`: left/right 2px, top 6px, border-top `2px dotted rgba(214,140,92,.55)`, masked gap `calc(50% ± 13px)`. Atom: 14x14, top 0, opacity .8, `rotate(var(--rot))` |
| R9 | `.cp` (172-181) | 48px tall, min-width 48, padding 0 18px, radius 7px, Michroma 10.5px/1 .16em, uppercase, nowrap.<br>Colour: `--unlit #a08a76` → `--lit #ffd9b0` by `--i`.<br>Background: `radial-gradient(ellipse 80% 95% at 50% 50%, rgb(gc/ i*.34), transparent 75%)`, mesh-dim 7x12.12px, `linear-gradient(170deg,#1a1210,#090605)`.<br>Box-shadow: `0 0 0 1px rgba(0,0,0,.6), inset 0 0 0 1.5px #c47a4b, inset 0 1px 0 1.5px rgba(255,210,170,.18), inset 0 0 0 2.5px rgba(0,0,0,.55)` plus the `--i` glow |
| R10 | `.cp.sm` (182-183) | height 32px, min-width 32, padding 0 10px, radius 5px, 9px, .12em (the compact tier of rule 1162) |
| R11 | `.cp.sm.sq` (185-186) | padding 0, width 32px (a 32x32 glyph pane) |
| R12 | `.cp.wide` (184) | width 100% |
| R13 | `.cp.sm.ic` (188-197; sm 189, 192, 197) | padding-left 25px.<br>Indicator: 9x9 at left 9px, radius 2px, ring 1.3px `color-mix(#ff9a50 i%, #6b5546)`.<br>Check: 2.6x5 (sm), stroke `rgb(255 196 140 / i)` |
| R14 | `.cp.danger` (337) | `--gc:255 58 40; --unlit:#c99a8f; --lit:#ffc9bd`. The copper bezel stays copper |
| R15 | `.joined` (199-205, 144-145) | flex, gap 0, children flex 1, radius 0; first child `5px 0 0 5px`, last child `0 5px 5px 0` (sm); children min-width 0, `padding-inline:6px`; `.sm` children 8.5px, .06em |
| R16 | `.row2` / `.row3` (332-333) | grid, gap 6px, columns `repeat(2, minmax(0,1fr))` or `repeat(3, minmax(0,1fr))`, children width 100% |
| R17 | `.cp.sel.sm` (207-211) | padding `0 30px 0 9px`. Chevron cell 24px wide, top/bottom 5px, border-left `1px solid rgba(214,140,92,.7)`. Chevron 6x6, `#f2b38a`, 1.5px, `rotate(calc(45deg + var(--open)*180deg))` |
| R18 | `.clr` / `.clr.sm` (225-230, 407) | 32px / 28px circle, transparent.<br>Box-shadow: `inset 0 0 0 1.5px #c47a4b, inset 0 1px 0 1.5px rgba(255,210,170,.2), 0 0 0 1px rgba(0,0,0,.5)`.<br>X: two 12x1.6px `#f2b38a` bars at ±45°.<br>Hover: `radial-gradient(circle, rgba(255,130,50,.22), transparent 70%)`, `inset 0 0 0 1.5px #f2b38a`, `0 0 10px rgba(255,120,40,.35)`. Active: .45. Transition `box-shadow .25s, background .25s` |
| R19 | `.scr` (267-270) | radius 10px, padding 8px.<br>Background: `radial-gradient(ellipse at center, rgba(40,160,130,.11), transparent 72%)`, mesh-vfd 5x8.66px, `#040b0a`.<br>Box-shadow: `0 0 0 1px rgba(0,0,0,.6), inset 0 0 0 1.5px #c47a4b, inset 0 1px 0 1.5px rgba(255,210,170,.15), inset 0 0 0 2.5px rgba(0,0,0,.6)`.<br>`::after` (inset 3px, radius 8px): scanlines `repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px)` and `linear-gradient(160deg, rgba(220,255,245,.06), transparent 40%)` |
| R20 | `.gscr`, `.gaxis`, `.gate` (342-358) | Screen: padding 0, aspect 16/10.<br>Canvas: inset 6px, radius 6px, `drop-shadow(0 0 2.5px rgba(114,242,212,.55))`.<br>Axis: Share Tech Mono 9px `rgba(114,242,212,.6)`, top 8px, left/right 10px.<br>Gate: border `1px rgba(214,140,92,.7)` with no bottom; lid 2px `color-mix(#ffd8b0 i%, #f2b38a)`; lit fill `rgb(255 140 40 / i*.24 → i*.05)` |
| R21 | `.crt` (361-364) | aspect 1/.84, radius 12px, background `#050403`, box-shadow as R19's bezel.<br>Canvas: inset 7px, radius `18px / 15px`.<br>`::after` (same inset): `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,.6) 100%)` and `linear-gradient(160deg, rgba(255,255,255,.09), transparent 35%)` |
| R22 | `.scope` (411-415) | aspect 1, radius 50%, background `#020706`.<br>Box-shadow: `0 0 0 1px rgba(0,0,0,.6), inset 0 0 0 1.5px #c47a4b, inset 0 1px 0 1.5px rgba(255,210,170,.15), inset 0 0 0 5px #0d0907, inset 0 0 0 6px rgba(196,122,75,.5)`.<br>Inner inset 9px; `::after`: `radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,.55))` and `linear-gradient(150deg, rgba(255,255,255,.08), transparent 40%)`. Graticule and dot are teal phosphor (`study-sp-grav-0.png`) |
| R23 | `.lamp` (368-372), `.lamp.ln` (406) | 24px round cathode: `radial-gradient(circle at 38% 32%, rgba(255,244,228,.12+i*.65), transparent 42%)` over `radial-gradient(circle, rgb(gc/.1+i*.85) 0 50%, …)`, mesh-dim, `#120c0a`; box-shadow `inset 0 0 0 1.5px #c47a4b, 0 0 0 1px rgba(0,0,0,.6), 0 0 i*12px rgb(gc/ i*.6)`. `.ln` is 12px |
| R24 | `.tf` (374-380) | height 32px, radius 5px, padding 0 9px, Share Tech Mono 14px/1, .03em.<br>Colour: `--unlit` at rest, `#c8ad94` on hover, `--lit` + `0 0 6px rgba(255,120,40,.85)` on focus. Caret `#ffb070`.<br>Background: mesh-dim 7x12.12px, `linear-gradient(170deg,#1a1210,#090605)`. Box-shadow: `0 0 0 1px rgba(0,0,0,.6), inset 0 0 0 1.5px #c47a4b, inset 0 0 0 2.5px rgba(0,0,0,.55)`.<br>`::selection rgba(255,120,40,.4)`; focus-visible outline 2px `#ffb547`, offset 3px |
| R25 | `.thumb` (387-390) | 38x38, radius 6px, padding 3px, background `#0b0706`, box-shadow `0 0 0 1px rgba(0,0,0,.6), inset 0 0 0 1.5px #c47a4b`. Image radius 3px. `::after` (inset 3px): `linear-gradient(150deg, rgba(255,255,255,.18), transparent 45%)` |
| R26 | `.sw` (313-316) | height 26px, radius 5px.<br>Colour: `radial-gradient(ellipse at center, rgb(c/.95) 0 30%, rgb(c/.45) 72%, rgb(c/.18))` over mesh-dim 5x8.66 and `#0c0807`.<br>Box-shadow: `0 0 0 1px rgba(0,0,0,.6), inset 0 0 0 1.5px #c47a4b, 0 0 12px rgb(c/.35)` |
| R27 | `.card` (307-312), `.cards` (299) | radius 9px, padding 10px 7px.<br>Box-shadow: `inset 0 0 0 1px rgba(214,140,92,.7), inset 0 0 0 2px rgba(0,0,0,.3)`. Four 1px copper rivets at 5px from the corners. Dimmed background `rgba(10,6,4, (1-pw)*.35)`; children `opacity:.42+.58*pw`. Grid gap 8px |
| R28 | `.kc` / `.kc.sm` (218-224) | Keycap 72x48 (sm 48x32), radius 9px (sm 6px), Share Tech Mono 22px (sm 15px). Inner second copper line `inset 0 0 0 5px #0c0806, inset 0 0 0 6px rgba(196,122,75,.55)` |
| R29 | `.tips` + `.glyph` (258-265) | `.tips`: grid, gap 6px. Glyph colour `color-mix(#ffb070 i%, #6b5546)`, `drop-shadow(0 0 i*5px rgb(gc/ i))` |
| R30 | `.lyr-head` (382), `.line` (161), `.field` (212) | `.lyr-head`: flex, centred, gap 7px. `.line`: flex, centred, space-between, gap 8px. `.field`: grid, gap 5px |
| R31 | focus (321) | outline 2px solid `#ffb547`, offset 3px |

## Shared gaps (hit several of these drawers)

These are listed once and not counted in the per-drawer tables. S3, S4 and S5 also hit drawers outside this spec.

| # | Now | Target | Element and hook | Owner | W brief | P | Risk |
|---|---|---|---|---|---|---|---|
| S1 | Labels on fields and rows that are not slider heads are Michroma 9.5px/.12em (1.14px), with no shadow (css/34 71-79). Seen on: Audio mode, Pattern, Color, Kaleidoscope mode, Lanes, Direction, No-gate mode, Mode, Blend mode | R1 `.lbl`: 10.5px, .18em, R1 shadow. For a field: `.field` gap 5px between label and field (R30) | `:is(#sidebar-right) .control-group > label:not(:has(.value-display))` and per-drawer hooks below | 37 (field labels) | partial: W2 §4 sets slider head labels; W3 §1 does fields but names no label | P2 | Wider labels: check that "KALEIDOSCOPE MODE" (17 ch) fits 286 / 250 px at 10.5px .18em (about 190 px, fits) |
| S2 | `.value-display` at opacity .75, 12.5px, .04em, colour `--lit` (css/21 225-231 and css/34 80-86) | R2 `.val`: opacity 1, 13px, .06em | `:is(#sidebar-right) .control-group label .value-display` | 36 | partial: W2 §4 ("value in the mono face, lit"). Verify W2 drops the legacy `opacity:.75` | P2 | none |
| S3 | Glyph-only buttons are squeezed by css/34's pane rule (49-64: `padding-left/right:8px; min-height:36px`), so the glyph is clipped: `.anim-slot-clear` 20x40, `.anim-lib-rename` 20x40, `.anim-lib-delete` 20x40, `.atv-lane-del` 29x40, Text row `×` 25x40, Text Italic 29x40 | R11 `.cp.sm.sq` 32x32 for glyph actions; R18 `.clr.sm` 28x28 for remove ✕ / × (hide the text glyph with `font-size:0`, draw the X) | add these classes to the `:not(…)` list at css/34 line 51, then size them in 41 | 41 (+ a 1-line css/34 edit) | no | P1 | The accessible names are the glyph text ("✕", "✎", "×"). Keep the text node (font-size 0 still exposes it) and add aria-labels (JS hooks H3, H6) |
| S4 | Panes in these drawers are 36-40px tall (css/34 `min-height:36px` + padding 7px), with uneven 3-5px gaps | Rule 1162 compact tier: R10 `.cp.sm` 32px, padding 0 10px, radius 5px. Rule 1158: 8px between panes (6px inside `.row2`/`.row3`) | the css/34 pane rule (49-64) for `#sidebar-right` | 41 (or css/34 itself) | no | P2 | Global: it changes every sidebar drawer, not only these five. 32px stays above the 24px target-size minimum |
| S5 | Destructive and record panes have `--gc:255 80 50`, a red border `#b8432c`, a red-tinted floor `rgb(255 80 50/.12)` over `linear-gradient(170deg,#241008,#0b0503)` and colour `#e08a76`→`#ffd2c4` (css/31 107-123). Affects Record, Discard, Clear All, Delete, the Text row ×, Dither Clear, Clear path, the gates' Clear | R14 `.cp.danger`: keep the copper bezel and the dark glass, only `--gc 255 58 40`, `--unlit #c99a8f`, `--lit #ffc9bd` | `.btn--destructive`, `.btn--record` | 31 | partial: W5 (Leave), W7 (overlay destructive) | P2 | Recording-in-progress (css/01 387-410: solid `oklch(45% .17 25)` plate plus a pulsing `::after`) is Gabriel's "reads across the room" state. Ask before turning it into a dark-glass danger pane (Q2) |
| S6 | Emoji and colour glyphs inside labels: "✨ Auto" (js/40 1600), "⬆️ Full Audio" (`#audioOpenFullBtn`, js/20 7281), 👁/🙈 (js/20 6570), ⏸ ⏮ 🔁 (audio transport, js/20 7269-7271), "Leaving ⤴" (js/30 cycle names) | The study's panes are text only, with glyphs drawn in CSS. The 2026-09-24 vibe-coded-tells audit flagged emoji icons | text content in JS | JS content (H7) | no | P2 | Content change: ask Gabriel (Q1). js/44 recipe targets match "+ Add Text" only, so no recipe breaks |

## Animations

The drawer holds the record strip `#recMini` (index.html 1579-1609, run by js/03), the slot grid `.anim-grid` and the library `.anim-lib` (both built by js/20 3850-4080). Shots: `animations-1920-closed-0.png`, `-recording-0`, `-keep-0`, `-filled-0/1`, `animations-1440-closed-0.png`.

| # | Now (seen) | Target | Element and hook | Owner | W brief | P | Risk |
|---|---|---|---|---|---|---|---|
| A1 | The length chips "4 s / 8 s / 15 s / 30 s" are separate 45-55x40 panes with a 3px gap, and every label wraps onto two lines ("4" over "S"), at 1920 and 1440 | R15 `.joined` strip of R10 `.cp.sm` panes, `white-space:nowrap`, `padding-inline:6px`, 8.5px .06em, flex 1 each. At 1440: clock 72 + gap 8 + 4×42 = 250px, fits | `#recMini .rec-strip-length .rec-strip-chips` (role=group, aria-label "Length"); `#recLen4`, `#recLen8`, `#recLen15`, `#recLen30` (aria-pressed) | 41 | partial: W3 has joined two-way strips per the orchestrator's summary, but the W3 brief text names radio banks only, and this is a 4-way strip of aria-pressed buttons | P1 | none (js/71 already lights aria-pressed) |
| A2 | "Local only / Everything": two separate panes with a 3px gap; "LOCAL ONLY" wraps to two lines in a 106px pane | Rule 1165 "Two-way choices join": R15 strip of R10 panes, nowrap | `#recMini .rec-strip-source .rec-strip-chips`; `#recSrcMe`, `#recSrcAll` (aria-pressed) | 41 | partial: W3 (joined two-way strips per the orchestrator; these are aria-pressed buttons, not radios) | P1 | none |
| A3 | Six empty slots are dashed boxes, `1px dashed rgba(251,236,217,.18)`, radius 6px, 140x49, with a 5px grid gap and the hint in Libre Franklin 10px. These are the only dashed boxes in the theme | R27 `.card` per slot at `--pw:0` (copper hairline, four rivets, dim floor `rgba(10,6,4,.35)`), grid gap 8px (R27 `.cards`). Hint in R5 `.sub`, centred, two lines allowed. `.anim-slot-over` → `--pw:1` with `inset 0 0 0 1.5px #f2b38a` | `.anim-grid`, `.anim-slot.anim-slot-empty`, `.anim-slot-over` | 41 | no | P1 | `.anim-slot` is a drop target (dragover/drop). Keep the cell's box size so hit areas stay |
| A4 | The slot clear "✕" is 20x40 with 8px side padding, so the glyph is clipped to a sliver | R18 `.clr.sm` 28px ring; glyph text hidden (`font-size:0`), X drawn by `::before`/`::after` | `.anim-slot-clear` | 41 | no (S3) | P1 | Its name is "✕" (title "Clear slot" is only a description). Add an aria-label (H3) |
| A5 | Library row actions: rename "✎" and delete "✕" are 20x40 with clipped glyphs; delete is barely visible (`animations-1920-filled-1.png`) | rename → R11 `.cp.sm.sq` 32x32, glyph 14px; delete → R18 `.clr.sm` | `.anim-lib-row .anim-lib-rename`, `.anim-lib-delete` (`.anim-lib-act`) | 41 | no (S3) | P1 | Names "✎" / "✕" (H3). Delete confirms through `appConfirm`, which is unchanged |
| A6 | Transport row Record / Play / Stop: 112 / 81 / 81 x 40px, 5px gaps | Rule 1157: Record (the primary action) takes the rest of the row; Play and Stop are R10 panes snapped to the 16px module (80px). Height 32, gaps 8px (rule 1158). Record per S5 | `#recMini .rec-strip-transport`, `#recMiniRecordBtn`, `#recMiniPauseBtn`, `#recMiniStopBtn` | 41 | no (S4) | P2 | Keep the ● ▶ ■ glyphs (text). The Record label becomes a countdown digit, then "Recording" (js/03 1022): give it a min-width so the row doesn't reflow |
| A7 | Clock `#recMiniTime` "0:00 / 0:08" in Libre Franklin 12px `rgb(234,220,203)` | R2 `.val` (Share Tech Mono 13px .06em, tabular, `#e7d2b2`) | `#recMiniTime.rec-strip-time` | 41 | no | P2 | none |
| A8 | "Records" label `.rec-strip-label` in Libre Franklin 12px | R1 `.lbl` (10.5px Michroma .18em) | `.rec-strip-label` | 41 | no | P2 | Row width at 1440: label about 76 + 8 + strip, fits 250 |
| A9 | Filled slot: one pane with the name and "RECORDED" both in Michroma 9px in the same unlit colour; "Missing" has no distinct look | Name line as R10 (lit through aria-pressed while playing). Second line as a tile caption: Share Tech Mono 11px, `#72f2d4`, `0 0 5px rgba(114,242,212,.6)` (`.bt .bn`, 286). `.anim-slot-missing` → R27 dim (`opacity:.42`) | `.anim-slot > button[data-anim-name]`, its `div:last-child`, `.anim-slot-missing` | 41 | no | P2 | aria-pressed carries "playing" (js/20 3897). Don't restyle by text |
| A10 | Library head "Saved Animations ▾/▴" is a 286x40 pane whose open state is a text arrow (js/20 3934 `syncLibHead`) | R10 pane at full width (R12) with a chevron cell drawn like R17, rotated by `[aria-expanded="true"]` | `.anim-lib-head[aria-expanded]` | 41 | no | P2 | Hiding the ▾/▴ needs a text change in js/20 (H4). Until then, leave the text arrow and draw no second chevron |
| A11 | Library row: grip ⠿ in Libre Franklin 11px, name in Libre Franklin 12px; the colour-mode select wraps to its own line at 269px | Row as R30 `.lyr-head` (gap 7px). Name in the R24 `.tf` type (Share Tech Mono 14px .03em, `--unlit` at rest, `--lit` on `.playing`), like the study's layer name field (lite 909). The rename input `.anim-lib-rename-input` gets R24 in full. The mode select becomes R17 `.cp.sel.sm` on line 2, indented to the name's left edge. `.dragging` → opacity .5 | `.anim-lib-row`, `.anim-lib-grip`, `.anim-lib-name`, `.anim-lib-rename-input`, `.anim-lib-mode` (also `.rec-color-mode`), `.anim-lib-row.playing` | 41 (row), 37 (select) | partial: W3 (selects → fields; check that the compact `.sel.sm` exists) | P2 | The row is draggable and the select toggles `draggable` on pointerenter (js/20 4018). Don't add padding that moves the select's hit area onto the row |
| A12 | Keep row: "Keep what you painted?" in Libre Franklin 13px; Keep and Discard split 50/50 at 40px | Prompt as R4 `.hint`. Keep (btn--emphasis, primary) flex 1; Discard as a R10 + R14 pane at label width. 32px tall, 8px gap | `#recKeepRow .rec-strip-ask`, `#recKeepBtn`, `#recDiscardBtn` | 41 | no | P3 | js/03 sets `#recKeepRow` display inline. Style its children only |
| A13 | Status `#recStripStatus` in Libre Franklin 11px | R6 `.scr-cap` (the study's live caption `#crtInfo` is `.scr-cap` with aria-live, lite 879) | `#recStripStatus.rec-strip-status` | 41 | no | P3 | Keep `aria-live="polite"` |
| A14 | "No saved animations yet. Record one above." in Libre Franklin 13px | R4 `.hint` | `.anim-lib-empty` | 41 | no | P3 | none |

**Covered, verify only:** pane glass, mesh and lit states (done in css/31, js/71 panes); drawer front, bead row and atom (W1).

**Controls, study vs app** (information only): the study draws no Animations controls (placeholder, lite 992-1000). The app has Record / Play / Stop with a 3-2-1 countdown, a clock, length 4/8/15/30 s, Records Local only / Everything, a Keep / Discard prompt, a status line, six drop slots (play / stop, clear), and the Saved Animations library (play, drag to a slot, colour mode per animation, rename, delete).

## Audio

The drawer is built by js/20 7195-7700, the scene controls by js/30 ~880-975, and the lanes by js/40 1560-1720. Audio mode picks what shows:

- **Tunnel:** `#audioSceneBox` with the enable row and the scene controls.
- **Timing only / Minimized:** `#audioMini`.
- **Visualize Audio Timing:** `.atv-controls.audio-drawer-lanes` in the drawer, plus the floating `#audioTimingPanel`.
- **Full:** also opens the bottom `#recDrawer` studio drawer.

The study's Audio drawer (lite 1002-1046) is the literal target for Tunnel: gates screen, Add gate / Clear, No-gate mode, Gain / Volume / Speed, Spin. Shots: `audio-1920-tunnel-0/1`, `audio-1440-tunnel-1`, `audio-1920-min-0`, `audio-1920-timing-body`, `audio-1920-full-0/1/2`, `audio-1920-atv-foot`; study `study-sp-gates-0..3`.

| # | Now (seen) | Target | Element and hook | Owner | W brief | P | Risk |
|---|---|---|---|---|---|---|---|
| AU1 | Tunnel scene rows Gain / Volume / Speed put label, value and tube on one line. The tubes start at ragged x (label widths 85 / 106 / 99px) and the values touch the labels ("VOLUME100%", "SPEED0.60×") at 1920 and 1440 | The study's own rows (lite 1024-1029): R3 `.head` (label left, value right) above a full-width `.lad.sm` 38px tube (232-233), `margin-top:-9px` (170) | `.audio-scene-ctl:has(> .fader-stack-inline)`: `flex-wrap:wrap`; label `flex:1 1 100%`, `.value-display` `margin-left:auto`; `.fader-stack-inline` `flex-basis:100%`. js/06 95 adds `.fader-stack-inline` | 36 | partial: W2 §4 aligns head rows but doesn't restructure inline rows | P1 | Hooks only (`.audio-scene-ctl` is read by js/06 85). Don't rename. Ranges have no label (named only by title): see AU4 |
| AU2 | Gates editor canvas `.audio-gates-editor` (Tunnel 262x108; drawer Lanes 271x85): black `rgb(5,2,1)`, `1px rgba(251,236,217,.12)`, radius 6px. Script draws white grid lines, grey monospace axis labels, a red→green→violet spectrum, white gate boxes, and "enable audio to see the spectrum" in grey sans-serif | R19 + R20 `.scr.gscr`: VFD glass, copper bezel, scanlines, 16/10 aspect. Axis in Share Tech Mono 9px `rgba(114,242,212,.6)`; teal phosphor spectrum; copper-lidded gates (R20 `.gate`) | Frame: `.audio-gates-editor` (radius 10px, R19 bezel box-shadow; canvas can't take `::after`, so the scanlines go on `.audio-gates-row` or are skipped). Content: a JS presentation hook (H5) in js/30 `drawGatesEditor` (~780-840) and js/40 1575 that reads `--vfd`, `--cu`, `--cu-hi` from computed style once at init / resize | 38 (reuse W4's `.scr`), JS H5 | no | P1 | Read colours once, never per frame. Aspect 16/10 grows the Tunnel editor from 108 to about 164px tall (CSS at boot is fine). Check `wireGatesEditor` maps the pointer through the rect, not the canvas size |
| AU3 | `#audioSceneBox` and `#audioMini` (`.audio-mini`) are boxed panels: background `rgba(251,236,217,.05)`, `1px rgba(251,236,217,.1)`, radius 10px, padding 10px, margin-top 8px (css/21 1917) | Rule 1168 (no second box). Contents open as a new R8 `.fil` section (bead row + atom gap) on the drawer's column | `.audio-mini` (on both ids) | 41 | partial: W1 does the drawer's one bead row (css/34); inner sections nobody | P1 | js/20 applyAudioMode toggles inline display. Don't set display |
| AU4 | The Spin toggle is a bare 20px native checkbox to the right of a "Spin" label. It has **no accessible name** (AX checkbox ""), because the label isn't associated | R13 `.cp.sm.ic` wide (lite 1030 `cp sm ic wide` "Spin") | `.audio-scene-ctl > input[type=checkbox]` (no id). Needs JS hook H2 in js/30 ~940: an id plus `label for`, or wrap the input | 37 (pane), JS H2 | partial: W3 §2 (pane look); W3's pane relies on the label naming the input, which isn't true here | P1 | An a11y fix (goes up). The same js/30 builder leaves the scene ranges and cycle buttons without a programmatic label (see AU5) |
| AU5 | Cycle buttons `.audio-scene-cycle` "Leaving ⤴" (160x40) and "Bass" (118x40) sit beside their labels "Direction" / "No-gate mode" | The study draws No-gate mode as a 48px `.cp.sel` field under its label (lite 1022-1023). The app keeps the cycle button (IA), so: R30 `.field` stack (label above, gap 5px), the button as R10 + R12 with the value left-aligned (padding 0 16px), and no chevron (it doesn't open a list) | `.audio-scene-ctl:has(> .audio-scene-cycle)` → column; `.audio-scene-cycle` | 41 | no | P2 | The button's name is only the value ("Bass"). Add aria-describedby or an aria-label "No-gate mode: Bass" in js/30 `render()` (H2) |
| AU6 | The enable row `.audio-mini-row`: native 20px checkbox, "Enable" in Libre Franklin 12px **bold** (600), Mic select 71x31, Audio File pane 103x40, at three different heights | One 32px row, gap 8px: Enable as R13 `.cp.sm.ic` (Michroma 9px .12em, weight 400), source as R17 `.cp.sel.sm` (about 88px), Audio File as R10 flex 1 | `.audio-mini-enable` (label wrapping `#audioReactToggle`), `#audioReactSource.audio-mini-src`, `#audioChooseTrack` | 41 (row), 37 | partial: W3 §1-2 (pane and field looks, not this row) | P2 | `.audio-mini-row` is read by js/20 7347 (enableRow relocation). Hooks only |
| AU7 | Gate Clear `.audio-gate-clear`: a full-width 40px plain pane under the Tunnel editor | The study's `.row2` Add gate / Clear (lite 1016-1019): Clear as R10 + R14 (danger) at 32px. The app has no Add gate | `.audio-gates-row > .audio-gate-clear` (inline `flex:0 0 auto; margin-top`, **!imp** for margin) | 41 | no (S5) | P2 | none |
| AU8 | In the drawer, the Lanes block `.atv-controls.audio-drawer-lanes` is a framed box (`rgba(0,0,0,.2)`, `1px rgba(255,255,255,.04)`, radius 8px, padding 6px; css/22 1840), titled by a plain "Lanes" control label | No box (rule 1168); open it with R7 `.subhd` "Lanes", as the study opens its timing block with `.subhd.tsub` "Timing" (lite 1034, 457) | `#audioDrawerLanes.atv-controls` and its first `.audio-gates-row > label` | 41 | partial: W7 restyles the `.atv-*` classes for the floating `.atv-panel`; the same classes render here. Scope W7's rules to `.atv-panel` or share them deliberately | P2 | js/20 7314 (sidebar host) and 7697 (drawer lanes host) build it; display is toggled inline |
| AU9 | Lane rows `.atv-lane`: card background `rgb(29,19,13)`, radius 6px. Dot `.atv-dot` 10px; band label in monospace 10px `rgb(168,147,124)`; method pane 74x40; count "–"; delete ✕ 29x40; action selects 110x31 truncated mid-word ("every 4th cu") | No card (rule 1168), rows split by 8px gaps. Dot gets the R23 ring and highlight at 12px (`.lamp.ln`), keeping its inline lane colour. Band label in R2. Method R10 nowrap; delete R18 `.clr.sm`; selects R17 `.cp.sel.sm` with the value ellipsised | `.atv-lane`, `.atv-dot`, `.atv-lane-label`, `.atv-method`, `.atv-lane-count`, `.atv-lane-del`, `.atv-lane-act`, `.atv-act`, `.atv-every` | 41 | partial: W7 (same classes in `.atv-panel`); W3 (selects) | P2 | `.atv-dot`'s colour is inline data (laneColor). Add the highlight with `::after`, never override the background |
| AU10 | Save cues / Open cues are **two empty 20x40 panes**. js/40 1699 / 1705 set `textContent = ''`; it was "Save cues…" / "Open cues…" before 5db4c76. A content regression, not theme (`audio-1920-atv-foot.png`) | Restore the labels (H1), then a R16 `.row2` of R10 panes | `.atv-foot.atv-cue-files > .atv-reread` | JS content (js/40), then 41 | no | P1 | Today the buttons are named only by their titles. Restoring the text improves the names |
| AU11 | The "Full" mode opens `#recDrawer.studio-drawer` (`#audioDrawerPanel`), a full-width 1920x460 panel at the bottom of the window, painted light beige, untouched by the theme (`audio-1920-full-2.png`) | Overlay treatment: the study's cabinet / dark tray with the copper line (`.cab` 427-431, `.dtray` 453-458) | `#recDrawer.rec-drawer.studio-drawer`, `#audioDrawerPanel.studio-tab-panel` | 40 | partial: W7 (its inventory doesn't list `#recDrawer` / `.studio-drawer`) | P1 | Overlay; out of the drawer but opened from it. `.rec-drawer` is read by js/08b 205 |
| AU12 | Minimized / Timing only: "⬆️ Full audio" carries a blue colour emoji. File transport `.audio-play-btn` buttons are emoji glyphs ⏸ ⏮ 🔁 (only seen in source; they need a loaded file) | Text-only R10 + R12 pane; transport as R11 `.cp.sm.sq` glyph panes; `#audioClock` in R2 | `#audioOpenFullBtn.audio-mini-full`, `.audio-play-btn`, `#audioClock.audio-clock` | 41, JS content (H7) | no (S6) | P2 | Transport not verified on screen (needs a loaded file) |
| AU13 | Lanes footer: "No track loaded" in Libre Franklin 10px `#a08a76`; Re-read is a 89x40 pane | Status in R6 `.scr-cap`; Re-read as R10 | `.atv-foot .atv-status-text`, `.atv-reread` | 41 | partial: W7 (same classes) | P3 | `.atv-status-text` is pushed into statusHosts (js/40 1681). Text is written by script |

**Covered, verify only:**
- Audio mode, source and lane selects become fields: W3 §1. These are inline-painted (`!important` in css/31 already).
- The "Visualize Audio Timing" checkbox becomes a pane: W3 §2. Its label has inline `margin:0; font-size:10px` (**!imp**).
- Lead, Nudge, Gain, Volume, Speed tubes: W2.
- The floating `#audioTimingPanel` / `.atv-panel`: W7.
- The "Under construction" badge already matches `.dtag` (css/30 248, study 451).

**Controls, study vs app** (information only):
- **The study has, and the app lacks:** a gate count on the drawer front (`.dextra .val` "4 gates", lite 1005); an "Add gate" pane (1017); No-gate mode as a dropdown field (the app cycles a button); the timing-lanes screen *inside* the drawer, with Kick / Snare / Hats lamps and a hide ring (1034-1044). The app shows that chart as the floating `#audioTimingPanel`.
- **The app has, and the study lacks:** Audio mode (Off / Tunnel / Timing only / Minimized / Full); Enable + source + Audio file; the file transport; Direction; drawer lanes with Clear / Auto / Fit; per-lane method, count and delete, action and "every N"; Lead, Nudge; status + Re-read; Save / Open cues; the Full-mode bottom studio drawer.

## Effects

Built by js/20 (`fxRow` ~4410-4500) on static panels in index.html (~1100-1260). The study has a placeholder only (lite 982-990). The matching study components:

| App panel | Study component |
|---|---|
| Light Shift | The Colors drawer's colour CRT (lite 873-891) |
| Gravity Direction | The Simulation drawer's gravity scope (lite 852-860) |
| Thumbnails | The Layers `.thumb` (lite 908) |
| Dither pad | The `.scr` screen |

Shots: `effects-1920-open-0..7`, `effects-1440-open-0..6`, `effects-1920-dither-draw.png`; study `study-sp-light-*`, `study-sp-grav-*`, `study-sp-layers-0`.

| # | Now (seen) | Target | Element and hook | Owner | W brief | P | Risk |
|---|---|---|---|---|---|---|---|
| E1 | `#lightSourceControls` and `#lightShiftControls` are boxed sub-panels: inline `margin-left:20px; margin-top:8px; padding:12px`, plus css/30 293-296 (gradient `rgba(8,4,2,.35→.15)`, `border-left 2px #c47a4b`, radius 4px). Their tubes start 32px further right than Glow / Shading / Dither, so the drawer's left edge is ragged | Rule 1168: no second box; the panel's controls sit on the drawer column (`.cabinet .sp-field` padding `2px 6px 8px`, lite 431) like every other panel | `#lightSourceControls.light-source-controls`, `#lightShiftControls` (**!imp** on margin-left, padding, background, border-left) | 41 (and delete css/30 293-296) | no | P1 | js/13 / js/14 toggle inline display. Don't set display |
| E2 | Light Shift wheel `#lightShiftWheel`: a 202x202 rainbow canvas, centred, radius 4px, inline `1px` border. Caption "Draw a path through colors" in Libre Franklin 11px `rgba(255,255,255,.7)`, centred above | The study's light-shift CRT (lite 873-879): R1 `.lbl` caption, left-aligned above; R21 `.crt` frame at full column width, aspect 1/.84, canvas inset 7px with radius `18px/15px`, vignette and glass `::after` | Canvas `#lightShiftWheel` (**!imp** border, radius). Its wrapper is unclassed: `#lightShiftControls > div:has(> #lightShiftWheel)` (inline flex / centre / margin), and the caption is `#lightShiftControls > div:first-child > label` (inline 11px). Better: hook H8 | 41 | no | P1 | Pointer mapping uses the rect × scale (js/14 407-411), so resizing in CSS is safe. The 202px backing store will soften when stretched (raising it is a JS change; leave it). The study's aperture-grille mask is drawn in its canvas: optional, P3 |
| E3 | Gravity Direction pad `#pressurePad` is a square, 286x286 at 1920, radius 6px, near-invisible `1px rgba(255,255,255,.04)` border. Warm oklch crosshair (`-h`, `-v`), a dashed ring, an orange arm and dot | R22 `.scope` (the study's gravity scope, lite 852-860): round, `#020706`, double copper ring, 9px inner vignette and glass. Crosshair and ring in teal `rgba(114,242,212,.35)` / `.25`; arm teal; dot as teal phosphor (core `#7ff5d9`, glow `0 0 10px rgba(114,242,212,.8)`) | `.pressure-pad` (radius 50%, R22 background and box-shadow; `::after` for the vignette), `.pressure-pad-h`, `-v`, `-ring`, `-arm`, `-dot` (script writes only left / top / width / transform / opacity inline; colours are free) | 41 | no | P1 | `border-radius:50%` also rounds hit-testing at the corners. Values clamp to the disc already (js/20 4253-4260), so only starting a drag in a corner is lost |
| E4 | Gravity readout `.pressure-pad-read` "down — 60%" in Libre Franklin 10px `#a08a76`, centred | R6 `.scr-cap` in a R30 `.line`, as the study's `#gravRead` (lite 858) | `.pressure-pad-read` | 41 | no | P2 | Text written by js/20 4244 |
| E5 | Light Source pad `#lightGridContainer`: 224x224 at 1920 (inline width), radius 4px, `1px #c47a4b`, mesh fill (css/30 302-308). Crosshair `rgba(214,140,92,.25)`; dot `#lightDot` gold with a 2px white ring; a soft inline radial overlay follows the dot | Same screen family as E2: R21 `.crt` frame (radius 12px, `#050403`, copper bezel, vignette and glass `::after`) at full column width, square. Dot as a R23 lamp at 18px (`--gc 255 110 30`, `--i 1`) | `#lightGridContainer.light-grid-container` (**!imp** width / border / background), `.light-grid .grid-line` (**!imp**, inline), `#lightDot.light-dot`; `.light-gradient-overlay` stays as script paints it | 41 (and delete css/30 302-308) | no | P2 | Pointer maps through the rect (js/13 162), so CSS size is safe |
| E6 | Inline 12px labels "MODE" (Light Source) and "BLEND MODE" (Light Shift): `style="font-size:12px;margin-bottom:4px"`, larger than every other label | R1 `.lbl` 10.5px (S1) | `#lightSourceControls > .control-group > label`, `#lightShiftControls > .control-group > label` (**!imp**) | 41 | no | P2 | none |
| E7 | Effect rows `.fx-row`: thumbnail 26-29px, radius 4px, `1px rgba(255,255,255,.12)`, empty-state background bluish `linear-gradient(135deg,#1c2230,#0d1017)` | R25 `.thumb` 38x38 (padding 3px, `#0b0706`, inset copper 1.5px, gloss `::after`) at the head of a R30 `.lyr-head` row (gap 7px); the toggle beside it is W3's pane, flex 1 | `#sidebar-right .fx-thumb` (span, role=img, tabindex 0), `.fx-thumb img`, `.fx-thumb.is-empty`, `.fx-row` | 41 | partial: W3 §2 turns the checkbox into a pane; the thumb and row composition nobody | P2 | The thumb is focusable and opens the `.fx-tip` hover card. Its focus ring becomes R31. 38px thumbs make the rows 38px tall |
| E8 | Group dividers: `.fx-cluster` has `border-bottom:1px rgba(255,255,255,.06)` + padding-bottom 8px; `.fx-group` only a margin | R8 bead row between groups (2px dotted `rgba(214,140,92,.55)` at top 6px, 26px gap at the centre). The atom inherits the section's `--rot` (js/71 writes it on the section) | `#sidebar-right .fx-cluster`, `.fx-group` (`::before`), and the rows after them | 41 | partial: W1 (one bead row per drawer, css/34) | P2 | none |
| E9 | Dither "Draw your own": `#ditherPad` 143x143 and `#ditherRamp` 72x143 canvases, near-invisible border, radius 4px, white and grey cells drawn by script. Invert / Clear 140x40 each | Pad and ramp on R19 `.scr` frames; cells as phosphor `#7ff5d9` on `#040b0a` (JS hook H5 in js/68, colours read once). R16 `.row2` of R10 panes, Clear as R14 | `.dither-draw-row`, `#ditherPad.dither-pad` (role=application, focusable: R31 ring), `#ditherRamp.dither-ramp`, `.dither-draw-actions`, `#ditherPadInvert`, `#ditherPadClear` | 38 (screens), 41, JS H5 | no | P2 | Colour hook only. js/68 reads params live; no per-frame getComputedStyle |
| E10 | Vertical rhythm: `.fx-row` margin-bottom 4-6px, `.control-group` margin-bottom 6px, so the spacing is uneven | R8 `.fil` gap 8px between rows | `#sidebar-right .section-body .control-group`, `.fx-row` (Effects only, or every drawer) | 41 | no | P3 | Taller drawer; no behaviour |

**Covered, verify only:**
- Effect master checkboxes, "Scatter" and "Cue words" become checkbox panes: W3 §2. Their labels carry inline `margin:0` and opacity .8.
- Mode, Blend mode, Pattern, Color, Breathing pattern and colour selects: W3 §1. They are inline-painted (`#lightMode` and `#lightShiftMode` already **!imp** in css/30 297-301).
- All tubes, including Beat pulse at 0 and the disabled states: W2.
- Clear path, Dither Clear: S5.

**Controls, study vs app** (information only):
- **The study's matching drawers have, and the app's Effects lacks:** the CRT's hint text and its two live captions (`#crtInfo`, `#crtNow`, lite 878-879); a "Center" pane and a hint for the gravity scope (858-859); keyboard operation of the gravity scope (tabindex 0, arrow keys, Home). The app pad isn't focusable, and that behaviour is frozen.
- **The app has, and the study lacks:** Light Source (Mode, XY pad, Intensity, Ambient); Glow (Intensity, Threshold), Scatter; Surface Shading (Intensity, Relief, Gloss, Ridges, Ridge strength, Vibrance); Dither (Pattern incl. Draw your own, Levels, Size, Color, Beat pulse); Border (Width); Breathing (Pattern, Swirl strength, Color, Cue words); effect preview thumbnails with hover cards.

## Kaleidoscope

Static markup in index.html (~925-1050), with `js/05f-kaleido-controls.js`. The study has a placeholder only (lite 1048-1056). Shots: `kaleido-1920-open-0..3`, `kaleido-1440-open-0..2`.

| # | Now (seen) | Target | Element and hook | Owner | W brief | P | Risk |
|---|---|---|---|---|---|---|---|
| K1 | Mandala Overlay and Kaleido are framed cards. The head bar is 38px, `rgb(29,19,13)`, `1px rgb(59,42,31)`, radius 6px 6px 0 0, with an iOS switch. The body is `rgb(23,15,10)`, padding 10px, radius 0 0 6px 6px (css/21 1599-1668). That is a box inside the drawer, and it narrows the tubes to 262px against 286px elsewhere | Rule 1168: no box. The master toggle is a wide checkbox pane (W3 decides `.cp.ic` vs `.cp.sm.ic`), and the body opens as a R8 `.fil` section on the drawer column (full 286px). Off: the head pane alone | `.control-group.checkbox-group.feature-head` (+ `:has(> input:checked)`), `.feature-body` (+ `.open`), `#mandalaPanel`, `#kaleidoPanel` | 41 (and neutralise css/21 1599-1668 under the theme) | partial: W3 §2 (master toggles in header bars); the card frame and body padding nobody | P1 | The label fills the bar so a click anywhere flips the switch (css/21 1609). Keep the label as the full click target. `.feature-body` display is script-toggled |
| K2 | Sub-heading "Paint feel" (`.mandala-sub`): Libre Franklin 11px .5px, uppercase, opacity .55, `border-top:1px rgb(59,42,31)`, margin 14px 0 8px | R7 `.subhd` (Michroma 9.5px .22em `#e7d2b2` between two 1.5px dotted copper rules) | `.mandala-sub` (`display:flex` + `::before`/`::after`; the text node becomes the middle item) | 41 | partial: W1 (sub-headings, per the orchestrator's summary; W1's brief text doesn't name them) | P2 | none |
| K3 | "(Z)" hint inside the Zoom mode label: a span at inline opacity .5, same Michroma as the label | The theme's key hint, `.hk-cap` (css/30 441-448: Share Tech Mono, `--lit`, copper hairline), at the label's end | `label[for="zoomModeToggle"] > span` or `#zoomModeToggle + label > span` (**!imp** opacity) | 41 | no | P3 | Part of the label's accessible name ("Zoom mode (Z)"); keep the text |

**Covered, verify only:**
- The switches `#mandalaToggle` and `#kaleidoToggle` (role=switch) become panes: W3 §2.
- Fill Off / Fit / Full (`.mandala-radio`, `label > input[type=radio]`) becomes a radio bank: W3 §3. Today the labels carry `1px rgba(242,179,138,.7)` and a `.12` tint.
- Paint only in wedge, Hide guides, Zoom mode, Show guides, Animate rotation become checkbox panes: W3 §2.
- Kaleidoscope mode becomes a field: W3 §1.
- All tubes: W2. Save picture: S4.

**Controls, study vs app** (information only): the study draws no Kaleidoscope controls.
- **Mandala Overlay:** Wedges, Paint only in wedge, Hide guides, Fill (Off / Fit / Full), Zoom mode (Z); under Paint feel: Density sustain, Motion isolation, Drying, Dry time; Save picture.
- **Kaleido:** Facets, Kaleidoscope mode, Show guides, Angle, Animate rotation, Spin speed, Twist, Zoom, Opacity.

## Text

Built entirely by js/20 (~6350-7110) with `style.cssText`, so most nodes have no class. The editor `div` (6621), the caption helper `field()` (6357-6366), the row builder `refreshList` (6526-6600) and the hint (6495) need presentation hooks (H6) for clean selectors. The study has a placeholder only (lite 1058-1066). The matching components:

| App element | Study component |
|---|---|
| Line list | The inline listbox option rows (`.lbx .cp`, 213-216; `.wc-opt` in css/31) |
| Visibility | The pilot `.lamp` (368, "a round cathode used for on/off like layer visibility") |
| Swatches | `.sw` |
| Align | The Tip bank (`.tips`) |
| Hotkey | The keycap `.kc` |

Shots: `text-1920-open-0..3`, `text-1440-open-0..2`.

| # | Now (seen) | Target | Element and hook | Owner | W brief | P | Risk |
|---|---|---|---|---|---|---|---|
| T1 | The selected line row is pink: inline `border:1px solid rgba(255,130,170,.5)`, `background:rgba(255,130,170,.12)`, radius 3px, padding 3px 4px. That is off-palette | Option row as the inline listbox option (`.wc-opt`, css/31): radius 5px, padding 6px 10px, glass + mesh, `inset 0 0 0 1px rgba(196,122,75,.7)`. Selected = lit cathode: colour `#ffd9b0`, glow `0 0 6px rgb(255 110 30/.9)`, `inset 0 0 12px rgb(255 110 30/.3)`. Not pink | Rows are unclassed `#textOverlayList > div` with only inline state. Hook H6: `txo-row` + `aria-current="true"` on the selected row (js/20 6545-6548). Stopgap: `#textOverlayList > div[style*="255,130,170"]` (**!imp**) | 41 | no | P1 | The row's name span keeps its own font-family on purpose (it previews the face, js/20 6551). Rows are click-only divs (no tabindex / role): keyboard users can't pick a line. Behaviour, out of scope; reported |
| T2 | Row actions: ✥ (Arrange, `btn--ghost` 27x19), 👁/🙈 (Show / hide, `btn--ghost` 28x19, colour emoji), × (Delete, `btn--destructive` 25x40, glyph clipped) | ✥ → R11 `.cp.sm.sq` 32x32. Show / hide → R23 `.lamp` 24px, lit (`--i:1`) while the line is visible. × → R18 `.clr.sm` 28px | `#textOverlayList > div > button` (inline `padding:2px 6px; font-size:11px` **!imp**). The lamp needs a state hook: `aria-pressed` on the toggle (H6), which js/71 then lights automatically | 41, JS H6 | no (S3, S6) | P1 | Names today are "✥", "👁", "×" (titles describe). Add aria-labels with the line name (H6). aria-pressed on show / hide exposes its state |
| T3 | Editor captions (Font, Size, Weight, Align, Case, Text, Background, Padding, Corner, Hotkey, When pressed): Libre Franklin 9px .05em uppercase `rgba(255,255,255,.4)`. The faintest text in the app (about 10 of them) | R1 `.lbl` (Michroma 10.5px .18em `#e7d2b2` + shadow), margin-bottom 5px (R30 `.field`) | `field()` captions (js/20 6362, inline **!imp**). Hook H6: class `txo-lbl`; without it, `#sidebar-right .section-body > div > div > div:first-child:not(:has(*))` is brittle | 41 | no | P1 | Width: "BACKGROUND" at 10.5px .18em is about 111px in a 140px column, fits; it keeps `white-space:nowrap` |
| T4 | Hint "Drag, resize using controls, or rotate using the top center handle." (inline 9px, `rgba(255,255,255,.35)`, centred), "No text detected" (inline 9px `.3`, centred), "Select a line above to edit its type." (inline 9px `.3`, centred) | R4 `.hint` (12px/1.45 `#cdb79f`, shadow, left-aligned) | Hook H6: `txo-hint` on the arrange hint (js/20 6495), `txo-empty` on the empty-list template (6535-6536) and on `emptyNote` (6616). **!imp** | 41 | no | P2 | none |
| T5 | Size / Weight / Italic and Align / Case rows mix heights: number input 31, selects 31, Italic 29x40, Align buttons 34x40, all bottom-aligned. So "ALIGN" and "CASE" sit about 8px apart vertically (`text-1440-open-1.png`) | Compact tier everywhere in the editor: R24 `.tf` 32px, R17 `.cp.sel.sm` 32px, R11 32x32 panes. Captions on one baseline | `#textOverlaySize`, `#textOverlayWeight`, `#textOverlayCase`, the Italic and Align buttons (inline sizes **!imp**) | 41, 37 | partial: W3 §1 makes sidebar fields 48px, which would make these rows worse. The editor needs the compact `.sel.sm` | P2 | none |
| T6 | Align: three 34x40 panes with SVG bars (`fill="currentColor"`), gap 3px. Italic "I" 29x40 (inline width 26px, italic bold, so it reads as "/") | Study Tip bank (R29 `.tips`, gap 6px): three R11 32x32 panes, glyph colour via the pane (currentColor already). Italic as R11 | Align buttons and Italic: `.active` class only (italic js/20 6735, align group 6760). Hook H6: `txo-align` on the group | 41 | no | P2 | State is exposed only by `.active`, not `aria-pressed`. Adding aria-pressed is an a11y improvement (H6) |
| T7 | Colour wells `.text-swatch` (`#textOverlayColor` 140x25, plain white native swatch; `#textOverlayBgColor` 119x25) | R26 `.sw` frame: height 26px, radius 5px, copper bezel `inset 0 0 0 1.5px #c47a4b` + `0 0 0 1px rgba(0,0,0,.6)`; `::-webkit-color-swatch-wrapper{padding:3px}`, `::-webkit-color-swatch{border:0;border-radius:3px}` (the radial glow needs the colour as a variable, so skip it) | `.text-swatch` (in contract; shared with js/05k 481 layer swatches) | 37 | no | P2 | `#textOverlayBgColor` dims through inline opacity / pointer-events while the box is off (js/20 6852 `syncBgEnabled`). Keep that |
| T8 | Hotkey "Set key" is a full-width 286x40 pane | R28 `.kc` keycap (72x48 or `.kc.sm` 48x32) at the start of the row, as the Input drawer's lock rows (lite 782-791: kc + clr + text) | `.hk-picker` / `.hk-picker-row` / `.hk-picker-key` inside the Text editor | 37 | partial: W3 §4 (keycap face); the full-width layout here isn't in W3 | P2 | `.hk-picker-key` text changes to "Press a key…" while listening. A fixed 72px cap must fit it (or use `.kc.listen` 7.5px, 218-224) |
| T9 | Duplicate / Fluidize / Delete: flex widths 107 / 87 / 81 at 40px | R16 `.row3` (3 equal columns, gap 6px) of R10 panes; Delete as R14 | Parent of `#textOverlayFluidize` (`div:has(> #textOverlayFluidize)`) or hook H6 `txo-actions` | 41 | no | P2 | none |
| T10 | Content textarea `#textOverlayContent`: monospace 12px `--lit`, 46px. On focus a **white** 2px ring and a blue text selection | R24 `.tf` type on a multi-line field: Share Tech Mono 14px .03em, `--unlit` → `--lit` on focus, caret `#ffb070`, R31 focus outline, `::selection rgba(255,120,40,.4)` | `#textOverlayContent` (inline background **!imp**) | 37 | partial: W3 §4 (text fields). Check the white ring and the selection colour | P2 | none |
| T11 | Font preview "Aa Bb Cc 123": inline 17px, `rgba(255,255,255,.85)` on `rgba(255,255,255,.05)`, radius 4px | Keep the face (it previews the chosen font). Frame it as a R24 `.tf` well (mesh glass, inset copper 1.5px, radius 5px), text `--lit` | Unclassed (js/20 6646): hook H6 `txo-preview` (**!imp**) | 41 | no | P3 | Never override font-family here |
| T12 | "In the room" heading for other painters' lines: inline 9px .08em uppercase `rgba(255,255,255,.45)` (needs a room; not shot) | R7 `.subhd` | js/20 6578 head (hook H6 `txo-subhd`, **!imp**) | 41 | no | P3 | `.mp-owner-dot` colour is data (06e repaints it). Keep it |
| T13 | Clear All confirm `#textOverlayClearAsk` (role=group): prompt and buttons in legacy sizes (not shot) | Prompt R4; buttons R16 `.row2`: "Yes, clear all" as R10 + R14, cancel as R10 | `#textOverlayClearAsk`, `#textOverlayClearConfirm` | 41 | no | P3 | Inline display toggled (js/20 7092, 7104) |

**Covered, verify only:**
- Font, Weight, Case, collider mode, When pressed selects become fields: W3 §1. Inline-painted: css/31 already uses `!important`.
- Size, Padding, Corner number fields: W3 §4.
- Drop shadow, Fluid collides, Pour at the brush, Background toggle become checkbox panes: W3 §2. `#textOverlayBgToggle` has an inline 14px size.
- Letter spacing, Line height, Opacity, Background opacity, Wall strength tubes: W2.
- "+ Add Text", "Arrange on Canvas", "Convert to brush", "Clear All": S4 / S5.

**Controls, study vs app** (information only): the study draws no Text controls. The app has + Add Text, Arrange on Canvas, the line list (select, arrange, show / hide, delete) with other painters' lines under "In the room", and the type editor: content, font with preview and installed fonts, size, weight, italic, align, case, letter spacing, line height, opacity, text colour, background toggle + colour + opacity, padding, corner, drop shadow, "Fluid collides" (mode, wall strength), hotkey (when pressed, pour at the brush), Duplicate, Fluidize, Delete, Convert to brush, and Clear All with confirm.

## JS presentation hooks the second wave needs

Each is small and changes no behaviour. Ids and classes in `prep/selector-contract.md` keep their names; these add hooks beside them.

| Id | File : lines | Hook |
|---|---|---|
| H1 | js/40 1699, 1705 | Restore `saveBtn.textContent = 'Save cues…'` and `openBtn.textContent = 'Open cues…'`. Blanked in 5db4c76, likely by accident. Ask Gabriel (Q3) |
| H2 | js/30 ~901-950 (scene control builder) | Give the toggle checkbox an id and link its row label (`for`), or wrap it in the label. Give range inputs an `aria-labelledby` pointing at their row label. Give cycle buttons an `aria-describedby` / `aria-label` "<row label>: <value>". All a11y improvements |
| H3 | js/20 3903, 4029, 4041 | aria-label on `.anim-slot-clear` ("Clear slot N"), `.anim-lib-rename` ("Rename <name>"), `.anim-lib-delete` ("Delete <name>") |
| H4 | js/20 3934 `syncLibHead` | Drop the " ▾" / " ▴" from the label once CSS draws the chevron from `aria-expanded` (content) |
| H5 | js/30 ~780-840, js/40 1575, js/68 (dither pad / ramp) | Read the theme palette (`--vfd`, `--cu`, `--cu-hi`) once at init and on resize from `getComputedStyle(canvas)`, and draw with it. Never per frame |
| H6 | js/20 6350-7110 (Text) | Add these: <ul><li>`txo-row` + `aria-current` on the selected row</li><li>`aria-pressed` on show / hide</li><li>aria-labels on ✥ / show / ×</li><li>`txo-lbl` on `field()` captions</li><li>`txo-hint` on the arrange hint</li><li>`txo-empty` on the empty-list template and on `emptyNote`</li><li>`txo-editor` on the editor div</li><li>`txo-preview` on the font preview</li><li>`txo-align` on the align group, with aria-pressed on align and italic</li><li>`txo-actions` on the Duplicate / Fluidize / Delete row</li><li>`txo-subhd` on the "In the room" head</li></ul> |
| H7 | js/40 1600, js/20 7269-7271 and 7281, js/20 6570, js/30 cycle names | Emoji-free labels (S6). Content: ask Gabriel (Q1) |
| H8 | index.html (`#lightShiftControls`) | A class on the wheel wrapper and on the caption, for E2. Optional; `:has()` works without it |

## Questions for Gabriel

- **Q1.** May labels lose their emoji (✨ Auto, ⬆️ Full audio, 👁/🙈, ⏸ ⏮ 🔁, ⤴)? The study's panes are text only. This is a content change.
- **Q2.** Should recording-in-progress stay a solid pulsing red plate (it reads across the room), or become the study's danger pane at full brightness?
- **Q3.** The drawer's Save cues / Open cues buttons have been blank since 5db4c76. Restore "Save cues…" / "Open cues…"?
- **Q4.** Should the Audio "Full" bottom studio drawer (`#recDrawer`, beige today) join W7's overlay pass, or have a pass of its own?

## Count

| Drawer | Gaps | P1 |
|---|---:|---:|
| Animations | 14 | 5 |
| Audio | 13 | 6 |
| Effects | 10 | 3 |
| Kaleidoscope | 3 | 1 |
| Text | 13 | 3 |
| **Total** | **53** | **18** |

Plus 6 shared gaps (S1-S6; S3 is P1).
