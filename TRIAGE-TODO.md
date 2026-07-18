# Triage TODO — parked / lower-priority backlog (2026-07-18)

> Overflow from **[TASKS-FINAL.md](TASKS-FINAL.md)** — items Gabriel set aside
> during the 2026-07-18 triage. Not dropped; revisit and promote back to the
> kept list when a phase unblocks or priority shifts. Source docs (`TODO.md`,
> `UX-fixes.md`) stay authoritative for detail.
>
> Columns: **Size** (S/M/L/XL) · **Status** · **Prio** (fill when promoting).

**Deferred decisions (Gabriel, 2026-07-18):**
- **Q1 pen-tablet/pressure priority** — not important right now.
- **Q2 Krita-parity scope** — someday, but guard hard against scope creep.
- **Q5 layout customization** (reorder/favorites/workspaces) — triage for now.
- **Q6 de-band** — its slider lives in the **simulation UI area** when built.

---

## 0. Session follow-ups (de-band / shading)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| NEW-1 | **De-band taper** — shipped console-tunable (`config.DEBAND`, default-off, `11edeab`, not deployed). To finish: feel-test a value (~0.3–0.4), add a slider **in the simulation UI area** (Q6), refine the ~30% dimming at high values (energy-preserving / tighter edge gate). | M | feel | |
| NEW-2 | **Surface-shading softer height-field** — optional complementary ridge fix: blur `uShadeForm` more (05j:711) or gradient-gate `nStr`. Only if shading-on still reads too embossed. | S | feel | |

---

## 1. D4 — Collision on the unified system

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D4-1 | **Multiple simultaneous live bindings** (today: one live slot; one-shot colliders stack freely). | M | open | |
| D4-2 | **Animated/transforming masks keep collision live** (Mask objects have no transforms yet — depends on D5). | M | parked→D5 | |
| D4-3 | **Depth-collision + webcam flows become mask-source presets** (⤓ Mask covers depth today; webcam still creates collision layers directly). | M | open | |

---

## 2. D5 — Selections & transforms

> (Q2: Krita parity someday — build only what's needed, no scope creep.)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D5-1 | **Selection tools** — rectangle/ellipse/lasso + SAM-click ("magic wand"); a selection IS a temporary mask. | L | open | |
| D5-2 | **Raster content transforms** — move/scale/rotate selection or layer content (extend layer-transform). | L | open | |
| D5-3 | **Fill/gradient into selection**; clear/cut/copy within selection. | M | open | |

---

## 3. D1 — leftover

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D1-1 | **Wire Phase 1.5 features as brush properties** — wetness deposit, bristle count, pickup amount, pigment-mixing toggle (pairs with the kept P15 subset). | M | open | |

---

## 4. Phase 1.9 — Sim architecture closeout

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| SIM-M2b | **Wall-noise injection hunt** — colliders inject ~3–4× grid-scale velocity noise (both solvers; MG scales it per V-cycle) → "curl-0 miasma" accumulation. Bisect the injector + per-cycle MG wall injection. | L | open | |
| SIM-MWa | **M-watch (a):** `obstacleCompositeFrag` single bilinear tap when downsampling dye-res sources → edge shimmer at high dye:sim (fix: 2×2 tap / reuse D0.5 blur). | S | open | |
| SIM-MWb | **M-watch (b):** hfFloor wall apron narrowed vs design — some wall drag may return. | S | open | |
| SIM-MWc | **M-watch (c):** magnitude gates (cap/knee/floors) are UV-anisotropic on non-square canvases. | S | open | |
| SIM-MWd | **M-watch (d):** MacCormack noisy-transport revert is a binary threshold — watch for sharp/diffuse patch boundaries. (Same shader as NEW-1 de-band.) | S | open | |
| SIM-MWe | **M-watch (e):** pressure soft-valve knee (30000) is dead code in the new pressure scale — retire or recalibrate. | S | open | |

---

## 5. Phase 1.5 — Painterly (deferred remainder)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| P15-4 | **Fake-bristle splatting + dirty-brush pickup** — jittered sub-splats along tangent + sample dye under brush (readback-free). | M | open | |
| P15-6 | **Particle-trail dry-brush layer** — fp particle texture advected by velocity, drawn as trails; fibrous streaks grid dye can't make. | M | open | |
| P15-7 | **Experiments** — dye:sim ratio (4:1 → test 8:1 + lower sim res); fp16 linear-filter fallback for old Android. | S | open | |

---

## 6. Phase 2 — UI audit + componentization

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| S1-1 | **Stage 1 — strip per-channel audit** (8 faders incl. material-mode label hack + arm-colors trigger; Color/Actions/Presets channels). | M | open | |
| S1-2 | **Stage 1 — residual jank blips**: fader drag-start (40ms), audio-scene-cycle clicks (32ms). | S | open | |
| S1-3 | **Stage 1 — strip-wide**: tooltips, keyboard access, hit targets; polling-loop audit. | M | open | |
| S2-1 | **Stage 2 — sidebar per-section audit** (all 16 sections; several reshaped by Drawing Foundation). | L | open | |
| S2-2 | **Stage 2 — sidebar resize-handle** throttle/snap check. | S | open | |
| S3-1 | **Stage 3 — declarative section registry** (replace 800ms-splash DOM scavenging); persisted user layout. | L | open | |
| S3-2 | **Stage 3 — customization design** (Q5: reorder/favorites/workspaces — triaged for now). | M | design | |
| S3-3 | **Stage 3 — retire legacy hidden `.controls` markup**; one documented layout system. | M | open | |
| S4-1 | **Stage 4 — component set** (Slider/Toggle/Select/ColorSwatch/TextField/Buttons/SectionHeader/XYPad/Drawer/Modal) + tokens CSS; ParamRegistry-bound; a11y. Generalizes the UX-9.1 underbar. | XL | open | |
| S4-2 | **Stage 4 — migrate section-by-section**; kill inline styles; absorb programmatic-update pathways. | XL | open | |
| S5-1 | **Stage 5 — path-layers profiling** (may be reshaped by D2/D5 first). | S | open | |
| S5-2 | **Stage 5 — cross-feature stress matrix**; bar: every interaction ≤ 1 dropped frame with sim running. | M | open | |
| S5-3 | **Stage 5 — full regression** (sim + drawing foundation through the new UI). | M | open | |

---

## 7. Phase 1 closeout leftovers

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| CL-1 | **Regression pass** — settle-banding soak, freeze preservation, Gate overflow, collision feel (WALL_SLIP 0-vs-1), edge-absorb, recording/replay, video export, multiplayer, web+mobile defaults, preset taste-check. | M | open | |
| CL-2 | **Watch items** (act only if seen): MacCormack checkerboard dithering (→ soft-revert); 144Hz cadence confirm. | S | verify | |

---

## 8. Backlog

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| Q1 | **Pen-tablet / pressure priority** — deferred (not important now). | — | design | |
| Q2 | **Krita-parity v1 tool scope** — someday, no scope creep. | — | design | |
| BK-1 | **Capture Gabriel's running list of old UI issues**; triage into these boards. | S | open | |
