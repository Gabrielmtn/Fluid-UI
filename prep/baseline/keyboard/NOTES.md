# Keyboard focus order (F4) — notes

The Tab order of the shipping UI, forward and backward, with every sidebar section open, plus what the skip menu (js/66-skip-menu.js) does on the first Tab and where each of its four picks lands. This is the "identical order" gate for the Walnut & Copper prep: a CSS step that hides a control, adds a focusable element, or changes an accessible name changes this capture. Written by `prep/baseline/scripts/tab-order.js`. Captured 2026-10-17 at HEAD `c4796da` with Chrome 155.0.8059.80 (headless), viewport 1584×805 CSS px, DPR 1, `--ui-scale` 1, Node v25.9.0.

## Files

| File | What |
|---|---|
| `tab-order.json` | The record: `env`, `sections` (17, with `ariaExpanded` after opening), `sectionOpenLog`, `scrollReset`, `slowdown` (governor button state before / after), `settle` (the canvas click), `firstTab` (after the click, then after Escape, with the menu's buttons), `forward` / `reverse` (`stops[]` + `end`), `wrap` (one Tab past the end, two Shift+Tabs past the beginning), `symmetry`, `picks` (the four skip-menu regions), `f0` (cross-check against `prep/baseline/dom/controls.json`), `problems`, `pageExceptions` |
| `tab-order.md` | Human copy: environment, counts per surface / role / section, the first-Tab behaviour, the picks table, the ends, the suites table, every forward stop (surface, section, js/66 region, element, selector, role, name, F0 index, `:focus-visible`), every reverse stop |
| `NOTES.md` | This file |
| `../scripts/tab-order.js` | The capture and its `--check` |
| `../../work/keyboard-check/` | Where `--check` writes its re-capture (`tab-order.json`, `tab-order.md`) and the run logs kept from this capture (`capture-run-*.log`, `check-run*.log`, `final-sequence.log`) |

## How to run

```bash
node prep/baseline/scripts/tab-order.js            # capture -> prep/baseline/keyboard/ (about 2.5 min)
node prep/baseline/scripts/tab-order.js --check    # re-capture into prep/work/keyboard-check/ and diff the order; exit 1 on any difference
```

No dev server, no Electron, no `npm install`, nothing on port 9333: one headless Chrome through `scripts/test/radial-menu/driver.js` (`boot()`: own static server on the repo root, scratch profile in the OS temp dir with PhotoSafe, the startup fork, the first-run hint and the Reset-app note already answered, trusted input over CDP, `Emulation.setFocusEmulationEnabled`), closed in a `finally`. `CHROME=` overrides the browser. `prep/baseline/dom/controls.json` (F0) is read for the informational cross-check only; the capture runs without it.

## What it does, in order

1. `boot({ seed: { 'swirlResetHint.v1': '1' } })`, waits for `document.getAnimations().length === 0` plus 300 ms, records the environment (`Browser.getVersion`, viewport, DPR, `--ui-scale`, fold state, `window.__scriptsReady`, whether `#skipMenu` is built).
2. Opens everything the way F0 does: the left bar if it is folded (not at 1600 px), then a trusted **Shift-click** on every collapsed `.section-title` so the accordion keeps them all open (17/17 opened by the trusted click; the synthetic fallback was never needed), verifies `aria-expanded="true"` on all, and scrolls both bars back to the top with `scroll-behavior: auto` around the write (css/21-sidebar.css:43 is `smooth`).
3. Reads the quality governor's slowdown button state (`#slowdownCell`, `QualityGovernor.getState().slowdown`): absent / none in every run.
4. One trusted click on the canvas centre (`#canvas`, `tabindex -1`): focus leaves the last Shift-clicked title and `document.activeElement` is `body`.
5. **First Tab, twice.** (a) Straight after the click: js/66's "where you were" sends it back to the control the click took focus from, the Settings title (`js/66-skip-menu.js:318-376`, `lastControl` + `stillThere`). (b) After Escape, which forgets that control and blurs (js/66:339-347): Tab opens the skip menu on "Left sidebar" (js/66:202 `open()`), with all four buttons enabled and none `aria-current`.
6. **Forward walk.** Tab (trusted `Input.dispatchKeyEvent`, `rawKeyDown` + `keyUp`, key/code `Tab`, vk 9) up to 800 times, reading `document.activeElement` after each: identity (kept page-side in `window.__to.seen` so revisits are recognised without touching the DOM), readable selector and strict `:nth-child` path, tag / type / id / classes (state classes stripped), role and name from `Accessibility.getPartialAXTree` on the live object (page-side fallback when the node is ignored: never needed, 225/225 from the tree), surface, section, js/66 region, `aria-*`, `:focus-visible`, rect, bar scroll positions, menu state. The walk ends when focus comes back to the first stop, leaves the page (`activeElement === body`), stays on one element for 3 Tabs, cycles, or hits the cap.
7. One more Tab past the end, read against js/66's rules (see "Past the ends").
8. **Reverse walk**: Shift+Tab the same way from the last forward stop (focus was already back on it, so no script `focus()` was needed), then two more Shift+Tabs past the beginning.
9. Symmetry: the reverse walk read backwards against the forward walk, by strict path.
10. **The four picks**: blur, Escape, Tab (menu opens), the region's arrow, Enter; records the option focused before Enter, where focus landed (selector, role, name, surface), whether the menu closed and whether the `.skip-landed` ring was set.
11. Cross-check against F0: every stop's index into `controls.json` (tag + id must agree), the rendered / enabled / `tabIndex >= 0` F0 controls never reached, stops not in F0.
12. Reads the slowdown button state again, collects page exceptions, writes the two files. A capture with problems still exits 0 (the problems are data, listed in `tab-order.md`); `--check` exits 1 only on a difference.

Nothing here calls an app setter that persists (GUIDANCE.md §2b): the only state changes are trusted clicks and keys on real controls inside the scratch profile, which the driver deletes on close.

## What a stop holds

`i` (position in the walk), `seenIndex` (element identity across the run), `selector` (nearest unique `#id`, then `tag.class.class:nth-of-type` segments; `selectorUnique` says whether it matches one element: all 225 do), `path` (strict `:nth-child` chain from the nearest unique-id ancestor; what `--check` and the symmetry test key on), `tag`, `type`, `id`, `classes`, `role`, `name`, `nameSource` (`cdp` / `fallback:*`), `surface` (F0's rule: `mixer-strip`, `sidebar-left`, `sidebar-right`, `main-area`, `overlay:<id>`), `section` (`.sidebar-section` title or `.mixer-channel` label), `region` (js/66: left / top / right / bottom / null), `tabIndexAttr`, `aria`, `text`, `f0Order`, `focusVisible`, `inViewport`, `rect`, `barScroll`, `menuOpen`, `menuOn`.

## What it found

- **Forward: 225 stops**, then the document (stop 225 is the marker). Order: the skip menu's four buttons (0–3) → top bar left to right (4–22: Material select, the seven faders, the Color channel's seven controls, Presets, Clear, Pause, Stop) → left bar (23–73: Brush Size, Stabilization, then Brush 22, Multi-Brush 13, Stroke and replay 14, each section's title first) → the left bar's fold button `button.lsb-toggle` in `#main-area` (74, no region) → right bar (75–221: Swirl Together 7, Simulation 14, Colors and palettes 7, Layers 12, Mutate shader 12, Effects 17, Animations 9, Audio 3, Kaleidoscope 3, Text 4, Focus 7, Display 15, Export 12, Settings 25) → the quality underbar (222–224: Image Sharpness, Motion Detail, Reset app).
- **Reverse: 225 stops**, the forward order read backwards exactly (first divergence: none).
- Per surface: skip menu 4, `mixer-strip` 19, `sidebar-left` 51, `main-area` 1, `sidebar-right` 147, `quality-underbar` 3. Per role: button 118, checkbox 36, slider 29, combobox 16, image 8 (the Effects preview thumbs, `role=img` with `tabindex=0`), radio 7, ColorWell 3, textbox 3, switch 2, spinbutton 2, link 1.
- `:focus-visible` was true at 225/225 stops (reported, not gated; F3 owns the a11y gate). Role and name came from the CDP accessibility tree at 225/225.
- **F0 cross-check:** 225/225 stops index `controls.json` with the same tag and id; 0 rendered, enabled, `tabIndex >= 0` F0 controls were never reached; 0 stops are missing from F0. With everything open, the page's whole resting Tab order is in this capture.
- **First Tab:** after the canvas click → back to the Settings title (js/66 "where you were"); after Escape → the skip menu opens on "Left sidebar", all four buttons enabled (`aria-disabled="false"`, `tabindex 0`), none `aria-current`, menu box at 12,12, 300×227.
- **Picks:** Left → `#brushSizePerceptual` (slider "Brush Size"); Top → `#materialMode` (combobox); Right → the Swirl Together section title (button "SWIRL TOGETHER"); Bottom → the Image Sharpness `button.qub-dd-btn`. Each closed the menu and set the `.skip-landed` ring on the region.
- **Past the ends** (headless Chrome; see Caveats): Tab from `#resetAppBtn` leaves the page (`body`); one more Tab goes back to `#resetAppBtn` (js/66 "where you were", js/66:374). Shift+Tab from the skip menu's Left button leaves the page; one more Shift+Tab goes back to `#materialMode` (the last non-menu control that had focus); one more goes into the skip menu on its Bottom button (the browser's own sequential navigation, since focus was on a control). The sequence never closes by Tab alone here.
- No page exceptions, no problems, in any run.

## Nondeterminism found and how it was pinned

| What could move | Cause | Pin |
|---|---|---|
| Nothing moved in six runs: capture ×3 (`capture-run-1/2/3.log`), `--check` ×2 (`check-run.log`, `check-run-final.log`), plus the mutated-baseline run; 225 + 225 stops with identical selector, path, tag, type, id, role, name, surface, section, region and menu state every time | — | — |
| The one-time Reset-app note (`#resetAppHint` + its "Got it" button, js/60-reset-app.js:363) ~4 s after a quiet boot, alive 30 s: a Tab stop or not depending on timing | F0's finding | Seeded `swirlResetHint.v1 = '1'` into the scratch profile, as F0 and F3 do |
| `#sidebar-right` scrolls smoothly (css/21-sidebar.css:43), so rects read mid-flight would drift | F0's finding | `scroll-behavior: auto` around the scroll reset, a 400 ms settle, verification that nothing is still scrolled (`scrollReset`). Rects are diagnostic anyway: `--check` does not compare `rect`, `inViewport` or `barScroll` (focus scrolls the bar it lands in) |
| `#fpsCap` options and value follow the refresh rate headless Chrome measures (144 vs 120 Hz, F0's finding) | js/05i-sim-stats.js:1231-1309 | Not in this gate: the stop's name is its label "FPS LIMIT"; values and option text are not recorded |
| State classes (`collapsed`, `active`, `open`, `skip-landed`, `ui-enter`, …) in a selector would depend on the moment it was read | the walk changes focus and ring state as it goes | Stripped from `selector` and `classes`; `path` uses `:nth-child` only, anchored on the nearest unique `#id` |
| `:focus-visible` is a UA heuristic | — | Reported per stop, excluded from `--check` |
| The quality governor's slowdown button (`#slowdownCell` > `#slowdownBtn` + Dismiss, js/08a-quality-governor.js:483-525) would be two underbar stops before Reset app if a paint slowdown or a rescue lit it | needs ≥ 500 ms of painting with a > 10 % fps drop twice, or four seconds under ~10–20 fps; the walk never paints | Not pinned (hiding it would hide a real stop): its state is recorded before and after the walk (`slowdown`, absent in every run) and a shown button is flagged as a problem, so a `--check` diff naming `#slowdownBtn` reads as a slow machine |
| `env` (date, URL port, Chrome build), `f0Order`, `text`, `aria` bags | vary by run or by F0's capture | Excluded from `--check`; the gate compares the projection in `project()`: every stop's selector, path, tag, type, id, role, name, surface, section, region, menuOpen in both directions, how each walk ended, the first-Tab behaviour (both cases, with the menu's disabled set and `aria-current`), the three past-the-end landings, the four picks, and each section's `aria-expanded` |

## Observed `--check` result

- `node prep/baseline/scripts/tab-order.js --check` against the previous attempt's baseline (run 2, 2026-10-17 08:17Z): `CHECK PASS: 225 forward and 225 reverse stops, the first-Tab behaviour, the ends and the 4 skip-menu picks identical to the baseline`, exit 0 (log `prep/work/keyboard-check/check-run.log`, 2026-10-17 12:47–12:50Z).
- The script then got two capture-neutral edits (the slowdown-button diagnostic, a null-safe `--check` projection for an aborted run) and the baseline was re-captured with it (run 3, 2026-10-17 12:52Z, `capture-run-3.log`): projected stops identical to all earlier runs.
- **Final:** `node prep/baseline/scripts/tab-order.js --check` against the shipped baseline (run 3) → `CHECK PASS: 225 forward and 225 reverse stops, the first-Tab behaviour, the ends and the 4 skip-menu picks identical to the baseline`, exit 0, 12:54:22–12:55:50Z (log `prep/work/keyboard-check/check-run-final.log`, re-capture in `prep/work/keyboard-check/tab-order.json`).
- **The gate bites:** with a copy of the baseline mutated (`#curl`'s role set to `spinbutton`, one reverse stop removed) swapped in, the same command reported `CHECK FAIL: 201 difference(s)` — `forward.stops[5].role: "spinbutton" -> "slider"`, `reverse.stops: length 225 -> 226`, then every shifted reverse stop — and exited 1 (`check-run-mutated.log`, `final-sequence.log`). The baseline file was restored byte-identical (`cmp`) afterwards.

## Caveats

- **Web build in headless Chrome, not Electron.** `#custom-titlebar` is in the DOM but hidden (`body.web-mode`), so its three controls are not stops here; Electron adds them at the front. More important: **Tab past the last control behaves differently per host.** Headless Chrome moved focus out of the page (`activeElement === body`), and the next Tab reached the page, where js/66 sent it back to the last control; in a browser tab that Tab goes to the browser toolbar and never reaches the page; the desktop app has no toolbar, and the skip-menu suite's own comment says it wraps straight round to the menu (`scripts/test/skip-menu/run.js:171-175`, S20c accepts either outcome). The wrap itself is therefore not in this baseline; the three past-the-end landings are, and they are gated.
- **This is the all-open order.** Every section was opened first (the brief's rule, so every control is reachable). A default profile has only Brush open, and a collapsed section's controls are out of the Tab order (css/21 folds the row to 0fr; js/66 `shown()` refuses them), so a user's resting order is much shorter. Section collapse state persists by title text (settingsManager), so the scratch profile's state is the app's default.
- **Viewport 1584×805 at DPR 1, `--ui-scale` 1** (the driver's 1600×900 window minus browser chrome). Above 1600 px wide the UI is zoomed; the order does not depend on it, the rects do.
- **Not walked:** the lazily built UIs (E radial menu, colour-picker popover, Presets panel, arm-tip menu, More panel, room menus, dialogs, the pen window). They are not in the resting Tab order; their focus behaviour is what `popup-focus`, `dialog-focus` and the radial-menu suite check, and F0 dumped their controls (`prep/baseline/dom/lazy-*.json`).
- **Names carry live values.** `#brushDabInterval` "INTERVAL 4 ms · 250/s", `#brushSteady` "STABILIZATION 0%", the two `button.qub-dd-btn` "IMAGE SHARPNESS 2048" / "MOTION DETAIL 1024" (`aria-labelledby` = caption + value, js/20-mixer-layout.js:2806-2809), "Visible sections 28 / 28 ▾", the palette chip "#2C5F2D", "Brush 1 tip: same as the brush". A default-value change fails the gate even though it is not a CSS change; read a name-only diff that way.
- **Selectors are readable, paths are the key.** `selector` is for a human (unique for all 225 stops in this capture, `*` marks one that is not); `--check` and the symmetry test compare `path` as well, so a reordered sibling shows up even when the readable selector still matches.
- **The reverse walk started where js/66 left focus** (`#resetAppBtn`, put back by the Tab past the end), so no script `focus()` was used; `reverse.startedBy` says so. If a later run has to use `focus()`, the record says that instead and the order is still comparable.
- The capture exits 0 with problems listed (data for this file); only `--check` exits 1, and only on a difference in the projection above. `tab-order.json` is ~440 KB with 1-space indentation; `tab-order.md` ~65 KB.

## Existing suites that complement it (run by F6, not here)

These check keyboard *behaviour*; this baseline checks *order*. F6 ran them once at HEAD `c4796da` (`prep/baseline/suites/suites.md`).

| Suite | What it checks | F6 result |
|---|---|---|
| `scripts/test/skip-menu/run.js` | js/66: first Tab opens the menu on Left; Tab / Shift+Tab / arrows / Home / End round its four places; Space and Enter pick (Space does not freeze); section titles take Tab, Enter and Space with `aria-expanded`; a folded section's controls are out of the Tab order; Shift+Tab from a control or text field opens it on that place, Esc goes back; hotkeys swallowed while it is up; Ctrl+Shift+Tab; where-you-were after painting; focus kept through fold and focus mode; Tab past the last control (S20c) | 43/43 |
| `scripts/test/focus-keys/run.js` | js/05n Space gate, js/20 `appConfirm`, js/26 LayerTransform: Space presses a keyboard-focused control and freezes after a mouse press; confirm / alert Enter and Space; the folded left rail hands focus to Brush Size | 20/20 |
| `scripts/test/bar-keys/run.js` | js/20 `makeQubDropdown`: the quality bar's resolution dropdowns as keyboard listboxes, no invisible Tab stops from the hidden native selects, focus rings | 13/13 |
| `scripts/test/dialog-focus/run.js` | js/00b DialogFocus: Reset app, confirm, the F1 sheet, palette delete and PhotoSafe take focus, trap Tab, close on Esc, return focus after a keyboard close; hotkeys do nothing behind them; the skip menu stays shut under them | 25/25 |
| `scripts/test/slider-keys/run.js` | js/67: arrow steps 1 % of travel, Shift 10 %, Home, focus kept, a dialog keeps the arrows | 12/12 |
| `scripts/test/popup-focus/run.js` | js/00b `popup()`: Presets, More, the colour popover and the room menus take focus from the keyboard, Esc returns to the trigger, Tab out closes, mouse-opened leaves focus alone | 5/9, exit 1 at HEAD (F6 open item 1) |

## Open questions

Reported for Gabriel, nothing changed (also in `prep/work/open-items/F4.md`).

1. **The wrap is host-dependent** (Caveats, first point). Should the Electron order be captured once as a second baseline (the titlebar's three controls, and whether Tab from Reset app really comes round to the skip menu), or does the headless order stay the gate with this noted? And is the `body` ⇄ last-control bounce that "where you were" produces in a toolbar-less host the intended reading of js/66 (behaviour, outside prep)?
2. **`button.lsb-toggle` (stop 74)** sits in `#main-area > div.lsb-edge` (js/20-mixer-layout.js:2403-2406), between the two sidebars and in none of the skip menu's regions. Informational for the mapping (it is neither bar's child); the reskin must keep it where it is in document order.
3. **The governor's slowdown button** is detected, not pinned. If a `--check` on a slow machine fails naming `#slowdownBtn`, is a re-run the answer, or should baselines seed the governor off (`governor.enabled`, a settingsManager key: a seed, not a setter, but it changes what the app does under test)?
4. **Live values in names** (Caveats): nothing for prep, unless defaults move during it, in which case re-capture and say so.
