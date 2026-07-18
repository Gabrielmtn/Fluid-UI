# Tasks Final — kept priorities (curated 2026-07-18)

> Gabriel's kept work. Everything else moved to **[TRIAGE-TODO.md](TRIAGE-TODO.md)**
> (parked / someday / lower-priority — revisit later). Source docs (`TODO.md`,
> `UX-fixes.md`) stay authoritative for deep detail.
>
> Columns: **Size** (S ≤ half-day · M ~1 day · L 2–4 days · XL multi-week) ·
> **Status** (open · parked · design · feel) · **Prio** (fill for ordering).

**Decisions folded in (Gabriel, 2026-07-18):**
- **.fluid export/save is important** — elevates D7-1.
- **Underbar v1 = visual-quality + physics-detail controls, in the top-right corner** (UX-9.1).
- De-band lives in the simulation UI area when its slider is built (tracked in TRIAGE-TODO §0).

---

## 1. UX — remaining

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| UX-6.2 | **Ferrofluid aesthetic iteration** — first pass shipped (`ferrofield` dye-transport attractor). Iterate the pattern set (hex / flower-of-life, recursive sub-attractors), beat modulation, feel. | L | feel | |
| UX-6.3 | **Mini audio composer editing** — mini timeline (27) is draw-only; add segment hit-test / drag-resize / overlap layout / playhead in the sidebar form factor. (Cheap early wins: playhead indicator + duration numeric input.) | L | open | |
| UX-6.4 | **Full audio-tab UX** — input sizing, onboarding/guidance, clearer segment layout. | L | open | |
| UX-9.1 | **Underbar component** — ✅ **v1 SHIPPED** (`pre-usertest`): `#quality-underbar` top-right hosts Visual Quality + Physics Detail. Remaining: generalize into the Stage-4 component library; optionally reposition on sidebar open (today z-index keeps it on top). | M | v1 done | |

---

## 2. D3 — Unified masking (better masks + mask controls)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D3-1 | **One mask editor** — consolidate mask-editor/15/16 onto the Mask object (15/16 still write `layer.mask.shapes`; ⤓ Mask import is today's bridge). | L | open | |
| D3-2 | **Mask-level feather/threshold ops** on the Mask object itself (invert exists per-consumer; feather/band only on the collider consumer today). | M | open | |
| D3-3 | **Clip masks for DOM image layers** — ✅ **DONE** (`pre-usertest`): image-layer Clip dropdown + Inv, driven by CSS mask-image from the Mask coverage FBO; debounced `__onMaskMutated` chain for live refresh; persistence free. Harness-verified + adversarial-review fixes folded in. | M | done | |
| D3-4 | **Mask-film export gap** — ✅ **DONE** (`pre-usertest`): export `guard()`/`finish()` set `window.__exporting`, display pass suppresses the film (covers still/video/GIF/sequence). E2E-verified. | S | done | |

---

## 3. D6 — Undo/redo unification

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D6-1 | **One history stack** — ✅ **core DONE** (`pre-usertest`): seq-based `UndoManager` unifies sketch ring + UI-state + a new layer-ops history; Ctrl+Z undoes most-recent across all (recency, not mode). Layer reorder + delete undoable. **Remaining:** mask-object + binding-op undo. | L | core done | |

---

## 4. Phase 1.5 — Painterly upgrades (kept subset; land atomically)

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| P15-1 | **Wetness/drying map** — one fp16 channel scaling dye advection/dissipation/swirl; dry holds, wet flows/re-wets. THE paint-vs-smoke feature. (Prior attempt reverted for live-server churn — land atomically.) | L | open | |
| P15-2 | **Edge darkening + granulation** — darken dye ∝ \|∇density\| (watercolor pooling) + static paper-noise modulation (pigment settling). | M | open | |
| P15-3 | **Pigment-space color mixing** — Kubelka-Munk at splat time via spectral.js (MIT). Blue+yellow=green, write-time only. | M | open | |
| P15-5 | **Thick-paint material mode** — high vel dissipation + low dt, pressure intact ("paint is a barely-moving fluid"); fits the Material dropdown. | M | open | |

---

## 5. D7 — Integration & save format

| ID | Task | Size | Status | Prio |
|----|------|:----:|:------:|:----:|
| D7-1 | **Versioned `.fluid` project save/load** carrying the full stack (layers, masks, bindings, brush presets) + migration from current saves. **Gabriel: important.** | L | open | |
| D7-2 | **Multiplayer:** stroke events carry brush-engine params; decide raster-layer sync scope (or fluid-only v1). Absorbs UX-2.2 (path-layer sync). | L | open | |
| D7-3 | **Video export composites the full stack**; perf budget via JankMonitor (stamp-to-photon < ~30ms). | M | open | |

---

### Notes
- **Wired dependencies:** P15-1/2/3/5 want to route through the D1 brush-property
  system eventually; D7-1 `.fluid` format should carry brush/mask/binding state,
  so it benefits from D3 landing first.
- **Feel-gated:** UX-6.2 is judged by eye (iteration loop with Gabriel).
- Full parked/lower-priority backlog: **[TRIAGE-TODO.md](TRIAGE-TODO.md)**.
