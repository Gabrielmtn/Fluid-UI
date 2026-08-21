# Guidance for the next sessions — building out the test framework

Written 2026-08-21 at the end of the session that built `scripts/test/`.
Audience: Claude (Opus 5) sessions doing the pre-open-source bug sweep and
the pre-demo cleanup with Gabriel. `README.md` describes the machinery;
this file is how to *operate* it and what to build next, in order.

---

## 1. What you have

A deterministic test rig that drives the REAL app over CDP:

- `window.__test` (from `harness.js`): frozen virtual clock (hand-pumped
  16.6ms frames), seeded RNG, dye/velocity float readback + FNV hashes,
  display-canvas hash + luminance, splat/pointer/keyboard input synthesis.
- Three drivers: `run-sweep.js` (per-param response curves with DEAD-ZONE /
  NON-MONOTONIC / DESTRUCTION flags), `run-regression.js` (goldens over
  `scenarios.json`), `run-inputs.js` (hotkey conformance from the inventory).
- Four inventories in `inventory/` — **treat these as ground truth before
  reading app code**: `params.json` (107 entries, with `gatedBy`
  prerequisites and 16 hazard notes), `hotkeys.json` (45 bindings with
  synthesis events + assertions, plus wheel and the pointer lifecycle),
  `features.json` (18 activation recipes with `touchesSharedState` — the
  integration-conflict surface), `determinism.json`.

Verified working: single-session bit-identity (same seed + frames → equal
dye AND velocity hashes, twice over). The sweep driver runs end-to-end and
its flags fire correctly.

## 2. The two mental models that matter

**Two instruments, never conflate them.** Sim hashes (dye/velocity
readback) are physics truth but are blind to the entire post-FX chain.
The display hash is look truth and the only instrument that sees
Ridges/Clarity/Glow/kaleido/shading. A regression that moves sim hashes
changed the physics; display-only movement means the look pipeline. The
sweep records both per level.

**Probe, don't guess.** Every hard bug this session fell to a purpose-built
probe, and every round of theorizing was wasted:
- *Fingerprint diff* (`results/fingerprint-expr.js`): dump sorted config +
  key globals + texture dims after setup on two boots, diff externally.
  Found STAMP_SHAPE / splat-ramps / multiArmColors drift in one shot.
- *Divergence probe* (`results/divergence-probe.js`): hash the dye at
  post-setup, post-stroke, and frames 1/5/10/…/60 on two boots; where the
  first ✗ appears localizes the bug class. Deposits-match-then-frame-1-
  diverges found the fpsCap phase skip in one shot.
Regenerate the divergence probe from the suite's live setup (see the
node snippet in the session transcript / rebuild it by extracting
`function setup()` from run-regression.js) whenever setup changes —
a probe with a stale setup proves nothing.

## 2b. THE RULE THAT MATTERS MOST — never persist

**A test or bake stage may write `config.*` and `window.*` freely, but must
never call an app setter that persists.** The app under test is Gabriel's
working instrument: its settings are his, and a stage that "resets" through
the UI path silently overwrites them for good.

This was learned the expensive way, on the same day the stage was written:

- `BrushShapes.setActive(null)` also writes settingsManager `brush.shapeId`
  (33:141). Using it to clear the stamp for a photo **erased his saved
  stamp selection**, permanently, every run. The fix is
  `config.BRUSH_SHAPE_ID = null` — `activeId()` reads config alone
  (33:52-55), so the stamp branch and the `stampPending()` dab-hold both
  switch off with nothing persisted. His selection was restored by hand.
- `lightShift.setPath()` persists unless `window.__mpApplyingRemote` is
  truthy (14:535-543). A shot set a one-point path over his **58-point
  authored path**; it survived only because the app was killed before the
  debounced save fired. Guard the whole shot with `__mpApplyingRemote`,
  stash the path, restore it inside the guard.
- Same trap, unverified but documented in the specs: `lightSource` UI
  paths (13:52-108, 284-294), `setBrushTip` (20:3112-3119), material mode
  via `localStorage 'fluidui.materialMode'` (29:320-325).

Before using any app setter from a stage, grep its body for
`settingsManager` / `localStorage` / `saveSettings`. If it writes, find the
config key it drives and write that instead.

Config-only is necessary but **not sufficient**: `33:295-305` reconciles by
reading config and calling `setActive()`, so a later list change writes the
stage's null into settings anyway. `__stage()` therefore stashes the real
value once per page and `__stageRestore()` puts it back — bakers call it in
their `done()` handler. Do the same for any future persisted key.

