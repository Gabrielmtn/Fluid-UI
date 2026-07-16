# D0 — Drawing Foundation: Current State & Target Architecture

*Phase 1.75 design doc, 2026-07-14. For Gabriel's review BEFORE any code. Inventory evidence gathered by a 3-agent survey (layers / masks / stroke pipeline); every claim below is backed by file:line refs in those reports (condensed here).*

**The vibe this doc serves (Gabriel):** shapes/masks/colliders feel jagged — it's ONE smoothness problem running through drawing, masking, and collision. Drawing should feel good enough that sketching a little collider is as natural as importing one.

---

## 1. Diagnosis: why everything feels jagged

The jaggedness is not one bug — it's the same architectural decision made three times: **edges become binary early, and smoothing happens too late to recover them.**

### Strokes going in (input side)
- **One dab per rendered frame**, spacing = cursor distance per frame ([05j-update-loop.js:130-142](../js/05j-update-loop.js)). Fast strokes = sparse gappy dabs. There is **no local gap-fill** — ironically, *remote* multiplayer strokes DO get interpolated at ~12px spacing ([06-multiplayer.js:456-481](../js/06-multiplayer.js)); your own strokes never did.
- **No stabilizer, no smoothing, no pressure.** Raw mouse/touch positions (legacy events — PointerEvent pressure/tilt never read) feed straight into splats.
- **No eraser. No painting into masks.** Masks are place-and-drag geometric shapes, SAM clicks, or depth imports only — "sketch a collider" has no pathway today.

### Masks in the middle
- **SAM masks are binary 0/1** with nearest-neighbor rescale and hard 1-px edges ([16-sam-integration.js:609-611](../js/16-sam-integration.js)); **not persisted** (silently lost on save/load, [12-save-load.js:606](../js/12-save-load.js)).
- **Depth masks are hard-thresholded at 128** — a 1-bit cut applied at ≤512 model resolution ([23-depth-collision.js:862-870](../js/23-depth-collision.js)).
- Feathering exists but is **off by default** and is a box blur when on ([05m-layer-masks.js:232-276](../js/05m-layer-masks.js)). The interaction-gate path is a hard boolean point test.

### Colliders coming out (sim side)
- All mask flavors converge on an **obstacle canvas allocated at exactly sim resolution** (512 desktop, **128 mobile**; and the quality governor lowers it under load — colliders get MORE jagged when things get busy).
- The only antialiasing in the whole chain is at the very end: LINEAR texture filtering + `smoothstep(0.1, 0.5)` in the shaders. That blurs the stair-step; it cannot recover the sub-texel edge position destroyed by the early binarization.
- **Key insight: the downstream sim is already edge-quality-ready.** The obstacle-aware projection treats the obstacle as a *continuous solid fraction* (cut-cell style — the multigrid pyramid restricts fractions, solidity is a smoothstep). Feed it antialiased coverage instead of stair-steps and collision edges get smooth with **zero solver changes**.

### Structural debt the overhaul must resolve
- **Two layer classes pretending to be one**: compositing layers (image/capture/collision — pixel data as base64 dataURLs on DOM divs, z-index stacking) vs generative layers (path/recording — vector/timeline data splatted into the sim). Collision is a *layer subtype flag* rather than a behavior.
- **Five mask subsystems** sharing one loose `layer.mask.shapes[]` model with per-type special cases in three different consumers.
- **Three stroke recording formats** (replay events in canvas px; recording timelines and multiplayer normalized 0-1) with conversion code scattered across 05d/03/06.
- **Undo covers almost nothing**: global sliders/colors only — no layer, mask, transform, path, or timeline operation is undoable.
- **Transforms implemented 3×** (legacy handles, LayerTransform overlay, path-layer overlay); path layers omit `flow` from persistence.

---

## 2. Target architecture

### 2.1 Unified Mask (the heart of it)

ONE mask type. A mask is **data**; what it does is a **binding**.

```
Mask {
  id, name,
  source:   { kind: 'painted' | 'shape' | 'sam' | 'depth' | 'procedural', ...params }
  coverage: continuous 0..1 field, canvas-resolution working raster (8-bit alpha min)
            — NEVER 1-bit. Vector/shape sources also keep their geometry for
            lossless re-rasterization at any resolution.
  ops:      { feather, invert, softThreshold(center, band), grow/shrink }
}

Binding { maskId, consumer: 'clip' | 'collider' | 'emitter' | 'effect',
          params per consumer (collider: strength/mode; emitter: color/rate; ...) }
```

