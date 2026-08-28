# scripts/test — the max-fidelity perf harness

Branch `perf-max-tiers`. Answers one question: **on this machine, how high
can the quality tier go before a frame stops fitting?** Not "is it slow" —
the point is to find the ceiling and settle just below it.

Companion to `run-regression.js` / `run-sweep.js`, and the inverse of them
by design. Those freeze the clock and pump frames so results are
bit-identical; a frozen frame has no duration, so this one runs the app
for real. They share `cdp.js` and nothing else.

| File | What it is |
|---|---|
| `perf-harness.js` | PAGE code → `window.__perf`: real-clock frame instrument, GPU timer queries, synthetic painter |
| `run-perf.js` | Node driver: walks the tier ladder, judges each, writes a report |
| `js/42-perf-tiers.js` | The ladder itself → `window.PerfTiers` (ships in the app, inert until called) |

## Protocol — three rules, each learned the hard way

**1. Run with vsync OFF.** Not a preference, a correctness requirement.

```bash
node_modules/electron/dist/electron.exe . --remote-debugging-port=9333 --disable-gpu-vsync --disable-frame-rate-limit
```

With vsync on, the GPU stalls acquiring a back buffer and that stall falls
*between* the timer query's own markers — no bracketing can lift it out.
Measured on a 143Hz panel: every tier from stock to the 8K probe reported a
7.0ms frame interval while their GPU times ranged 3.4–13.8ms, which cannot
be true of any of them. With vsync off the same ladder gives GPU time equal
to the frame interval at every rung — two independent instruments agreeing,
which is the only reason to believe either. Runs that trip the invariant are
reported `VSYNC` and their numbers discarded.

(`electron-main.js` deliberately dropped these flags in 2026-07-09 because
they pinned a 144Hz panel to a software 60Hz timer. That is the right call
for the *app*; it does not apply to a measurement run, where the frame loop
being uncapped is the whole point. Measured here: 4050fps at stock, so the
software-timer cap did not reproduce on this Electron build.)

**2. Exactly one instance.** Two Electron copies both rendering contend for
the GPU, and the numbers inflate silently — a run with a stray second
instance reported the 8K probe's storm workload at 109ms against 19.8ms for
the same config alone. Kill all, verify zero, launch one.

**3. Sweep on a scratch document.** Every tier change reallocates the raster
paint layers and mask coverage buffers at the new dye resolution and
bilinear-blits the old pixels across — see *Authored content is resampled*
below. The driver warns when any are open.

## What it measures, and why not fps

Under vsync, rAF hands out frames at the panel's rate no matter how much
headroom is left, so fps saturates and stops being an answer. A tier that
finishes in 3ms and one that finishes in 5.9ms both report "144fps" — right
up until the frame that doesn't fit. So the primary metric is **time per
frame**, on both sides of the CPU/GPU split:

- `cpuMs` — the JS half, from the app's own `__stats.lastCpuMs`. Command
  submission only. On this app it is usually the *small* half, so a CPU-only
  measurement will tell you a 4090 is bored when it is saturated.
- `gpuMs` — `EXT_disjoint_timer_query_webgl2`, real device nanoseconds.
  Bracketed by patching `requestAnimationFrame` so the begin marker sits
  immediately before the app's frame work rather than after the previous
  one — otherwise the bracket spans the present.
- `drainMs` — `gl.finish()` round-trip. **Not a work measurement**, kept only
  as a last resort and labelled so. Same machine, same tier, idle: vsync-on
  it reads 2.34ms, vsync-off 0.00ms, while the timer query says 0.19ms in
  both. It reports the wait for the next present, or nothing at all.

The headline is **`headroomFps` = 1000 / p95(cpu + gpu)**: the rate the
machine could sustain with vsync out of the way, off the 95th percentile so
one hitch does not flatter it.