### And: `taskkill /F` LOSES recent settings

`settingsManager.set()` calls `localStorage.setItem` synchronously, but
Chromium flushes localStorage to its LevelDB store **asynchronously**. A
hard kill discards anything not yet flushed. Proved during the restore: a
write stamped `…769679` was simply gone on the next boot, and the value
present carried an OLDER timestamp `…052524` — a lost write, not an
overwrite. The restore only stuck after leaving the app running ~12s and
closing it gracefully via `@electron/remote getCurrentWindow().close()`.

So: **when a run changes anything persisted, close the app gracefully and
give it a beat.** Use `taskkill /F` only for runs that touched nothing.

**Wider implication worth chasing (hypothesis, not a finding):** the
unexplained 2026-07-19 preset-loss incident has exactly this shape —
presets live in the same localStorage, and a crash or hard kill would
discard recent writes while leaving older ones intact. If that is the
mechanism, an explicit flush-on-quit (or writing presets through a durable
path) would close a real user-facing data-loss risk before the demo.

## 3. Protocol (violations produced every false alarm this session)

1. **One suite run per fresh app boot.** The app AUTOSAVES settings; every
   boot inherits the previous session's residue. The suite pins registry
   defaults + known unregistered state, but the boot rule stands anyway.
2. **Never re-inject `harness.js` while frozen** — strands the frame loop;
   only an app restart recovers. Always `thaw()` in a finally.
3. **The app under test is an instrument.** Gabriel painting in it
   mid-suite shifts every hash (a fish did, once, memorably). For real
   campaigns, run against a dedicated instance/port, not his live window.
4. Sweeps at dye 1024 / sim 256; re-check any dead zone at 2048 before
   filing (kernels are 2048-reference-normalized).
5. Read `inventory/params.json` notes before sweeping an unfamiliar param
   — density-wipe threshold at <0.88, kaleido first-enable multiplier
   bootstrap, curl-slider material hijack, trusted-event snap, etc.

## 4. Determinism ledger (what setup must pin, each one measured)

pressure + wetness FBO wipe on clear · registry defaults via
`applyPresetSnapshot(ParamRegistry.defaults())` · `config.STAMP_SHAPE=0` ·
`splatInDist/OutDist` · `multiArmColors` (8 canonical entries) · colour
picker · canvas box 1280×720 · governor off · **fpsCap uncapped** (the cap
gate carries real-clock sub-frame phase into the freeze: first virtual
frame randomly skips per boot — found by the divergence probe) · colorGate
off · lightShift off · material fluid · layers/colliders stripped by id.

**Where determinism stands at session end (2026-08-21), precisely:**
- Single-run cross-boot: bit-identical through **frame 20**, after the
  full pin chain (each pin advanced the frontier: fpsCap phase skip →
  frame 1 matched; decay-debt nudge-reset → frames 1–40 matched; constant
  virtual epoch → mixed). Two DISTINCT residuals remain:
- **Residual A — run-ratcheting (frame-5 onset):** the double-tap probe
  (`results/doubletap-probe.js`: same freeze, sequence twice) shows run 2
  diverging from run 1 at frame 5 *within one boot*, despite clear() +
  4 settle frames. State derived from run 1's dye reaches run 2's sim.
  This coheres with open bug #2 (the Ridges display→sim coupling): a sim
  pass is reading a texture unit the display chain last bound. Decisive
  next experiment: enumerate/wipe the display-chain scratch FBOs
  (`sharpened`/`detailed`/`lit`, lexical in 05c — expose via a debug hook
  or patch) between runs and bisect which wipe makes run 2 match run 1.
  Fixing the app's stale binding fixes A and bug #2 together.
- **Residual B — cross-boot late drift (frame ~20–40 onset, quantized
  recurring variants):** present even between two first-runs-after-boot
  with the constant epoch. Suspect: REAL-clock timers (pumping 60 frames
  takes ~2–4 real seconds; a 1Hz real setInterval fires at phase-random
  pump indices). Decisive experiment: wrap setInterval/setTimeout at boot
  to log firings during a pump, or insert a deliberate 2s real-time stall
  mid-pump in one boot only and see whether divergence amplifies.
- **Pragmatic mitigation until A/B are fixed:** checkpoints at ≤20 frames
  post-stroke are already stable cross-boot — shortening scenario settle
  windows makes the suite green and useful for the refactor TODAY, at the
  cost of measuring less-settled fields. Gabriel's call.

## 5. Build-out order (each phase is independently valuable)