**Edge-quality rules (non-negotiable, this is the vibe):**
1. Sources produce *coverage*, not bits: SAM output feathered/AA'd at native res before any rescale (bilinear, never NN); depth threshold becomes `smoothstep(t-band, t+band)` — a soft cut whose band is a user slider; painted masks come from the D1 brush engine with antialiased stamps.
2. Rasterize as late as possible, at the highest available resolution; downsample with proper filtering (2× supersample → box filter for the obstacle texture).
3. Consumers sample coverage: clip = alpha; collider = filtered downsample to sim res (fractions, which the projection already honors); emitter/effect = regional sample.

Sketching a collider then falls out naturally: **brush → painted mask → collider binding.** Same stroke quality as painting dye.

### 2.2 Layer stack

Typed layers, one ordered stack, each with `opacity, blendMode, visible, transform, maskSlots[]`:

| Type | Replaces | Pixel/data home |
|---|---|---|
| `fluid` | the sim canvas entry in layerOrder | existing GL sim (unchanged, still the star) |
| `raster` | NEW — persistent paint that doesn't decay | GPU texture (RGBA8/16F), composited in-canvas |
| `vector` | path layers | normalized points + brush params (splat emitter mode preserved) |
| `image` | PNG/capture layers | keep DOM-div compositing short-term (export already mirrors it) |

Collision stops being a layer type: a collision layer becomes an `image`/`raster` layer (or bare mask) with a **collider binding**. Recording layers stay a timeline attached to the stack (they're time, not space).

### 2.3 Brush engine (D1)

```
PointerEvents (+ coalesced events, pressure, tilt)
  → stabilizer (Krita-style weighted lag, strength 0 = off)
  → path interpolation (spline through samples)
  → distance-parameterized stamp emission (spacing % of radius — speed-INDEPENDENT)
  → stamp train (existing tips: blob/chisel/streak/ring/bar become brush tips)
  → ROUTER: fluid (velocity+dye splat) | raster layer | mask coverage
```

- Local gap-fill lands here for free (the remote-splat gap-fill at 06:456-481 is the proof of pattern).
- Eraser = a brush mode (subtract on raster/mask; dye-subtract stamp on fluid).
- Pressure curves map to size/flow when hardware provides it; degrade gracefully.
- Phase 1.5 painterly features (wetness, bristles, pigment mixing) mount as brush properties later — the engine is the chassis.

### 2.4 One stroke event schema

Single normalized format `{t, x, y (0-1), pressure, dx, dy, brush:{radius, mult, tip, flow}, color}` consumed by replay, recording timelines, and multiplayer (chunking preserved). Kills the px-vs-normalized conversion scatter.

### 2.5 Undo (D6) & persistence (D7)

- Command-pattern history across stroke/layer/mask/binding ops; raster strokes memory-bounded via tile snapshots.
- `.fluid` versioned container: layer stack + masks + bindings + brush presets + timelines; migration from current saves; **masks always persist** (fixes SAM loss).

---

## 3. Sequencing (D-stages, refined by the inventory)

- **D0.5 — optional edge-quality quick pass (NEW, ~days not weeks):** before any architecture: depth hard-threshold → smoothstep band; SAM NN-rescale → bilinear + one feather pass; obstacle canvas 2× supersample → filtered downsample. Ships visibly smoother colliders immediately because the solver already handles fractions. Zero new architecture, fully absorbed by D3 later.
- **D1 brush engine** (input quality: stabilizer, spacing, gap-fill, pressure, eraser) — biggest daily-feel win.
- **D2 raster layers** (persistent sketching surface + routing UX).
- **D3 unified Mask + bindings** (migrate the five mask systems; one editor; paint masks with D1).
- **D4 collision-as-binding** (mostly falls out of D3; existing obstacle pipeline is the consumer).
- **D5 selections/transforms** (selection = temporary Mask; unify the 3 transform implementations).
- **D6 undo**, **D7 save/multiplayer/export integration**.

---

## 4. Decisions (Gabriel, 2026-07-14)

1. **D0.5 quick pass** — DONE (shipped same day; three field-tested revisions — see TODO. Structural lesson baked into D3: coverage and strength are separate channels).
2. **Tablet pressure/tilt** — ✅ wired + basic curves in v1: PointerEvents with pressure→size/flow, graceful mouse/touch fallback; tilt captured in the schema, unused for now.
3. **V1 tool scope** — ✅ freehand + eraser + mask brush. Shapes/fill/selections stay D3–D5.
4. **Raster compositing home** — ✅ inside the GL canvas (GPU-texture layers, one export path, fluid↔raster blend modes possible).
5. **`.fluid` format** — ✅ committed: versioned container in D7 with migration from current saves.
6. **Multiplayer scope** — fluid-only v1 (strokes sync; raster/mask sync deferred).
7. **Undo depth** — open; decide during D6 (default: layer/mask-op undo first, tile-based stroke undo if budget allows).
8. **Device-orientation gravity** — DROPPED (out of scope, Gabriel 2026-07-14).
