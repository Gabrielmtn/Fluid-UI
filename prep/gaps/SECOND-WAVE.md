# Walnut & Copper: second wave plan (after W1-W7 merge)

2026-10-17, written against `walnut-copper` at `a0477e1`. Merges the four gap specs (`g1`-`g4` in this folder) with the W1-W7 briefs, drops what a brief covers, and adds what nobody looked at (rows marked **NEW**).
Row detail (hooks, literal values, risks) stays in the gap specs: `g1 L4` means row L4 of `g1-layers-colors-mutate.md`. "Rule NNNN" means a line of study-lite's design rules (1150-1196).

## Measured while writing this

| Fact | Evidence |
|---|---|
| At 1366 x 768 both sidebars lay out exactly as at 1440 x 900 | theme-lint (scratch copy, main checkout): the same 136 issues at each size |
| Sidebars are pinned at 320 / 288 CSS px, and `--ui-scale` is 1.0 up to 1600 px | `css/34-theme-scale.css:12-13`, `ui-map.md` §4 |
| Size every fit for the **254 CSS px** column (1440 with the scrollbar showing) | g1 / g3 geometry |
| The right sidebar's drag-to-resize edge does nothing in any theme: nothing reads `--sidebar-width` | written at `js/20:227`, never read in `css/` (pre-existing) |
| theme-lint only sees trays in their default state: Text shows 0 labels, and the Kaleidoscope bodies stay shut | lint report, Kaleidoscope / Text rows |
| No `@media (forced-colors)` rule in css/30-40. js/71 never checks PhotoSafe | grep |

## Before launch (integrator)

