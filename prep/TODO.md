# Walnut & Copper: todo (2026-10-17, handed off from the stopped fix runs)

Three fix runs were stopped part-way. Each task below is self-contained, so a cheaper model can take one in a fresh session. Read `prep/HANDOFF.md` (known issues, rules) and `prep/DECISIONS.md` first. Rules in short:
- Presentation only: behaviour, values, keyboard, pointer mapping, sync and persistence are frozen.
- Accessibility only goes up: text at 4.5:1, focus rings at 3:1, forced colours usable.
- No new animation loops and no layout reads in the frame.

Do one task at a time, commit on `walnut-copper` (or merge the named branch into it), and don't push. Headless checks use `scripts/test/radial-menu/driver.js`. Never attach to port 9333 or to Gabriel's running app.

## 1. Sliders: verify five committed fixes, finish three items

**State:** committed on `walnut-copper`, unverified:

| Commit | Fixes |
|---|---|
| `4b289f9` | Keep the app's hit area and native mapping |
| `fb80253` | Coarse pointers keep the 28 px thumb |
| `6e1059d` | No glow at exactly 0 |
| `e5479a8` | Head-row rules leave the top bar's strip alone |
| `309a808` | Brush ghost's head stays a checkbox pane |

**Verify:**
- **Press and drag.** Every visible sidebar slider, including the outer 8 px at both ends, gives the same values, focus and drag-follow as on `c5fabe1`. Extract it with `git archive c5fabe1 | tar -x -C <dir>` and run the same probe. Check Brush size, the Multi-brush count and Brush ghost opacity in particular.
- **Zero state.** At 0 and max, the head and both diamonds sit on the glass, not off it.
- **Small window.** At 760 x 900 the dial readouts are centred.
- **Tests.** Run `node scripts/test/theme-tubes/run.js`, `node scripts/test/slider-keys/run.js` and `node scripts/test/radial-menu/run.js`.

**Still to do** (css/36-theme-tubes.css):
- **Disabled rows** read disabled in forced colours (use GrayText). Today css/36 overrides js/20's 0.4 opacity and dims only by colour.
- **Long labels on one line.** "Pressure Dissipation" (1920 and 1440) and "Pressure Iteration" (1440) wrap. Fit them without shrinking the type: reserve less room for the value, or tighten tracking a little.
- **theme-tubes check.** It misses one case (Hold symmetry at 1440 DPR 2, mid value: one diamond 2.3 px off the thumb centre). Fix the cause, not the test.

## 2. Drawers: verify and merge branch `worktree-wf_7910abb8-a56-1`

**State:** seven commits on that branch (worktree `.claude/worktrees/wf_7910abb8-a56-1`), based on walnut-copper `750d39e`. Not verified or merged:

| Commit | Fixes |
|---|---|
| `25c0f6e` | Group stamps land before the first paint (the open Brush drawer re-flowed after boot) |
| `d28cf31` | A drawer opened from code lands at once (paste and file drop didn't reveal the new layer row with Simulation open above Layers) |
| `4907cae` | Hidden canonical inputs spin their visible dial hub (Density) |
| `295f8b2` | The Swirl Together rosette turns again (`--rot`) |
| `2f08cfd` | Tray padding is the study's |
| `13c6271` | The Brush drawer's TIP heading reads as `.sect` |
| `e75ca26` | Boot probe script |

**Verify, against `c5fabe1`:**
- **Boot.** A per-frame rect probe from load shows no change in the left sidebar's tray heights after the first paint, at 1440 and 1920, over several runs.
- **Paste and file drop** reveal the new layer row as on base, with Simulation open above Layers (js/05k `revealLayerRow`).
- **Drawer toggling** works as on base: click, Shift-click, Enter, `openSidebarSection`, the accordion sweep with a scrolled column, rapid re-toggles. Also check focus when a drawer closes with focus inside it, and reduced motion.
- **Motion.** The Swirl Together rosette turns on a change, and the Density hub spins when `#densityDissipation` changes.
- **Tests.** Run `theme-fields`, `focus-keys`, `skip-menu` and `popup-focus`.

Then `git merge --no-ff worktree-wf_7910abb8-a56-1` into walnut-copper. It touches js/71, css/35 and one css/39 rule; expect no conflicts.

## 3. Top bar: finish the work in progress on branch `worktree-wf_4fdd1aad-03d-1`

**State:** one work-in-progress commit `8ad173e` (css/33 and js/70) on that branch, worktree `.claude/worktrees/wf_4fdd1aad-03d-1`, based on `750d39e`. Unverified, and possibly incomplete. Read its diff first.

**Findings it was fixing** (css/33-theme-topbar.css; compare with `9d0e700`):
1. **Contrast under the warm light.** The new warm pool on the bar's wood (css/33, about lines 655-668) lowers contrast under the dial and telegraph labels and values. Isolation's value is about 4.1:1 at 1440, and the Laminar telegraph's focus ring dropped too. Every bar label and value must reach 4.5:1 or better (measure glyph pixels against the element with transparent text, p10 not only median), and focus rings 3:1.
2. **Forced colours.**
   - Limit is drawn pressed in both states. Its `.active` means OFF; key its pressed state on `aria-pressed`.
   - Pressed panes keep the amber focus outline (about 1.8:1 on a light theme) and the copper shadows. Use a system colour for the outline, and set `box-shadow` and `text-shadow` to none.
   - The Material select in the compact window isn't reached by the forced-colours block.
   - Check light and dark palettes.
3. **Laminar / Blend face words** fall under 4.5:1 at rest after the crossfade change in js/70. Keep the crossfade and make the words legible.
4. **Unlit LIMIT** is about 4.3:1; bring it to 4.5:1.
5. **Clear** lost its danger tint (a specificity problem); restore the study's subtle tint.
6. **Lit panes** show a dark "well" blot. Shape it so only the glyphs are backed, with soft edges.
7. **Lever halo.** The telegraph lever's `drop-shadow(0 0 calc(var(--ga,0)*6px) var(--pc,#fff))` draws a white halo at rest and a permanent outline after a remote change. Use `color-mix(in srgb, var(--pc,#fff) calc(var(--ga,0)*100%), transparent)`.

**Leave as is:** the unscoped `#sidebar-left.collapsed { flex-basis: 32px }`, which restores the legacy rail, and the bar's study height. The extra height is flagged to Gabriel.

**Then:**
- **Tests.** Run `bar-keys`, `radial-menu` and `theme-fields`. Check that dial and telegraph drags match `9d0e700`.
- **Merge** the branch into walnut-copper. It touches css/33 and js/70; walnut-copper also changed css/33 since `750d39e` (sliders task 1, the head-row scope), so check for conflicts.

## After these three

The rest of the known issues are in `prep/HANDOFF.md`:
- Multi-brush round 3: the colour-drag performance fix comes first.
- Overlays fixes.
- Swirl Together items.
- An unverified pass on fields.

The second wave is in `prep/gaps/SECOND-WAVE.md`. Before any of it, re-baseline the screenshot, a11y, tab-order and theme-lint gates once Gabriel has spot-checked.