**P1 — close determinism.** Get the cross-boot record→compare green twice
in a row. Then commit `scripts/test/` + goldens. Everything else stands on
this.

**P2 — the sweep campaign.** `node scripts/test/run-sweep.js --all`
(54 sweepRelevant sliders; batch in ~10-param chunks per boot, respecting
`gatedBy` — activate prerequisites in a pre-step, the features inventory
has the recipes). Triage flags into: real dead zones (remap the slider's
useful range — Gabriel's original ask: "you only feel everything at higher
ranges"), destruction levels (clamp or fix), and response-curve notes.
Upgrade the DEAD-ZONE detector first if it over-fires: it keys on hash
equality; add a perceptual threshold (mean |Δlum| < ε) via `pixelmatch`
(devDependency) before trusting it at scale.

**P3 — destruction scenarios.** Purpose-built, not sweeps:
- Collision at 1.0: create a collider layer, write
  `layer.collisionStrength` 0→1 in steps + `collisionLayers.
  updateObstacleFromLayers()`, watch for NaN/coverage collapse. Suspect
  mechanism already documented in code: PRESSURE_SCALE sealed-pocket fp16
  blowup (04a:416-428).
- densityDissipation near the 0.88 wipe threshold (is the wipe intended
  UX at slider granularity?).
- Extreme-corner combos: max curl + max swirl + thick material; multigrid
  toggles mid-stroke; resolution select while painting.

**P4 — input conformance.** `run-inputs.js` over all 45 bindings; add the
wheel bindings (inventory has synthesis shapes). Known bug to fix first:
Shift+[ / Shift+] coarse brush is unreachable (05n matches `e.key==='['`
exactly; with Shift it's `'{'`). The inventory's sheet-mismatch notes list
undocumented bindings (Z, 0, Ctrl+Alt+Scroll, Ctrl+Enter ComfyUI post with
no typing guard) — decide document-or-guard for each with Gabriel.

**P5 — the feature-pair matrix.** The synthesis-bug killer, and the reason
`features.json` records `touchesSharedState`: generate pairs whose shared
state intersects (far fewer than 18×18), activate both via the recipes,
run the canonical stroke, assert invariants (no NaN, no console errors,
dye within luminance bounds, deactivation restores the baseline hash).
Ship as `run-pairs.js` reusing run-regression's action vocabulary. The
Colour Gate × Ridges coupling below is the proof this class pays.

**P6 — the open investigation: display→sim coupling.** Reproducible via
the sweep: toggling Ridges (display-only pass — sharpen never writes
density) BIT-CHANGES the dye field, kernel-scale-dependently; with the
gate on it's non-monotonic and returns bit-exact to baseline at ≥2.4.
Same family as the 2026-07 crisp-advection implicit-binding bug (a later
sim pass inheriting GL state). Method: binary-search the frame with
per-pass hash instrumentation, or diff GL state (active program, texture
units, viewport) entering the sim passes with the sharpen pass on vs off.

**P7 — browser build + CI.** `cdp.js` already speaks to headless Chromium:
serve the web build, `chrome --headless=new --remote-debugging-port=9333
<url>`, same drivers. Wire a GitHub Action after the repo goes public —
record goldens on the last pre-refactor commit FIRST; they are the
refactor's safety net and the whole point.

## 6. Standing bug ledger (found by this framework, unfixed)

| # | Finding | Where |
|---|---|---|
| 1 | Ridges 0–0.9 bit-dead (sub-texel kernel); felt range confirmed | 05j:1139 kernelScale |
| 2 | Display-chain→dye coupling on Ridges toggle (UNEXPLAINED) | P6 above |
| 3 | Shift+[ / ] coarse brush unreachable; F1 sheet advertises it | 05n:412 |
| 4 | Pigment memory survives clear → baseline drift | 05c/05i, wipe TBD |
| 5 | Collision-1.0 destruction unreproduced yet; fp16 suspect documented | 04a:416 |
| 6 | Ctrl+Enter ComfyUI post fires with no typing guard | comfyui-bridge.js:231 |

## 7. Working style that worked (keep it)

- Fix by evidence, one variable per cycle; a full record/compare boot
  cycle is ~7 minutes, a targeted probe is ~1 — prefer the probe.
- When a compare fails, FIRST ask "did the instrument or the app change?"
  — the fish taught that a correct failure looks identical to a bug.
- Everything the suite learns goes into three places: code comments at
  the pin/fix site, this file's ledger, and the `fluid-ui-test-harness`
  memory. Future sessions start from the memory; keep it current.