1. Merge W1-W7. Re-run theme-lint and the gap state scripts (`scripts/states.js`, `states2.js`, `explore.js`). Strike the rows below that the merge already fixed.
2. Make one prep commit, the same way as c5fabe1: empty `css/41`-`44` and `js/76`, linked after 40 / 75, in `@layer theme`. js/38's regex already lets `4x` sheets colour buttons.
3. Land E1 (theme-lint states, 1366, focus-ring) first. Re-baseline the lint after the merge.
4. Ask the questions at the end. Items that wait on an answer carry its number (Q#).

## Ground rules for wave 2 (on top of 00-shared)

- **41 (kit)** owns how a component looks: paint, type, height, padding.
- **42-44** own where it sits: grid, flex, order, width, margins. They load after 41, so placement wins.
- W sheets 33, 35-39 and js/69, 72-74 are **read-only**. Override them from your own sheet (inside `@layer theme`, at equal specificity, the later sheet wins). List every dead rule in your report.
- `css/30` and `css/34` belong to WS-A alone, which deletes what the kit replaces.
- Never put study classes in the DOM. Use only the app hooks the gap specs name.
- A3's `nowrap` clips until the fit rows land (B2, B3, C4, D1, D2, D4). The integrator merges them as one change.

## Conflicts settled in the dedupe

| Conflict | Decision |
|---|---|
| g1, g2 and g3 each claim a new `css/41` (and g4 claims a forced-colours 41) | 41 is the kit (forced colours included), 42 core + left, 43 expressive, 44 system |
| The atom in inner dividers: static (g1 C3) or spinning with its section (g2 E8, g3 S7, g4 X5) | It spins with the section's `--rot` (rule 1169). No new loop |
| Field tier inside rows: 32 px (g1 L17) or 48 px (W3) | Study tier map: 48 px standalone, `.sel.sm` 32 px in rows, cards and editors (Q8) |
| Row names: ellipsis (g3 G7) or never (g4 R3) | A19: user-named content may ellipsize, app labels never |
| Length chips as a joined 4-way strip (g2 A1) | Rule 1166: three or more options use indicator panes |
| Layer and text-line visibility: W3's square pane or the study lamp | The lamp (g1 L11, g2 T2) |
| Sidebar value colour: lit (W2) or engraved (study) | Q1 |
| `.hk-cap` size: 17 px (g3 S9) or 48 x 32 (g4 B3) | One rule, Q7 |

---

## WS-A: Component kit (every drawer, highest impact)

**Files:** `css/41-theme-kit.css` (new), `css/31` (pane recipe section), `css/34` (delete the legacy rules at 51-86), `css/30` (deletions only).

| # | Item | From | P |
|---|---|---|---|
| A1 | **Labels.** One `.lbl` for every non-pane label in both sidebars (Michroma 10.5px, .18em, engrave, shadow) | g1 C4, g2 S1 E6 T3 A8, g3 S4 E10 D11, g4 X2 H3 | P1 |
| A2 | **Values.** One `.val` (Share Tech Mono 13px, .06em, tabular, opacity 1), Courier readouts included. Colour per Q1 | g1 C5, g2 S2 A7, g4 X3 H4 R6 | P1 |
| A3 | **Pane tier.** Every sidebar button becomes `.cp.sm`: 32px, nowrap, .12em, radius 5. Where a bank doesn't fit, tighten the whole bank (8.5px / .06em / padding 6). Never an ellipsis. Move css/34:51-66 here | g1 C1, g2 S4, g3 S1, g4 X4 | P1 |
| A4 | **Sub-headings** per the map below: `.sect`, `.subhd` or `.lbl` | g1 C2 L14, g2 K2 AU8 T12, g3 S6 E4 G11 F3, g4 X1 M1 | P1 |
| A5 | **Group dividers.** A `.fil` bead row opens each group after the first, with the atom on the section's `--rot`. The 1px rules and borders go | g1 C3, g2 E8, g3 S7 E5 G16 F5 D10, g4 X5 H6 | P1 |
| A6 | **Text roles.** `.hint` for help and empty text. `.scr-cap` VFD caption for status text (keep `aria-live`). `.sub` for row subtitles | g1 L15 L20 L28 K7, g2 A12-A14 AU13 E4 T4, g3 S5 D2 D9 E6 F2 G5 G12 G15, g4 X6 B4 | P1 |
| A7 | **Small parts.** Glyph panes `.cp.sm.sq` 32. Clear rings `.clr.sm` (with a forced-colours fallback). Chevrons `.disc` / `.chev`, driven by `aria-expanded` / `.collapsed` | g1 L5 L23 K6, g2 S3 A4 A5 A10, g3 G2 G8, g4 R2 B4 | P1 |
| A8 | **Content frames.** `.thumb` (layers, SIM as phosphor, mutate, fx, presets). `.sw` colour wells, palette chips included (glow from `--sc`, E2). `.lamp` for visibility toggles | g1 L8 L9 L11 L18 L24 K5 M8, g2 E7 T2 T7, g3 D1 G13 | P1 |
| A9 | **Choice banks.** Two-way choices become `.joined`. Three or more become indicator panes (rule 1166). A bank shares one width, as equal grid cells | g1 M2 M5, g2 A1 A2, g3 G1 F1, g4 B1 B2 B8 R4 R7 | P1 |
| A10 | **List rows**, three recipes: option row (`.wc-opt` look: palette options, Text lines), item row (`.lyr-head`: layer, path, animation, preset and lane rows), key row (`.lock`: stroke-lock, hotkey, radial and Text hotkey rows) | g1 L21, g2 T1 T8 A11 AU9, g3 G6 G7 G13, g4 R1 R3 | P1 |
| A11 | **NEW States.** One disabled rule: unlit, no glow, children at .42, default cursor, inline-dimmed groups included. Hover cleanup: keep only the study's hovers (field +.5, `.tf` #c8ad94, `.clr`, drawer front, stamp tile). One focus ring (2px #ffb547, offset 3), drawn inset where a clipping ancestor would cut it | rule 1163, study 321 | P1 |
| A12 | **Danger pane.** Vars only (`--gc 255 58 40`), the copper bezel stays, applied across the destructive list. Recording plate per Q2 | g1 L12 L19 L26, g2 S5, g3 S3 E8 | P2 |
| A13 | **Pane glass.** Mesh at 7 x 12.12, lit mesh in `::before`, sheen in `::after`. Add the `--mesh-lit` / `--mesh-vfd` tokens (study 137-138) | g3 S2 | P2 |
| A14 | **Fields beyond W3.** `.tf` for text and number inputs (spinners per Q10). `.sel.sm` inside rows, cards and editors (Q8) | g1 L10 L17, g2 T5 T10 T11 A11 AU6, g3 E9 E12 G9 G17, g4 R5 | P2 |
| A15 | **Tags and legends.** `.dtag` for tags, crumbs and the roles notice. `.hk-cap` unlit at rest, weight 400, follows its pane; size per Q7 | g1 M4 M9 M12, g2 K3, g3 S9 D7 F4, g4 B3 R8 | P2 |
| A16 | **NEW Remote tint.** Every kit component reads `--tgc` / `--ga`: pane glow, field, indicator, lamp, swatch ring, joined strip. The left sidebar never tints (rule 1171) | rules 1186-1196 | P2 |
| A17 | **Rhythm and scrollers.** 8 px between panes, 6 inside row2 / row3, 5 from label to field, **10 between frames (NEW, rule 1158)**. A thin copper scroller on both columns and every inner list; then re-measure the column | g3 S8, g3 G3, g4 H1 | P2 |
| A18 | **Forced colours.** One block covering every theme sheet's components (study 322-326, 399) | g4 X7, g1 Q9 | P2 |
| A19 | **NEW Naming rule.** User-named content (palette, layer, preset, animation, text line, key combo) may ellipsize, with its title. App labels never; they wrap per Q3 | g1 K1, g3 G7, g4 B1 R3 | P2 |

**A4 sub-heading map**

| Recipe | Gets |
|---|---|
| `.sect` | `.brush-section-label` group titles (Presets, Paint Into, Tip, Mouse Buttons, Stroke Locks, Replay Mode, Project, Quick Export, Video / GIF Settings, Format, Interface, Hotkeys, Radial Menu), "Settings", "Saved Presets", the ComfyUI and Output folder heads |
| `.subhd` | Mask, Collision, Capture & Preview, Paint feel, Lanes, In the room, Top bar / Sidebar (Visible sections), Add a color, Recent, + New palette, Multigrid |
| `.lbl` | `.brush-section-label` used as a field label (Left / Right / Middle Click, Splat In / Out, Replay Period). "Path Layers" shares its row with "+ New Path" |

**Accept:**
- theme-lint at 1920, 1440 and 1366, plus the E1 states pass:
  - `label-style` flagged: 0
  - `off-theme-font`: 0 (the material select is exempt)
  - `native-control` colour inputs: 0
  - `off-palette`: 0
  - `wrapped-pane`: only the Q3 list
- A contact sheet of each family at rest, hover, focus, disabled, lit and remote-tinted, beside the study crop at the same zoom.
- A forced-colours shot: lit states show as Highlight outlines and the atoms are hidden.
- The button audit passes.

## WS-B: Left sidebar and the core right drawers

**Files:** `css/42-theme-drawers-core.css` (new) only.

| # | Item | From | P |
|---|---|---|---|
| B1 | **Layers.** No inner boxes (layer item, `.layer-group`, path item). Drop zones show only while dragging. A bead row per layer | g1 L3 L4 L14 L21 | P1 |
| B2 | **Layers fit.** Toolbar wraps, shapes in 2 columns, path actions fit, the path header stops squeezing the name to "P.", 6 px action gaps | g1 L1 L19 L22 L25 L26 | P1 |
| B3 | **Brush.** Shape actions on one line, tip glyphs drawn in CSS, preset chips on a grid (cells ≥ 64 px), Pressure sub-modes 2 x 2, Tip fold head | g4 B1 B2 B4 B6 B7 | P1 |
| B4 | **Stroke and replay.** Lock rows with a 72 px keycap column and the listen type, Replay Period field, Alternate-brush panel, mirror bank, roles notice, inline margins | g4 R1 R5-R9 | P1 |
| B5 | **Mutate.** Riveted cards, brackets on the picked card, thumb frame and tag. The diff as a VFD screen with feed rows. Mutate at full width, then row3. Field rows with the label above, lock bank as row2, crumbs | g1 M1 M3 M5-M12 | P1 |
| B6 | **Colors (in the drawer).** The palette field as the study field (pure-CSS states that survive rebuilds), the swatch row at 32 px with "+", Export / Import panes, key hint | g1 K1 K5-K8 | P1 |
| B7 | **Layers controls.** Inline slider rows become a head plus a full-width tube. Compact fields with the label above, collapsed padding, Collision head line, Inv / Invert panes (never the whole row), path preview as a screen | g1 L6 L13 L15-L17 L27 | P2 |
| B8 | **NEW Palette from image** (`#paletteExtractHost > .pfi`, js/65). No spec looked at it: inventory it, then give it the kit's parts | ui-map §7 | P2 |
| B9 | **Left head.** One column inset with the drawers, one tube tier, a bead row and depth under the sticky head, rhythm | g4 H2 H5-H7 | P2 |
| B10 | **Simulation.** Multigrid sub-heading. Sub-fold CSS for the Tip fold, layer collapse and Multigrid, on E6's mechanism | g4 M1 M2 B5, g1 L7 | P3 |

**Accept:**
- theme-lint at 1920, 1440 and 1366, default and states, on the left head, Brush, Stroke and replay, Simulation, Layers, Colors and Mutate: `clipped-text` 0, `wrapped-pane` 0, `inner-box` 0, `off-palette` 0.
- Shots beside the study's Brush, Input and Layers: layers filled, a path added, Mutate dealt and applied, alternate brush, Replay set to Time, presets seeded.
- Suites pass: palette-picker, palette-extract, stroke-lock, radial-menu, pointer-only, dialog-focus.

## WS-C: Expressive drawers

**Files:** `css/43-theme-drawers-expressive.css` (new) only.

| # | Item | From | P |
|---|---|---|---|
| C1 | **Kaleidoscope.** Mandala and Kaleido lose their card frames: the master toggle is a pane, and the body opens as a `.fil` section at full width. "(Z)" becomes a legend | g2 K1 K3 | P1 |
| C2 | **Effects.** Light Source and Light Shift unboxed, on the column. Both pads as CRT frames. Gravity pad as the round scope, with a VFD readout. Dither pad and ramp on screens, plus a row2. fx rows with 38 px thumbs. Rhythm | g2 E1-E5 E7 E9 E10 | P1 |
| C3 | **Audio.** Scene rows as a head plus a full tube. No boxed panels (scene box, mini, lanes, lane cards). Gates editor framed as a VFD screen. Enable row on one 32 px line. Cycle buttons as a label-above stack. Gate Clear as danger. Lane rows. Full-audio and transport panes | g2 AU1-AU3 AU5-AU9 AU12 | P1 |
| C4 | **Animations.** Length and source banks (A9). Empty slots as dim cards, no dashed boxes. Transport row, slot captions, library rows, keep row | g2 A1-A3 A6 A9 A11 A12 | P1 |
| C5 | **Text.** The selected line lit like a listbox option, not pink. Row actions: glyph pane, lamp, clear ring. Editor rows on one 32 px tier. Align bank, hotkey keycap row, row3 actions, font preview well, clear-all confirm | g2 T1 T2 T5 T6 T8 T9 T11 T13 | P1 |
| C6 | Save cues / Open cues as a row2, once the labels are back (Q5) | g2 AU10 | P2 |

**Accept:**
- theme-lint with the E1 states: Mandala and Kaleido on, Light Source and Light Shift on, Dither draw, Audio Tunnel / Minimized / Timing, recording, keep, a filled library, two text lines. Targets: `inner-box` 0 (the dashed slots are gone), `wrapped-pane` 0, `clipped-text` 0, `off-palette` 0 (the pink row is gone).
- Shots beside the study's Audio (lite 1002-1046), CRT (873-891) and scope (852-860).
- Suites pass: audio, dialog-focus, pointer-only, radial-menu.

## WS-D: System drawers and the overlay leftovers

**Files:** `css/44-theme-drawers-system.css` (new), `css/40-theme-overlays.css`, `js/75-theme-overlays.js`.

| # | Item | From | P |
|---|---|---|---|
| D1 | **Export.** Status line as a VFD screen, not blue. Progress in tube colours, height per Q9. Project and quick-export banks as a tightened row2. Background field with the label above. Cancel as danger. Spacing. Output folder (desktop) | g3 E1-E3 E7 E8 E11 E12 | P1 |
| D2 | **Settings.** Visible sections list unboxed (checkbox rows, group titles as sub-headings, copper scroller). Radial rows. Simple / Everything joined. Disclosure triggers as fields. Block buttons. Save / Load / Clear grid. Preset rows, bulk row, status and empty state. Hotkey rows, radial add row, ComfyUI, spacing | g3 G1-G18 | P1 |
| D3 | **Palette list and inline colour picker.** Listbox look, sizes multiplied by `--ui-scale` (never `zoom`), new-palette row. The picker unboxed, with `.tf` fields, panes and tube-framed tracks. The Collider source menu stacks above the layer rows | g1 K2-K4 K9 K10 L2 | P1 |
| D4 | **Display.** Background colour line, a two-line variant for long checkboxes, photosensitivity button fit, pen buttons, canvas-opacity head on two lines, pen screen radios, restart row, spacing | g3 D1 D3-D6 D8 D9 D12 | P2 |
| D5 | **Focus.** Formats as a 2 x 2 bank, no hover dim. Info as a VFD caption. Spacing | g3 F1 F2 F6 | P2 |
| D6 | **NEW Surfaces missing from W7's known list.** Confirm after the merge and finish the rest:<ul><li>P1: the Electron titlebar (every desktop session); `#recDrawer` (beige today)</li><li>P2: folded rails and fold tabs; remote-cursor name tags; canvas badges (rec count, export clock, zoom badge and frame, size readout, capture area); take prompt; text-arrange bar; layer transform overlay; `.fx-tip` cards</li><li>P3: hotkey bind bar, wheel and toast; PhotoSafe-off modal (leave `#photoWarn` alone); phone dialog; model download modals; preset fork and path toast; Debug info; focus-mode hint; eyedropper loupe</li></ul> | g2 AU11, `ui-map.md` §7 | P1-P3 |

**Accept:**
- theme-lint on Focus, Display, Export and Settings, with states: exporting (a DOM poke, as g3 did), Settings lists open, two preset rows. Targets: `wrapped-pane` 0 apart from the Q3 list, `inner-box` 0, `off-theme-font` 0, `off-palette` 0 (the blue and green are gone).
- A 1920 contact sheet with every D3 and D6 surface open, beside the drawer component it borrows.
- Suites pass: dialog-focus, popup-focus, skip-menu, radial-menu, palette-picker.

## WS-E: Scripts, motion, states and the checker

**Files:**
- `js/71-theme-motion.js`
- `js/76-theme-kit.js` (new)
- `scripts/test/theme-lint/`
- `index.html` (the H8 class only)
- app-JS hook hunks after Q4-Q6: js/20, js/30, js/40, js/68, js/05k, js/24, js/21

| # | Item | From | P |
|---|---|---|---|
| E1 | **NEW theme-lint first** (every workstream's gate):<ul><li>Add 1366 to the default widths.</li><li>A `--states` pass that opens sub-panels through real clicks and `change` events (the lists in C, D, B).</li><li>New checks `focus-ring` (Tab through each tray: 2 px or more, not cut by an overflow or clip-path ancestor) and `disabled` (unlit, no glow).</li><li>`off-palette` skips `[data-idle-glow]`.</li></ul> | this critique | P1 |
| E2 | **js/76.** One MutationObserver per rebuilt host re-registers `ThemeMotion.pane`: palette carousel, layers, paths, mutate grid, text list, animation library, preset list, lane hosts. It also writes `--sc` on colour inputs (input / change) and on chips (on mutation). Nothing per frame | g1 Q8 K5 L18, g3 Q7 | P1 |
| E3 | **NEW PhotoSafe.** With `body.photosafe-on`, no cathode strike flicker and no Ignite neighbour flicker, as under reduced motion | this critique | P1 |
| E4 | **Canvas colours.** The gates editor, lanes editor and dither pad / ramp read `--vfd`, `--cu`, `--cu-hi` once, at init and on resize | g2 H5 AU2 E9 | P2 |
| E5 | **NEW Listening keycap breathes** (rule 1163) through `ThemeMotion.run`, only while `.is-listening`. Still under reduced motion | rule 1163 | P2 |
| E6 | **Sub-fold glide** for the Tip fold, layer rows, Multigrid and feature bodies, on W1's mechanism. The shut body is inert at rest | g1 L7, g4 B5 M2 | P3 |
| E7 | **App-JS hooks**, after Q4-Q6:<ul><li>H1 cue labels</li><li>names and states: H2, H3, H6, g4 Q6, g1 Q2 Q3 Q5, g3 Q5</li><li>H4 library head arrow</li><li>H6 Text classes</li><li>H7 emoji</li><li>`brush-alt-note` (g4 X6)</li><li>H8</li></ul> | g2 H1-H8 | P2 |
| E8 | **NEW Idle easter egg** after W1's fronts. Text colour only, on the right-sidebar titles only, no box, lamp and rosette untouched, eases back on the first input, never under reduced motion. For the still, set `[data-idle-glow]`; for the ease, do one real 120 s idle | 00-shared standing note | P2 |
| E9 | **NEW Remote-change sweep** (rules 1186-1196) with `prep/baseline/scripts/sync-log.js`: one change per component family in each synced drawer, frames at fixed delays. Check:<ul><li>the tint fades over 1.4 s</li><li>the chip is not clipped by scroll or zoom</li><li>the left sidebar never tints</li><li>an open listbox or palette list stays open, and focus stays put</li><li>a change in a closed drawer lights its lamp and spins its atom</li><li>a collapsed layer stays shut</li></ul>Gaps go to WS-A | rules 1186-1196 | P2 |

**Accept:**
- `theme-lint --check` passes against a fresh baseline that includes the new checks.
- theme-fields and the bundle pass.
- With PhotoSafe on, a 10-frame sequence of a pane turning on has no flicker frame.
- Perf traces of one sub-fold toggle and of the E2 observers: no forced layout, and no new rAF while idle.

---

## Dropped: a W brief covers it (verify after merge only)

| Brief | Covers |
|---|---|
| W1 | Drawer fronts, closed-drawer lamp, tray, rosette flywheel, drawer glide, telegraph lever |
| W2 | Every range tube: zero state, brightness, ticks, disabled, head rows |
| W3 | Native selects and the listbox motion, checkbox and radio panes, master toggles, keycap face |
| W4 | Multi-brush tiles and arm editor, the Brush stamp screen |
| W5 | Room drawer, change log, chips, peer tints |
| W6 | Top bar, the compact strip, the 1201-1366 band |
| W7 | The surfaces its brief lists: modals, menus, floating panels, skip menu, F1 sheet, radial menu, colour popover, mask editor, toasts, underbar, demo clock |

## Questions only Gabriel can answer

1. Sidebar values: engraved cream, as in the study, or lit orange, as W2's brief says?
2. While recording: keep the solid pulsing red plate, or use the study's danger pane at full brightness?
3. Some labels fit no tier ("■ Stop and save", "Show canvas border & handles", the photosensitivity checkbox). Is a two-line pane OK? They never get an ellipsis.
4. Drop the emoji in labels: ✨ Auto, ⬆️ Full audio, 👁 / 🙈, ⏸ ⏮ 🔁, Leaving ⤴, 📂?
5. Save cues / Open cues have been blank since 5db4c76. Restore the labels?
6. May this pass add accessibility-only attributes in app JS? That means aria-label on glyph buttons, aria-pressed on toggles, `for` on labels, and a focusable layer disclosure: about 15 small hunks, no behaviour change.
7. Key legends (F, H, C...): keep the 17 px chip with a scaled ring, or grow them to the study's 48 x 32 keycap (rows grow)?
8. Tier map: 48 px for Stroke / Time, Simple / Everything and standalone fields; 32 px everywhere else, fields inside layer rows included; head tubes 38 px. OK?
9. Export progress: the study's 14 px tube (the drawer shifts while exporting), or a 4 px bar in tube colours?
10. Number fields: keep the native spin buttons (tinted), or hide them?
11. Display drawer: dividers between groups only, or add headings (new copy)?
12. Multi-brush and stamp screens:
    - The study keeps brushes beyond the count dimmed and editable; W4's brief removes their tiles. Which?
    - Should arrow keys move through the Brush stamp screen as a grid (rule 1170)?
13. The study shows more of other players than the app does: gate lids in their colour, a gravity trail, QUEUED / AFTER YOU. Wanted (new behaviour), or out of scope?
14. The right sidebar's resize edge does nothing in any theme (pre-existing). Fix it, or drop its resize cursor?
15. Desktop-only rows can't be checked headless: Output folder, ComfyUI, Open presets folder, the titlebar, transparent restart. Will you check them in your Electron build?
