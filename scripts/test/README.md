# scripts/test — the regression & sweep harness

The final quality layer before the open-source refactor and the demo:
deterministic, machine-checkable answers to "did the sim change", "does
this slider do anything", "does this combination break", and "do the
hotkeys work" — against the real app, no mocks, no machine vision.

Built 2026-08-21. The two bug classes it exists to catch, in Gabriel's
words: features misbehaving *in synthesis with others*, and the shader
*not reacting, or destroying completely* at certain settings.

## The pieces

| File | What it is |
|---|---|
| `harness.js` | PAGE code → `window.__test`: virtual clock, seeded RNG, sim+display instruments, canonical inputs |
| `cdp.js` | Node → app bridge (works on the Electron build and headless Chromium for the web build) |
| `run-sweep.js` | Parameter response curves: dead zones, non-monotonic response, destruction |
| `run-regression.js` | Golden-state suite over `scenarios.json` (`--record` / compare) |
| `run-inputs.js` | Hotkey conformance driven by `inventory/hotkeys.json` |
| `inventory/` | Machine-readable maps of the app, written by inventory agents from the sources: `params.json` (107 entries), `hotkeys.json` (45 bindings + wheel + pointer lifecycle), `features.json` (18 activation recipes), `determinism.json` (the determinism dossier) |
| `scenarios.json` | The regression scenarios — grow one per feature system |
| `goldens/` | Recorded reference hashes (commit these) |
| `results/` | Run reports (gitignore-able) |

## Quick start

```bash
node_modules/electron/dist/electron.exe . --remote-debugging-port=9333
```

then:

```bash
node scripts/test/run-regression.js --record   # once, on a known-good build
node scripts/test/run-regression.js            # after changes: exit 1 on a FAIL
node scripts/test/run-regression.js --strict   # ...and on a NEAR too
node scripts/test/run-regression.js --gl-errors  # + per-frame gl.getError()
node scripts/test/run-sweep.js --param ridges
node scripts/test/run-sweep.js --all           # every sweepRelevant slider
node scripts/test/run-inputs.js
```

For the browser build (the open usertest): serve it, open it in
`chrome --headless=new --remote-debugging-port=9333 <url>`, same
commands — `cdp.js` speaks to any Chromium.

## How determinism works

The frame loop is wall-clock (dt from `performance.now()`, self-scheduled
rAF — 05j). `__test.freeze()` stubs both and pumps frames by hand at
exactly 60fps-equivalent steps; `seed()` pins `Math.random`. Two runs of
the same recipe are then **bit-identical** (verified: dye and velocity
FNV hashes equal across back-to-back runs), so any hash change after a
code change is a real behavioural change.

Hidden persistent state the harness wipes on `clear()` — each of these
was MEASURED breaking run-to-run identity before it was added:

- **pressure** (solver warm-start survives `clearCanvas`)
- **wetness** (P15-1 field)

Known remaining offender: **pigment memory** (the Colour Gate's density
memory) survives clear and drifts baselines between sweeps — wipe TBD,
gate stays off under the shared policy meanwhile.

## Two instruments, on purpose

- **Sim hashes** (dye/velocity readback): physics truth. Blind to the
  entire post-FX chain — sharpen/micro-detail/glow/kaleido/shading write
  scratch FBOs and never touch density.
- **Display hash + luminance** (rendered canvas): look truth. This is
  the only instrument that can see look-only params (Ridges, Clarity,
  Glow...).

A regression that flips sim hashes changed the physics; one that flips
only the display hash changed the look pipeline. Both matter; the suite
reports them separately.

## Three verdicts, and why (2026-08-26)

Bit-identity was the only thing `run-regression.js` could say until
2026-08-26, and it made the gate unreadable: it had not been green once
since the goldens were recorded, and the two determinism residuals in
`GUIDANCE.md` §4 mean it will not be for a while. Measured across every
run in `results/`, three back-to-back runs in **one boot** produce a
different dye hash every time while their `coverage` and `meanLum` agree
to all five recorded decimals.

So a checkpoint now reports magnitude, not just difference:

| | meaning | exit |
|---|---|---|
| **PASS** | all three hashes identical to the golden | 0 |
| **NEAR** | a hash moved, every scalar inside tolerance — deltas printed | 0 |
| **FAIL** | a scalar left tolerance, NaNs appeared, or the page/GL errored | 1 |

Tolerances are named constants at the top of the driver with the
measurement they came from. Defaults: **±2% relative** (+0.001 absolute)
on `meanLum` and `coverage`. The highest same-code delta anywhere in
`results/` is 1.04%; the runs that carried real code change sit at
15–116%, two orders the other way. Override per run with
`--tol-lum-rel` / `--tol-cov-rel` (or `FLUID_TEST_TOL_*`), or make NEAR
fatal with `--strict`.

NEAR exits 0 on purpose — a permanently red gate is a gate nobody reads
— but it is never quiet: every NEAR prints its deltas and gets its own
summary banner.

## Invariants

