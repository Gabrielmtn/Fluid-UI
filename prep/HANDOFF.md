# Walnut & Copper: handoff (2026-10-17, after the parallel parity pass)

Branch `walnut-copper`. Nothing is pushed, and `main` is untouched. Start each new session by reading this file, then `prep/DECISIONS.md` (Gabriel's calls), `prep/README.md` (study map, rules) and `design/walnut-copper-theme.md` (spec).

## What landed in this pass

Seven workstreams ran in parallel worktrees from briefs in `prep/briefs/` (shared rules in `00-shared.md`). Each branch had an adversarial three-lens review (behaviour, visual parity, accessibility) before it merged; most went back for fixes first.

| Area | What changed | Files |
|---|---|---|
| Drawers and motion | The study's procedural walnut fronts (parquet deleted, no pull bar); drawers glide open and closed on the drawer spring with the drawers below sliding along (no per-frame layout reads); atoms spin during drags and build momentum the longer you change things; each group in a drawer opens with its own bead row and atom; inner boxes and dashed borders gone; telegraph lever on a spring; Ignite flickers its neighbours | `css/35`, `js/71` |
| Sliders | Zero-state bug fixed (diamonds and head always on the glass); the study's 14 px glass; low values dark, full values bright; copper detent ticks on stepped sliders; label and value on one baseline | `css/36`, `js/72`, `scripts/test/theme-tubes/` |
| Fields and checkboxes | Every sidebar select is the study's 48 px field with the copper chevron and an eased inline list; every checkbox is a lit pane; radio banks; two-way choices as joined strips; text fields and keycaps; long words wrap, never cut | `css/37`, `js/69` |
| Multi-brush and stamps | The 8-tile brush screen (beyond-count tiles dimmed), editor for the chosen brush, "Custom brush" stamp screen, Brushes slider above the screen; Brush drawer stamps on the phosphor screen with arrow-key grid | `css/38`, `js/73`, small hook in `js/20` |
| Swirl Together | Three-line cathode change log with the study's motion (strike-in, step-down, dim, merge, dwell), your own changes in brief orange lines, nixie room code in the Invite popover, pilot lamp, panes that never cut a label | `css/39`, `js/74`, 3-line hook in `js/06e` |
| Top bar and small windows | The small-window overlap bug fixed (folded sidebars kept full width); compact strip laid out in the right sidebar; the bar's glass, dial faces and cluster closer to the study; every label at 4.5:1 or better; dial drag feel unchanged | `css/33`, face drawing in `js/70` |
| Overlays | Modals, F1 sheet, menus, floating panels, colour picker, radial menu, skip menu, mask editor frame, toasts and the underbar in the theme's components | `css/40`, `js/75` |
| Integration | Theme consistency checker (`scripts/test/theme-lint/`), every-drawer side by side (`prep/compare/sweep.js`), easter egg eases out over 1.6 s, underbar cells keep legacy widths, dial thumbs hidden | various |

## Spot-check list (things to look at first)

1. **Open and close drawers** on both sidebars, including Shift-click, and drag a slider inside one: watch the glide and the atom building speed.
2. **Multi-brush:** change the count (tiles power up and dim), pick tiles, change modes, pick custom brushes by mouse and by arrow keys.
3. **Every slider at 0 and at max**, in both sidebars and the top bar's Material slider.
4. **Open a few fields** (FPS limit, Pen window mirror, Symmetry) by mouse and keyboard.
5. **Swirl Together with a second device:** the change log, the Invite popover, Leave.
6. **A small Electron window** (under 1200 x 500 and under 768 wide): the bar in the right sidebar.
7. **The see-through window** (Transparent background on): overlays opening, drawers gliding. Not testable headless.
8. **Dialogs:** Reset app, the F1 sheet, the radial menu (E).

## Known issues (found by review, not yet fixed)

Most important first.

1. **Multi-brush, slow colour drag.** With the Multi-brush drawer open, dragging a brush colour slows frames sharply (an arm's colour well: about 180 long frames in 240). Cause and fix are known: stamp images ride an inherited custom property; put each mask on its `<i>` inline and cache the row's tip. (`js/73`, `css/38`)
2. **Multi-brush, the rest of round 3** (not started): Brush drawer and tip-menu stamps stay dim teal in high-contrast mode (`:is()` with `::after`, css/38 ~801); Space on a keyboard-focused, already chosen tile toggles Freeze; focus drops when the brush's own tip changes; captions cut short names ("TEST S…"); "Clipboard" read in capitals; the greyed "tip ignored" cue is gone; RANDOM overflows its pane when the sidebar's scrollbar shows.
3. **Fields, last round unverified by screenshot or gates:** the layer card's Clip / Inv, forced colours, red panes, disclosure motion. a11y and tab-order were not run on its final commits (expected changes: take lengths and Focus formats become radios; disclosure names lose the ▾).
4. **Overlays:** opening an overlay restyles all of it every frame for ~400 ms (about 1.7 ms a frame); pressing a pane that CSS lights (hovered menu rows, Apply Mask) briefly darkens it; close crosses turn black in high-contrast mode; css/40 restyles a few fields inside overlays that should take the fields' components (Audio drawer select, colour popover number fields, the mask editor's Show / Hide).
5. **Drawers:** a drawer that holds a dropdown (Simulation) does a tiny layout on each frame of its 14 px slide (about 0.3 ms, only while moving). Mixed heading styles remain in one tray (Brush "TIP", Mutate "Lock:").
6. **Swirl Together** (second review: all round-1 blockers fixed, nothing blocks; live region announces exactly as before). Still to fix: the screen flashes "Offline" for the length of the handshake on every Start a room / Join while the status says "Connecting…" (show Offline only after the room has been open once); the Invite popover's buttons now read in capitals to screen readers (use small caps, per DECISIONS); the welcome line is cut at both ends for Steam-length names; a name that lands after a line is up adds a second line for the same person; a peer's line leaves the screen 0.5 s before #mpActivity's text changes. Player names show in each player's paint colour, so a dark paint can be hard to read.
7. **Top bar:** unlit labels use #ab9480, 7% lighter than the study's #a08a76, to reach 4.5:1 on the glass (accessibility over the study's value).
8. **Sliders:** on Brush size and the Multi-brush count, the 8 px beside each end of the tube no longer takes a press (under review when this was written).
9. **Checker:** `theme-lint --check` reports 94 issues not in its pre-merge baseline. Most are second-wave items (labels beside non-slider controls are 9.5 px, slider labels 10.5 px; a few clean two-line labels) or false positives (label-for checkbox panes read as boxes). Re-baseline with `--update` once Gabriel has spot-checked.

## Gates

- `prep/baseline/scripts/bundle.js --check` on the merge (cc54f44): **all ten UI suites pass** (radial-menu 107, focus-keys 20, skip-menu 43, bar-keys 13, dialog-focus 25, slider-keys 12, popup-focus 17, stroke-lock 10, pen-window 53, look-links 24). The button audit finds every button clean with 0 legacy rules; its only mismatch is a count (264 -> 266 after the Presets popup), which is the Reset app tip's own "Got it" button appearing on its boot timer (js/60), not a styling change.
- `scripts/test/theme-fields/run.js`: 16/16. `scripts/test/theme-tubes/run.js`: 253/254; the miss is Hold symmetry at 1440 DPR 2 mid-value, one diamond 2.3 px off the thumb centre (check after the spot check).
- Boot: no console errors at 1920.
- Screenshot, a11y and tab-order baselines still show the pre-pass look and order; re-baseline them after the spot check, not before.
- The perf trace has not been run on the merge: it needs a quiet machine. The idle regression from before this pass (compositing the textured panels) is still open.

## Next: the second wave

`prep/gaps/SECOND-WAVE.md` holds about 200 gap rows merged into five parallel workstreams (component kit, core drawers, expressive drawers, system drawers and overlays, scripts and states), with acceptance checks. Its defaults for open questions are recorded in `prep/DECISIONS.md`. Re-check its rows against the merged branch first: many are now fixed. It also covers the sidebar width change Gabriel asked for (wider sidebars, no inner gutter).

## Still open from before

Console-glass WebGL pass; yin-yang glyph licence and THIRD-PARTY notice; the phone pad, the pen window's own document and Firefox range styling are not themed; the right sidebar's resize edge does nothing (pre-existing).

## Rules learned the hard way (unchanged, plus three)

- Never register or write `--i`; the theme's brightness is `--ci`.
- Inline `style=""` beats every layer; theme paint over script-styled elements needs `!important`.
- Button colour belongs only in `css/01`, `css/31`, `css/33`-`39` and `css/40`-`49` (js/38 sanctions them).
- The material select keeps the system font (js/29 measures it).
- No layout changes after boot.
- Screenshot gate: reduced motion, transitions off, `--disable-gpu-compositing`.
- Tests that hard-code coordinates break when the bar grows; measure right before use.
- **New:** Agent-tool worktrees created later in a session came up at main's commit, not the current branch; every brief checks HEAD and resets its own fresh branch.
- **New:** two suites use fixed debug ports (pen-window, look-links); parallel full gates share a lock at `%TEMP%/wc-gate.lock`.
- **New:** `text-transform: uppercase` changes accessible names in Chrome; `font-variant-caps: all-small-caps` at font-size / 0.7 looks the same and keeps the name's case.
