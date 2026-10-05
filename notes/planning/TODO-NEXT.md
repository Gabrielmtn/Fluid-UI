# Fluid-UI — Open Work (handoff)

Written 2026-08-17, right after PR #30 merged to `main` (`bc59dd9`). This file is **self-contained**: it assumes you know nothing about the previous sessions. Everything below is either not started or explicitly deferred.

---

## STATUS — 2026-08-17, later: items 1 and 4 DONE

Branch `layers-vertical-space`, cut from `origin/main` (`bc59dd9`), 3 commits. Not pushed.

| Commit | Item | Verified |
|---|---|---|
| `7733f7b` | **4** slice 1 — list height + idle drop zones | full rows visible 0.95 → 1.84 at 1080p, 0.95 → 1.43 at 900p, unchanged ≤860px tall; no viewport overflow |
| `663d301` | **4** slice 2 — rows default collapsed | 1.43 → 4.51 rows; active paint layer stays open; user's toggle survives re-render; first click expands |
| `3b57d02` | **1** — Density + Time perceptual remap | default seats at 36% of travel (was 92%); round trip byte-stable; wipe zone unreachable; no proxy leak into presets or the mirror |

**`main` was also deployed live** (`npm run deploy`) at the start of this session, so `fluid-ui-multiplayer.gabrielmtn.partykit.dev` now serves everything through `bc59dd9`. The three commits above are **not** in that deploy.

Two corrections to the plans below, both found by measuring:

- **Item 4's prescribed `calc(100vh - 430px)` is wrong under `zoom`.** `#sidebar-right` carries `zoom: var(--ui-scale)`, and inside a zoomed subtree `100vh` still resolves to the full viewport in *layout* px, which then renders `--ui-scale` times larger — it overshot the viewport bottom by 22px at scale 1.12. Shipped as `max(340px, calc((100vh - 480px) / var(--ui-scale, 1)))`.
- **Item 4's "one expanded row is 250–330px" is right, and the drop-zone chrome was 76px of the 340px cap** — so the usable 264px really was less than one row. Confirmed before changing anything.

Still open below: **items 2, 3, 5**, item 4 slice 3 (optional), and everything under *Smaller open items* / *Feel-tests*.

---

**App:** WebGL fluid-simulation painting app, "A Small Good Thing". Classic scripts (no modules) loaded in order from `index.html`; files share top-level lexical globals. `party/index.ts` is the PartyKit multiplayer relay.

---

## Ground rules that will bite you

1. **Multi-file changes must land as ONE commit.** A dev server serves the repo live, so a half-applied change is a broken app for anyone loading it.
2. **Param ids, numeric option values and localStorage keys are load-bearing.** They're the persistence format: `scanAppState` reads `el.value` by registry id, presets write it back. Renaming an id silently orphans saved data.
3. **`index.html` slider attrs and the `ParamRegistry` entry must change together.** `verifyDom` flags drift, and the two are consulted by different code paths — the DOM clamps against the attr, the loader clamps against the registry.
4. **Removing a `<select>` option means removing it from the registry list too.** `coerceSelect` only maps a value to the default when the list *rejects* it; leave it in the list and a stale value passes through, fails the DOM check, and preset apply **silently skips that select**.
5. **No CSS transitions on overlay elements** — they corrupt the WebGL canvas in the Electron build (see the comment near `css/styles.css:1516`).
6. **The multiplayer look-mirror re-applies a full snapshot to watchers as often as every 400ms.** Any UI state it touches gets rewritten constantly, and `setCheck` dispatches `change` unconditionally — so a checkbox handler with side effects on *other* controls fires on every mirror tick. This has caused real bugs three times.
7. **Never persist during a remote apply.** Guard with `if (!window.__mpApplyingRemote)` or a host's mirror overwrites the watcher's own saved settings.

## Verifying in the preview harness

The preview tab is usually backgrounded, which breaks things in specific ways. All of these cost real debugging time:

- **The deferred UI build never runs** while hidden. Shim rAF to a timer and re-fire `DOMContentLoaded` — but only if `#mixer-strip` doesn't already exist, or you build a second strip and every measurement is garbage.
- **The rAF chain and MessageChannel pumps die.** Drive frames by calling `update()` directly in a loop.
- **The FPS cap makes most `update()` calls early-return.** Set `window.fpsCap = 0` for frame-accurate tests.
- **The QualityGovernor disables post-FX under tight `update()` loops** (it thinks the machine is slow), so glow/shading silently stop. `QualityGovernor.setEnabled(false)` before measuring anything post-FX.
- **Screenshots fail on a hidden tab.** Use `gl.readPixels`; `preserveDrawingBuffer` is on.
- **Per-stroke carries are only cleared on frames where the pointer is up.** Synthetic tests that fire pointerup then immediately pointerdown see stale state. Insert idle `update()` frames between simulated strokes.
- Pick probe pixels that aren't already saturated at 255, or you'll measure nothing.