`scenarios.json` also carries an `invariants` list: relations that must
hold **within** a run, so they need no goldens and are checked under
`--record` too. Each names two checkpoints and asserts `equal` or
`differ` per field (`dye` / `vel` / `display`); an `equal` whose hash
moved falls back to that field's scalars, so it can land NEAR.

Two shipped with the mechanism, both of them promoted from prose
comments that nothing had ever checked:

- **`kaleido-is-display-only`** — kaleido renders in the display chain,
  so its sim hashes must equal `plain-stroke`'s. Reports **NEAR**: the
  dye hash differs while coverage is identical to 5 decimals. That is
  standing bug #2 (display→sim coupling) with no measurable magnitude.
- **`freeze-halts-the-sim`** — reports **FAIL**, and the committed
  goldens already violate it. Not a lost keypress and not a bug: Space
  runs `toggleFreeze` (04b:170), which sets `DENSITY_DISSIPATION = 1.0`
  and `VELOCITY_DISSIPATION = 0.9` — dye stops *fading*, advection keeps
  running. `isPaused` (05j:237), on **Shift+Space**, is the gate that
  actually halts the step. Left failing until someone decides whether
  "Freeze" is meant to hold the picture still.

## GL errors

`gl.getError()` appeared nowhere in this repo until 2026-08-26 — and
both GL bugs the project has actually hit (6fd1be4's wrong-program
uniforms, the sub-stepping feedback loop) raised `INVALID_OPERATION`
into an empty room for months. `__test.glErrorCheck(true)` drains the
error queue after **every pumped frame**, tagging each with its frame
index and phase; `--gl-errors` turns it on for the whole suite and any
error is a FAIL. Default off, because `getError()` synchronizes the GPU
and would distort the sweep driver's timing.

## Protocol rules (each one was learned the hard way)

1. **Fresh app boot per session.** Baseline state drifts through
   material-stash and pigment-memory round-trips.
2. **Never re-inject `harness.js` while frozen.** A stranded frozen
   instance orphans the frame loop; the only recovery is an app restart.
   (`harness.js` stashes the real clock handles under `__testReal` so a
   thawed re-install is safe.)
3. **Pin the governor** before measuring (the shared scenario policy
   does): it rewrites effective pressure iterations, gates post-FX, and
   runs a boot resolution ascent.
4. **Resolution selects are destructive** (FBO realloc) — set them once
   per run, never mid-scenario.
5. Sweeps run at dye 1024 / sim 256 for readback speed. Kernel params
   are 2048-reference-normalized, so re-check any dead zone at 2048
   before filing it as a bug.
6. `densityDissipation` below 0.88 intentionally wipes the sim
   (05h) — sweeps of it must floor there.

## First findings (from the harness's own shake-down, 2026-08-21)

- **Ridges 0–0.9 is bit-dead** on the sim field and Gabriel's felt
  0–20% dead zone matches the sub-texel kernel range (kernelScale =
  RIDGES × dyeRes/2048 — sub-texel bilinear offsets nearly cancel).
- **A display-only pass changes the dye field.** Toggling Ridges on
  bit-changes dye even though the sharpen pass never writes density —
  some GL-state or feedback path couples the display chain back into
  the sim (same family as the 2026-07 crisp-advection implicit-binding
  bug). Kernel-scale dependent; with the Colour Gate on it is larger
  and non-monotonic, returning bit-exactly to baseline at RIDGES ≥ 2.4.
  **Unexplained — top candidate for the first real investigation.**
- **Shift+[ / Shift+] coarse brush is unreachable** — the handler
  matches `e.key === '['` exactly; with Shift held the key is `{`
  (05n:412). The F1 sheet advertises it.
- The params inventory carries per-entry `gatedBy` prerequisites and 16
  documented hazards (density-wipe threshold, kaleido first-enable
  multiplier bootstrap, curl-slider material hijack, trusted-event snap
  behaviour...) — read `inventory/params.json`'s notes before writing a
  sweep against an unfamiliar param.
- Collision strength has **no DOM id** — per-layer `[data-cs]` control;
  sweep it by writing `layer.collisionStrength` +
  `collisionLayers.updateObstacleFromLayers()`. The
  `PRESSURE_SCALE` comment (04a:416) documents a sealed-pocket fp16
  blowup — prime suspect for "collision at 1.0 destroys the sim";
  purpose-built scenario TBD.

## What's deliberately NOT here yet

- **Pixel-diff visual regression** (pixelmatch/odiff over saved PNGs):
  the display hash catches any change but can't say "how visible".
  Add `pixelmatch` as a devDependency when perceptual thresholds are
  needed — dead-zone detection currently keys on hash equality, which
  over-reports response (one pixel bit = "changed").
- **Feature-pair matrix** (`features.json` × itself, invariants checked
  per pair): the inventory has the activation recipes; the driver is a
  ~50-line loop over `run-regression`'s action vocabulary once the
  singles suite is green.
- **CI wiring**: everything is plain node + a debug port; a GitHub
  Action can boot the web build in headless Chromium and run the full
  suite on every PR after the repo goes public.