Three workloads, because steady-state cost and cost-under-the-brush are
different questions: `idle` (warm canvas, no input), `paint` (a continuous
stroke, dispatched as real pointer events through the app's own input path),
`storm` (paint plus every post-FX stage on at once).

### Verdicts

| | meaning |
|---|---|
| **HOLDS** | `headroomFps` ≥ target, <1% of frames over budget |
| **TIGHT** | clears the bar but ≥1% of frames blow it — measures fine, paints badly |
| **MISSES** | `headroomFps` < target |
| **DRIFTED** | config changed mid-run; not a measurement of either state |
| **VSYNC** | the validity invariant failed; numbers discarded |

`DRIFTED` exists because the app autoloads the previous session's settings a
moment after boot, and that restore lands on top of an applied tier — a
`stock` row that reported 2048 on entry was measured at dye 8192, the value
the last session had saved. The driver now waits for `fluidui:scripts-ready`
(the same signal the autoload waits for) plus a quiet window before starting,
and every run is checked for drift on both ends regardless.

## The ladder

`window.PerfTiers` — inert until an explicit `apply()`. A tier is a *bundle*,
not a resolution number, because the axes buy different things:

- **dye resolution** — how fine the pigment is recorded. Quadratic in VRAM;
  runs out of memory first.
- **sim resolution** — how fine the motion is. Quadratic in fill for every
  projection pass, and the pressure solve runs many.
- **sim oversample** — how small the timestep is. The only axis that reduces
  numerical diffusion rather than sampling it more finely.
- **render scale** — supersamples the display pass, the one stage that runs
  per output pixel and therefore the only one that aliases.

Two threshold effects worth knowing:

- 05j gates the shaped multigrid V-cycle behind `PRESSURE_ITERATIONS >= 24`.
  Below that, `MG_CYCLES` / `MG_PRE` / `MG_POST` / `MG_COARSE` are read and
  discarded. At the shipped default of 17 they do nothing, so every tier from
  Cinematic up crosses 24 first.
- `SIM_SUBSTEP` and `SIM_OVERSAMPLE` multiply, and the gate re-engages exactly
  when a tier gets heavy — a positive feedback loop. Measured on a 30Hz panel:
  `overkill` asked for 4 steps and ran 12. A tier that sets the timestep
  explicitly now turns the gate off for the duration.

```js
PerfTiers.list()               // the ladder with VRAM estimates
PerfTiers.apply('cinematic')   // switch (disables the governor by default)
PerfTiers.describe()           // what is actually live right now
PerfTiers.reset()              // back to shipped defaults
```

## Measured: RTX 4090 / i9-13900K, 2560×1440 @143Hz, canvas 2134×1180

p95 CPU+GPU per frame, vsync off, single instance, 6s per workload.

| tier | dye / sim | over | ss | VRAM | idle | paint | storm | verdict @144 |
|---|---|---|---|---|---|---|---|---|
| stock | 2048 / 512 | ×1 | 1× | 95 MB | 0.48 ms | 0.60 ms | 0.70 ms | HOLDS |
| high | 2048 / 768 | ×1 | 1.25× | 101 MB | 0.75 ms | 0.69 ms | 0.78 ms | HOLDS |
| cinematic | 4096 / 1024 | ×2 | 1.5× | 376 MB | 3.34 ms | 3.68 ms | 4.72 ms | HOLDS |
| cinematicPlus | 4096 / 1536 | ×3 | 1.75× | 402 MB | 6.98 ms | 6.88 ms | 8.42 ms | MISSES |
| overkill | 6144 / 2048 | ×4 | 2× | 881 MB | 18.9 ms | 17.1 ms | 22.5 ms | MISSES |
| absurd | 8192 / 3072 | ×4 | 2× | 1581 MB | 32.3 ms | 31.5 ms | 40.6 ms | MISSES |

Reproduced across two independent clean runs within ~15%.

**Cinematic is the answer on this machine** — 212 fps in the worst workload,
47% clear of the 144 bar. Cinematic+ sits right on the line (119–145).

Two things the table says that the tiers do not:

- **Stock leaves roughly 10× on the table here.** 0.70ms against a 6.9ms
  budget. The shipped default is sized for the Steam hardware spread, not for
  this machine, which is the whole reason this branch exists.
- **The ladder is badly calibrated in the middle.** `high` costs 11% more
  than stock and buys almost nothing; `cinematic` then costs 6× `high`. The
  interesting tier — 4096 dye with a moderate oversample and supersample —
  falls in that gap and is not represented. Worth a recalibration pass, but
  the mix of dye vs oversample vs supersample is an aesthetic call, not a
  measurement one.

## Authored content is resampled by every resolution change

Found while sweeping, and it is a real bug independent of this branch.

Raster paint layers and mask coverage buffers are allocated at the dye
resolution, so changing a *performance* setting reallocates them and
bilinear-blits the old pixels across. Measured with a 2px-on/6px-off mask
pattern (the frequency a textured brush leaves):

| | fully solid | any coverage |
|---|---|---|
| baseline @2048 | 25% | 25% |
| after 2048→4096 | 25.6% | 38.1% |
| after →2048 | 25.7% | 50.5% |
| after →1024 | 25.7% | 75.2% |
| after →2048 | 25.7% | 75.2% |

Controls: the mask is stable over time with no resolution change, and a
single aligned 2:1 downscale is lossless. What it does not survive is a
*round trip* — the solid core holds while the soft apron widens on every
pass and never sharpens back.

For a mask driving a live collider that apron is precisely the leaky band:
partial-coverage texels sit in `solidity()`'s ramp, and per the
`COLLIDER_FLOW_KEEP` note in 04a they drain the dye passing through them. A
crisp wall becomes a canvas-wide dye-eating haze. This is what "changing
resolutions badly degrades collider layers" is.

The fix is to stop tying authored content to `DYE_RESOLUTION` — it is user
data, and a performance setting should not resample it. Checked and it looks
contained: the display shaders sample these with normalized UVs already, and
only the stamp viewports in 05i hardcode the dye dimensions. Not done on this
branch.

---

# Where the frame goes, and what is NOT the problem

Second pass (branch `perf-density`), aimed at the slowdown that shows up in
dense sessions. Tools added: `run-passprof.js` (per-pass GPU attribution),
`run-density.js` (cost vs canvas content), `gen-shader-inventory.js`.

## The breakdown at the top tiers

`overkill` (dye 6144, sim 2048, oversample ×4), idle, per frame:

| pass | ms | % | draws/frame |
|---|---|---|---|
| pressure | 3.79 | 49.6% | 904.8 |
| macCorrect | 0.73 | 9.5% | 3.9 (at 6144×3397) |
| advection | 0.57 | 7.4% | 7.8 |
| macAdvect | 0.37 | 4.8% | 3.9 (at 6144×3397) |
| mgRestrict / mgProlong / mgResidual | ~1.3 | ~17% | 109 each |
| display | 0.08 | 1.1% | 1 |

The pressure solve plus its multigrid scaffolding is **two thirds of the
frame**. The display pass — the stage everyone assumes is the problem, and
the one the 2026-07-22 render-cap experiment was built around — is 1%.

## Four things that are NOT the cause of density slowdown

Each measured, each a negative result, each worth not re-investigating:

1. **Dye on the canvas is free.** Cost is flat from 0% to 90% coverage:
   4.76 / 4.90 / 4.98 / 5.16 ms across the ramp, inside the noise floor.
   Every pass is a fixed-size draw; content does not change it.
2. **Velocity magnitude is free.** Same canvas painting (vel mean 0.42) vs
   idle (0.006) costs the same. This rules out the texture-cache locality
   story for semi-Lagrangian advection, which was the leading hypothesis.
3. **Arm count, brush size and symmetry are ~free** at the rates the
   synthetic painter reaches: 4.80 → 5.16 ms across arms 1→8, brush 4→60,
   and radial → mirrorQuad. Dab *rate* held constant at ~1015/s throughout,
   because the spacing walker is parameterised by distance travelled.
4. **The display pass is 1%.** Supersampling is not what costs.

Caveat on (3): the painter emits one pointermove per frame, so at 470fps it
covers little ground per frame and reaches only ~25% of `BRUSH_DAB_BUDGET`.
A real stroke on a 144Hz panel covers 3× the distance per frame. The dab
path is therefore **not cleared** — only shown to be flat over the range
this harness can currently drive.

## Two measurement traps found here

- **GPU clock ramp.** Six back-to-back profiles of an unchanging empty
  canvas drifted 2.795 → 2.225 ms (−20%) while fps climbed 125 → 140, as
  the card woke up. The first version of `run-density.js` sampled "active"
  straight after five seconds of painting (boosted) and "settled" after six
  seconds of near-idle (downclocked), and duly reported that painting made
  the frame *faster* and that an empty canvas cost 3× a full one. Every
  sample now runs uncapped for a fixed stretch first, and the first sample
  after a tier change is discarded outright.
- **The dye hash is not a signal for back-to-back A/B.** Two runs of the
  *identical* configuration give different dye hashes (258156d3 vs
  0cf81a76) while the velocity hash and dye mean match exactly — the
  residual README.md §"Three verdicts" documents. An A/B that reads the dye
  hash alone will report a behaviour change that is not there; it did.

## DYE_FOLLOWS_SUBSTEP (new, default on = unchanged)

Oversampling exists to give the *velocity* field a smaller dt. The dye is a
passive scalar riding it, and it is the expensive half — MacCormack's two
extra passes plus the main advection, all at dye resolution, all repeated
per substep. Setting `config.DYE_FOLLOWS_SUBSTEP = false` runs the velocity
chain every substep and transports dye once per frame over the frame's whole
dt.

Verified to do exactly that, by draw count at overkill:

| | macAdvect | macCorrect | advection | dye transport total |
|---|---|---|---|---|
| default | 3.9 draws / 0.38 ms | 3.9 / 0.73 ms | 7.8 / 0.66 ms | **1.77 ms** |
| decoupled | 0.97 / 0.09 ms | 0.97 / 0.19 ms | 4.88 / 0.17 ms | **0.45 ms** |

So it removes 1.3 ms of real work. Whether that lands as a net frame win is
another matter: `pressure` dominates at ~50% and swings ±0.8 ms run to run,
which is most of the saving. Frame-level A/B was inconclusive (−9% one way,
+6.7% the other — both inside noise). **Not look-tested.** Treat as a
measured option, not a recommendation.

## What to do next, in order

1. **The pressure solve is the whole game** — two thirds of the frame at
   high tiers. `MG_CYCLES 4→2` already measures **−22.8%** at overkill and
   trimming the V-cycle shape as well is **−26.2%**, config-only, no code.
   Whether 2 cycles converge acceptably is a look question, not a perf one.
2. `MG_COARSE 16→4` removes ~190 draws/frame for only −3.7%, so the solve is
   fill-bound at the *fine* levels, not draw-call bound as it first appeared.
   Optimising the coarse end is not worth it.
3. Drive the dab path harder than the synthetic painter can before calling
   it clear.