## GitHub

`gh` is not logged in. Get a token:
```bash
printf 'protocol=https\nhost=github.com\n\n' | git credential fill | grep ^password= | cut -d= -f2-
```
Export it as `GH_TOKEN`. It has only `gist`/`repo`/`workflow` scopes, so `gh pr edit` and `gh pr view --json commits` **fail** on org-scope GraphQL. Use `gh api -X PATCH repos/Gabrielmtn/Fluid-UI/pulls/<n> -F body=@file` instead.

Local `main` may be stale — `git fetch` before trusting any `main..HEAD` count.

---

## 1. Density and Time faders — perceptual remap  ✅ DONE (`3b57d02`)

Shipped as described below: hidden canonical + unregistered visible proxy, reflect one-way from the canonical via `input` + a 250ms poll, `__mpSettingsLocked` early-return on the proxy handler. Curve constants are on `config` (`DENSITY_FADER_*`, `TIME_FADER_*`); `refreshFaderCurves()` re-seats the thumbs after changing one.

Two things worth knowing that the plan didn't call out, both handled: the canonical had to stay **inside `.ch-fader`** (COS finds its host with `closest('.ch-fader')`) and had to be hidden by a *wrapper* rather than on the element itself, or the printed scale the slider updater wraps around it stays visible. And the reflect needs a tolerance test — inside the 1.0 detent many fader positions map to one canonical value, so an unconditional reflect yanks the thumb to the detent edge under the finger.

**Feel-test open:** the curve shape is a taste call. `DENSITY_FADER_TAU_MIN` 0.12s / `TAU_MAX` 60s and the detent at 86–92% of travel; Time's detent at 70–76%. All console-tunable.

<details><summary>Original plan (kept for reference)</summary>

### Density and Time faders — perceptual remap  (biggest single item)

The **deposition** side of low-Time muddiness is already fixed (dye now paces off the sim clock). This is the other half: the faders' *scales* are wrong.

**Density.** The slider is linear in the per-frame decay base `d`, but the sim applies `pow(d, dt*60)` — so the perceptual variable, dye half-life, is *hyperbolic* in `d`:

| d | 0.85 | 0.95 | 0.99 | 0.993 (default) | 0.999 |
|---|---|---|---|---|---|
| half-life | 71ms | 225ms | 1.15s | 1.6s | 11.5s |

The bottom 65% of travel spans 71→225ms — perceptually identical "vanishes instantly". Everything useful is in the top ~18%, and **all 8 built-in presets sit in the top ~7%**.

**Time.** Linear 0.01–3 gives the slow half only ~15% of travel.

**Approach (planned, not started):** keep `#densityDissipation` and `#timeScale` as hidden canonical elements — every persistence scan, preset apply, mirror `setVal`, oscillator write and undo path keeps working untouched — and mount a *visible proxy* slider (0–1, **not** registered in ParamRegistry) that maps through a perceptual curve and drives the hidden one via a dispatched `input`. Density maps to log-spaced half-life with a hold detent at exactly 1.0; Time maps log with a detent at 1×.

**Traps:** the persistence format *is* the DOM element's value, so the proxy must never be registry-registered and the hidden element's min/max/step must stay byte-identical. Reflect must run **from** the hidden slider (event + ~250ms poll — Ctrl+scroll and the COS oscillator write `el.value` with no event), never the reverse, or the mirror and the proxy fight. The proxy's input handler needs its own `__mpSettingsLocked` early-return.

Files: `js/20-mixer-layout.js` (`faderChannel`), `js/05h-slider-bindings.js`, `js/01a-param-registry.js` (numbers only, no id changes).

