# Tasks Final — consolidated open-work triage (2026-07-18)

> **Purpose:** one reviewable surface for **everything still open** across
> `TODO.md`, `UX-fixes.md`, and `UX-fixes-plan.md`. Done/parked items are
> summarized, not repeated. Source docs stay authoritative for deep detail —
> this is the triage board.
>
> **How to triage:** fill the **Prio** column per row — `P0` (now) · `P1` (soon)
> · `P2` (later) · `park` (blocked/deferred) · `drop`. Sizes: **S** ≤ half-day ·
> **M** ~1 day · **L** 2–4 days · **XL** multi-week / whole stage. Status:
> `open` · `parked` (waiting on a phase) · `design` (needs a decision) ·
> `feel` (Gabriel's eye is the verifier) · `verify` (may already be satisfied).

**State of the two UX docs:** the whole `UX-fixes.md` + `UX-fixes-plan.md`
execution queue has shipped (sections 1, 2.1/2.3, 3, 4, 5, 6.1, 7, 8, 10, 11,
12, 13, 14 — plus 13.7 closed by measurement 2026-07-18). Only 5 UX items
remain, all captured below. The large body of open work is the `TODO.md`
roadmap (Phase 1.75 Drawing Foundation, Phase 1.9 sim, Phase 1.5 painterly,
D7, Phase 2 UI audit).

---

## 0. Session follow-ups (new, 2026-07-18)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| NEW-1 | **De-band taper** — feel-test `config.DEBAND` (~0.3–0.4), then add a UI slider + choose a default; refine the ~30% dimming at high values (tighten the edge threshold / energy-preserving blend so it's more surgical). Shipped console-tunable, default-off (`11edeab`), **not deployed**. | M | feel | |
| NEW-2 | **Surface-shading softer height-field** (optional, complementary ridge fix) — blur `uShadeForm` more (05j:711) or gradient-gate `nStr` so relief follows broad forms, not every contour. Only if the shading-on look still reads too embossed after de-band. | S | feel | |

---

## 1. UX-fixes.md — remaining (5)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| UX-6.2 | **Ferrofluid aesthetic iteration** — first pass shipped (`ferrofield` scene, dye-transport attractor). Iterate the pattern set (hex/flower-of-life, recursive sub-attractors), beat modulation, feel. | L | feel | |
| UX-6.3 | **Mini audio composer editing** — mini timeline (27) is draw-only; add segment hit-test / drag-resize / overlap layout / playhead in the sidebar form factor. (Cheap early wins: playhead indicator + duration numeric input.) | L | open | |
| UX-6.4 | **Full audio-tab UX** — input sizing, onboarding/guidance, clearer segment layout. Mostly the final UI-pass's job. | L | open | |
| UX-9.1 | **Underbar component** — context-sensitive settings strip under the mixer. Overlaps Stage-4 component library; build once, not twice. Needs first-use-case decision (see Q-4). | M | parked→S4 | |
| UX-2.2 | **Path-layer multiplayer sync** — `applyPathSplat` never broadcasts; remote peers see nothing. Needs a wire-format bump. **Parked for D7** (Gabriel, 2026-07-17). | M | parked→D7 | |

---

## 2. Phase 1.75 Drawing Foundation — remaining

### D3 — Unified masking
| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D3-1 | **One mask editor** — consolidate mask-editor/15/16 onto the Mask object (15/16 still write `layer.mask.shapes`; ⤓ Mask import is today's bridge). | L | open | |
| D3-2 | **Mask-level feather/threshold ops** on the Mask object itself (invert exists per-consumer; feather/band only on the collider consumer today). | M | open | |
| D3-3 | **Clip masks for DOM image layers** (raster layers ✔; image layers still clip via 05m shapes). | M | open | |
| D3-4 | **Mask-film export gap** — the red mask film is in the GL canvas; a video export while it's visible bakes it in. Force `maskOverlayOn=0` on export (one uniform). | S | open | |

### D4 — Collision on the unified system
| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D4-1 | **Multiple simultaneous live bindings** (today: one live slot; one-shot colliders stack freely). | M | open | |
| D4-2 | **Animated/transforming masks keep collision live** (Mask objects have no transforms yet — D5 territory). | M | parked→D5 | |
| D4-3 | **Depth-collision + webcam flows become mask-source presets** on the binding path (⤓ Mask covers depth today; webcam still creates collision layers directly). | M | open | |

### D5 — Selections & transforms
| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D5-1 | **Selection tools** — rectangle/ellipse/lasso + SAM-click ("magic wand"); a selection IS a temporary mask. | L | open | |
| D5-2 | **Raster content transforms** — move/scale/rotate selection or layer content (extend layer-transform). | L | open | |
| D5-3 | **Fill/gradient into selection**; clear/cut/copy within selection. | M | open | |

### D6 — Undo/redo unification
| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D6-1 | **One history stack** across stroke, layer, mask, binding ops (today: sketch strokes have a GPU ring, canvas ops a partial `pushUndo` — fold both together); memory-bounded (tile/snapshot-interval for raster). | L | open | |

### D0 / D1 — leftovers
| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D1-1 | **Wire Phase 1.5 features as brush properties** — wetness deposit, bristle count, pickup amount, pigment-mixing toggle (depends on §4). | M | parked→P15 | |

---

## 3. Phase 1.9 — Sim architecture closeout

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| SIM-M2b | **Wall-noise injection hunt** — colliders inject ~3–4× grid-scale velocity noise (both solvers; MG scales it per V-cycle) → "curl-0 miasma" accumulation. Bisect the solver-independent injector + the per-cycle MG wall injection; M2's sink stops accumulation but not the source. | L | open | |
| SIM-MWa | **M-watch (a):** `obstacleCompositeFrag` single bilinear tap when downsampling dye-res sources → edge shimmer at high dye:sim (fix: 2×2 tap / reuse D0.5 blur). | S | open | |
| SIM-MWb | **M-watch (b):** hfFloor wall apron narrowed vs design (center-tap 0.65–0.98 vs cross-max 0.05–0.5 spec) — some wall drag may return. | S | open | |
| SIM-MWc | **M-watch (c):** magnitude gates (cap/knee/floors) are UV-anisotropic on non-square canvases (~aspect skew). | S | open | |
| SIM-MWd | **M-watch (d):** MacCormack noisy-transport revert is a binary threshold — watch for sharp/diffuse patch boundaries. (Related to NEW-1 de-band, same shader.) | S | open | |
| SIM-MWe | **M-watch (e):** pressure soft-valve knee (30000) is dead code in the new pressure scale — retire or recalibrate. | S | open | |

---

## 4. Phase 1.5 — Painterly upgrades (parked pre-1.75; land atomically)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| P15-1 | **Wetness/drying map** — one fp16 channel scaling dye advection/dissipation/swirl; dry holds, wet flows/re-wets. THE paint-vs-smoke feature. (Prior attempt reverted for live-server churn — land atomically.) | L | parked | |
| P15-2 | **Edge darkening + granulation** — darken dye ∝ \|∇density\| (watercolor pooling) + static paper-noise modulation. Post-FX siblings of heightfield shading. | M | parked | |
| P15-3 | **Pigment-space color mixing** — Kubelka-Munk at splat time via spectral.js (MIT). Blue+yellow=green, write-time only. | M | parked | |
| P15-4 | **Fake-bristle splatting + dirty-brush pickup** — jittered sub-splats along tangent + sample dye under brush (readback-free). | M | parked | |
| P15-5 | **Thick-paint material mode** — high vel dissipation + low dt, pressure intact ("paint is a barely-moving fluid"); fits Material dropdown. | M | parked | |
| P15-6 | **Particle-trail dry-brush layer** — fp particle texture advected by velocity, drawn as trails; fibrous streaks grid dye can't make. | M | parked | |
| P15-7 | **Experiments** — dye:sim ratio (4:1 → test 8:1 + lower sim res w/ MacCormack); fp16 linear-filter fallback check for old Android. | S | parked | |

---

## 5. D7 — Integration & testing (parked; resumes after D2–D6 land)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D7-1 | **Versioned project save/load** carrying the full stack (layers, masks, bindings, brush presets) + migration from current saves. | L | parked | |
| D7-2 | **Multiplayer:** stroke events carry brush-engine params; decide raster-layer sync scope (or fluid-only v1). Absorbs UX-2.2. | L | parked | |
| D7-3 | **Video export composites the full stack**; perf budget via JankMonitor (stamp-to-photon < ~30ms). | M | parked | |

---

## 6. Phase 2 — UI audit + componentization (after the Drawing Foundation)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| S1-1 | **Stage 1 — strip per-channel audit** (8 faders incl. material-mode label hack + arm-colors trigger; Color/Actions/Presets channels). | M | open | |
| S1-2 | **Stage 1 — residual jank blips**: fader drag-start (40ms), audio-scene-cycle clicks (32ms). | S | open | |
| S1-3 | **Stage 1 — strip-wide**: tooltips, keyboard access, hit targets; polling-loop audit. | M | open | |
| S2-1 | **Stage 2 — sidebar per-section audit** (all 16 sections; several reshaped by Drawing Foundation: Layers, Brush, new Masks panel). | L | open | |
| S2-2 | **Stage 2 — sidebar resize-handle** throttle/snap check. | S | open | |
| S3-1 | **Stage 3 — declarative section registry** (replace 800ms-splash DOM scavenging); persisted user layout. | L | open | |
| S3-2 | **Stage 3 — customization design** (reorder? favorites? workspaces? — Gabriel's ideas needed, Q-5). | M | design | |
| S3-3 | **Stage 3 — retire legacy hidden `.controls` markup**; one documented layout system. | M | open | |
| S4-1 | **Stage 4 — component set** (Slider/Toggle/Select/ColorSwatch/TextField/Buttons/SectionHeader/XYPad/Drawer/Modal) + tokens CSS; ParamRegistry-bound; a11y. Absorbs UX-9.1. | XL | open | |
| S4-2 | **Stage 4 — migrate section-by-section**; kill inline styles; absorb programmatic-update pathways. | XL | open | |
| S5-1 | **Stage 5 — path-layers profiling** (may be reshaped by D2/D5 first). | S | open | |
| S5-2 | **Stage 5 — cross-feature stress matrix**; bar: every interaction ≤ 1 dropped frame with sim running. | M | open | |
| S5-3 | **Stage 5 — full regression** (sim + drawing foundation through the new UI). | M | open | |

---

## 7. Phase 1 closeout leftovers (small, mostly Gabriel-side)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| CL-1 | **Regression pass** on local build — settle-banding soak, freeze preservation, Gate overflow, collision feel (WALL_SLIP 0-vs-1), edge-absorb, recording/replay, video export, multiplayer, web+mobile defaults, preset taste-check. | M | open | |
| CL-2 | **Watch items** (act only if seen): MacCormack checkerboard dithering (→ soft-revert); 144Hz cadence confirm (`JankMonitor.summary().cadence`). | S | verify | |

---

## 8. Open questions for Gabriel (unblock before / during triage)

| ID | Question | Blocks |
|----|----------|--------|
| Q-1 | Pen-tablet / pressure support priority (PointerEvent.pressure/tilt)? | D1 polish |
| Q-2 | Krita-parity scope for v1 — which tools first (freehand/eraser/fill/shapes/selections)? | D5 |
| Q-3 | Project file-format ambitions (.fluid layered + versioning)? | D7-1 |
| Q-4 | Underbar first contents — which settings did you want there first? | UX-9.1 |
| Q-5 | Layout customization — reorder / favorites / workspaces? | S3-2 |
| Q-6 | De-band: is ~30% dimming at strong values acceptable, or should the taper be energy-preserving? Slider default value? | NEW-1 |

---

## 9. Phase 3 — UX backlog

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| BK-1 | **Capture Gabriel's running list of old UI issues**; triage into this board. | S | open | |

---

### Quick counts
- **Actionable now (not parked):** ~30 tasks. Biggest near-term levers: NEW-1 (de-band), UX-6.2/6.3 (ferrofluid/audio), D3-1..4 (masking consolidation), SIM-M2b + M-watch.
- **Parked** (waiting on a phase): Phase 1.5 (7), D7 (3), D1-1, D4-2, UX-2.2, UX-9.1.
- **Whole-stage XL:** Stage 4 component library (S4-1/S4-2).