*(As shipped: `js/20-mixer-layout.js` + `js/04a-canvas-gl-config.js` only. `05h` needed no change — the canonical's own handlers do the work — and the registry was untouched, since no range changed.)*

</details>

## 2. Audio UI restructure

Gabriel: *"the full version is all out of proportion, the player is the first class citizen, but it's not even above the fold"* and *"drastically simplify the audio UX/UI so it works consistently."*

Currently ~800px of content in a ~330–380px drawer; engine internals and the composer own ~75% of it. Three commits planned:

1. **Player first.** Keep the transport at the top of the drawer and make it unconditional — add a visible "Load track…" button (today the only way to load one is an unlabelled enable-checkbox → hidden file input). Wrap the engine internals (Sensitivity, Beat Threshold, mappings, the 7-tile pattern grid) and the composer in collapsed-by-default sections using the existing `makeSection` idiom.
2. **Fix the visualizer.** The 160px canvas is almost certainly a dead 0×0 bitmap — `registerViz` sizes it once at startup while the panel is `display:none`. Move the mini-timeline's resize-on-draw idiom into `drawViz`, and cut it to ~64px. *Confirm live first:* check `audioReactViz.width === 0`.
3. **A2-class hygiene.** Audio keys aren't in `MP_PERF_LOCAL_KEYS`, so a painter with `audioMode='full'` **force-opens the watcher's studio drawer** and can re-fire their mic prompt. Add them, add a receiver-side skip, and gate the drawer-open on `userInitiated`.

Known dead things to clean while there: `mapBassToSplat` is never read; the auto-splat pattern doesn't persist (registry id `audioAutoSplatMode` points at an element that no longer exists); the composer ships two permanently-disabled "next increment" buttons.

Files: `js/20-mixer-layout.js` (~2935–3530), `js/22-audio-reactive.js`, `js/27-audio-composer.js`, `js/06-multiplayer.js`, `js/12-save-load.js`.

## 3. Recording Full view — information architecture

Gabriel: *"all out of proportion, the player is the first class citizen, but it's not even above the fold."*

The master timeline sits *below* three header rows, one of which is an unwrappable 11-button strip mixing transport with library ops **and a Multiplayer room join/leave button** (the same placement that caused an accidental-kick bug once already). Each layer card is ~200px of mostly settings chrome; at the fixed 38vh drawer height roughly 150px remain for cards at 1080p. Drawer height and Speed/Max are never persisted.

**Plan:** timeline + a compact transport row directly under the tab bar; library cluster and preset row collapsed behind a "Library ▸" disclosure; Multiplayer button out of the transport strip; cards compacted to ~85px with a "⋯" details toggle; drawer 38vh → 52vh with the dragged height persisted.

**Critical:** `recRenderUI` rebuilds cards via `innerHTML` and *all* interaction is event-delegated off class names and `data-action`/`data-id`. Renaming or dropping any of `layer-max`, `rec-color-mode`, `mask-control-btn` or the data attributes silently kills those controls. IDs must **move, not duplicate** — `_getRecBtns` caches by id.

"Saving the settings for a period of time" has no implementation; the actual settings-over-time engine is the Audio Composer one tab over, whose data model reserves `seg.inputs` for exactly this convergence. **Product call needed** before reserving space for it.

Files: `index.html:977–1043`, `js/03-recording.js`, `css/styles.css:991–1028`.

## 4. Layers panel vertical space  ✅ slices 1+2 DONE (`7733f7b`, `663d301`)

Slice 1 shipped with the corrected formula (see the status block at the top — the prescribed `calc(100vh - 430px)` overshoots under `zoom`). Slice 2 shipped as "default collapsed except the active paint layer" rather than "only-active-layer-expanded": the per-layer collapse feature, its ▲/▼ button and its CSS already existed, so only the default changed. Two latent bugs in that existing feature had to be fixed for the new default to work — the button glyph was rendered from `layer.collapsed` while the row's class came from the computed state, and the toggle did `!layer.collapsed` on a value that starts `undefined`, so the first click on a default-collapsed row would have re-collapsed it and read as a dead button.

**Slice 3 (true flex-fill of the sidebar) is still open and still optional** — at 1080p the list now shows 4.5 collapsed rows, so the pressure is off.

<details><summary>Original plan (kept for reference)</summary>

### Layers panel vertical space

*"when layers is open the layers is so small people can't see even one whole layer at once."*

Measured: the list is hard-capped at 340px (`css/init-responsive.css:449`, which shadows a dead 300px rule in `21-sidebar.css:1256`); ~104px of that is permanent chrome (add row + two always-visible 38px drop zones); one expanded row is 250–330px. So **less than one full layer fits**. The "fill the sidebar when open" rule at `21-sidebar.css:392` is a byte-identical duplicate of the base rule — the intent was never implemented.

**Slice 1 (CSS only, fixes it on desktop):** `max-height: max(340px, calc(100vh - 430px))`; make the drop zones 8px at idle and full size only while dragging; delete the dead rule. **Slice 2:** trim the fader-row margin, default non-active rows to collapsed. **Slice 3 (optional):** make the section genuinely flex-fill.

Must land in `init-responsive.css` — it loads last, so the same rule anywhere else silently loses. No height transitions (Electron rule).

</details>

## 5. Share-lock — let non-hosts lock settings

Gabriel: *"some people don't have lock buttons, we should offer a share lock checkbox which lets the non host have the option to lock."*

The guest capability is ~90% latent: `toggleSettingsLock()` has **no** client-side host gate (only the button's visibility withholds it), and the relay forwards `settings-lock` from any sender. What's missing: a host-controlled grant, locker identity in the banner (it hard-codes "locked by host"), arbitration when two people lock, release when the locker disconnects, and forgery hardening.

⚠️ **`settings-lock` is the one look-controlling message the Take Turns hardening never gated — any guest can already forge it against other guests today.**

Also latent: if a host leaves while settings are locked, every other guest keeps the locked banner with nobody mirroring, forever.

**This is the only item needing a relay change**, so it needs `npm run deploy` (which ships client + relay together). Design: unregistered `shareLockChk` checkbox (must **not** go in ParamRegistry or the 400ms mirror will rewrite it); relay persists the grant + `lockOwner`, host-only grant handler cloned from the room-lock idiom, first-wins arbitration, relay-authored release on disconnect, grant delivered to late joiners in the `connected` payload.

Files: `index.html:827`, `js/06-multiplayer.js` (~316, 481, 536, 1336, 1946), `party/index.ts` (~193, 251, 400, 418).

---

## Smaller open items

- **Hotkey surfacing needs a redesign** — tracked as **UX-10.1** in [TASKS-FINAL.md](TASKS-FINAL.md). The reminder bar and the dim pass are both gone (PRs #37/#38); the caps-at-rest layer is what remains, and desktop currently has no visible way into the F1 reference.

- **Wheel/pinch don't zoom.** Both resize the brush; canvas zoom is modal (`Z`) and its only toggle lives inside the Mandala Studio panel. Left as-is deliberately — every free modifier over the canvas is taken (Shift = density, Ctrl+Shift = motion isolation), so rebinding needs somewhere to put brush size. Gabriel's call.
- **`BRUSH_SPACING` 0.35 is calibrated for a far smaller tip** than the ~210px default brush, so unramped small movements are sparse. Lowering it makes strokes ~7× denser and darker unless flow is normalised by spacing — and it's per-user persisted *and* preset-carried, so a default change won't reach existing users anyway.
- **Mandala: with Fill off and "Paint Only In Wedge" on (both defaults), only the ~30° wedge accepts paint.** Measured: dye lands at 15°, nothing at 45° or 75°. Working as designed, but 11/12 of the canvas silently ignoring a stroke reads as broken. Consider defaulting Fill to Fit, or making the wedge unmistakable. *(Testing trap: a sweep at 0/30/60° lands exactly on wedge boundaries every time and reads as total failure.)*
- **The kaleido slider literally labelled "Zoom"** (`kZoom`) is registry-backed with `mut` scope `basic`, so **Mutate randomizes it across a 4× range** and peers can change it via the look-mirror. Likely source of "the zoom keeps changing by itself". Renaming the label is free.
- **Painted colliders don't replicate to peers** — a peer's fluid flows through walls you drew.
- **Under Colour Gate, the stroke-in intensity ramp is local-only** (`__splatFlow` isn't captured in stroke events, recordings or the dab wire), so peers and replays see the un-eased stroke.
- **Dead code:** `replayMovements` (no call site), the collider `Mode` select (Block/Slow/Deflect — read by nothing), `#colorBar` CSS.
- **`window.__onZoomViewChange` is a single-slot callback** — a second consumer silently clobbers Mandala's guide redraw.

## Feel-tests waiting on Gabriel

All console-tunable; none are bugs, they're taste calls on things that shipped with a chosen default.

| Tunable | Default | What it does |
|---|---|---|
| `SYM_RAKE_SMOOTH` | 2.5 | Brush-diameters of travel the rake's bristle line takes to turn. Lower = more responsive, higher = steadier. |
| `CURL_EDGE_GATE` | on | Fades vorticity confinement at the canvas border. `false` restores the old edge feel. |
| `BRUSH_TIME_COMP` | 4 | Cap on the low-Time spacing compensation. |
| Collider film | 0.3 opacity, red | The on-canvas wall tint. |
| Audio defaults | bass-splat + kaleido on | Whether audio should animate the canvas at all out of the box. |
| Easing ranges | Ramp cap 2.0, "Over time" 350ms | The new stroke-easing controls. |

Also unverified against its symptom: `CURL_EDGE_GATE` is a *mechanism* fix — the border dye explosion could not be reproduced in the harness, and a good part of that incident was probably the pen-barrel replay latch that's now fixed.
