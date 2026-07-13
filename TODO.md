# Fluid-UI Roadmap

**Direction (Gabriel, 2026-07-13):** this is a fluid *drawing and painting* app — shaders-for-fluidity stays the core, but the app needs a solid drawing/sketching foundation, as close to Krita-like as possible. Order: Phase 1 closeout → painterly upgrades → **drawing/painting/masking/collision architecture overhaul** → then componentization + UX review of everything.

**Standing principle:** quality machinery (governor / battery / boot ascent) may trade FPS and fidelity — NEVER the aesthetic. Enforced by `LookWatchdog`; every perf claim measured with `JankMonitor` before/after.

---

## ✅ Completed (2026-07-09, details in git log)

- **Phase 1 sim quality**: RK2 backtrace · MacCormack ("Crisp Advection") · curl-noise Swirl · obstacle-aware projection · multigrid pressure ("Multigrid Pressure", 3.3× more incompressible at ~⅓ cost) · "Ridges" slider (res-independent sharpen, default 0).
- **UI audit Stage 0 + emergencies**: JankMonitor + LookWatchdog · 97% interaction-jank cut · 144Hz unlock · collapse-animation layout thrash (6 sites) · governor effect-shedding opt-in + hydration races · resize-settle deadlock + init-size race · dead-code sweep (~1,400 lines) · kernel normalizations.

---

## Phase 1 closeout (small, mostly Gabriel-side)

- [ ] **Regression pass** on the local build: settle-banding soak (slow presets), freeze preservation, Gate overflow, collision feel, edge-absorb mode, recording/replay, video export, multiplayer, web + mobile defaults.
- [ ] **Preset retune**: drift `PRESSURE_DISSIPATION` toward ~0.95 (multigrid removed its stabilizer double-duty); taste-check all 8 presets (Marble/Thick most likely to shift).
- [ ] Mobile/real-GPU check of the multigrid pyramid (defaults off there — verify that's right).
- [ ] Watch items (act only if seen): fp16 pressure headroom on violent presets; MacCormack checkerboard dithering (→ soft-revert); 144Hz cadence confirm (`JankMonitor.summary().cadence`).

## Phase 1.5 — Painterly upgrades (UNSHELVED 2026-07-13: execute + test)

Research-sourced (sources in git history of this file). Adoption order per the survey; each ships behind a control, each gets a verify pass. These double as brush-engine groundwork for the Drawing Foundation below.

- [ ] **Wetness/drying map** — one fp16 channel: decays over time, refreshed by splats; scales dye advection/dissipation/swirl. Dry paint holds; wet paint flows and re-wets neighbors. Unlocks rewetting-brush + blow-dry tools. THE paint-vs-smoke feature.
- [ ] **Edge darkening + granulation** — darken dye ∝ |∇density| (watercolor pooling); static paper-noise modulation (pigment settling). Post-FX siblings of the heightfield shading; hours each.
- [ ] **Pigment-space color mixing** — Kubelka-Munk mixing at splat time via spectral.js port (MIT; NOT Mixbox — CC BY-NC). Blue+yellow=green. Write-time only, no latent storage.
- [ ] **Fake-bristle splatting + dirty-brush pickup** — N jittered sub-splats along stroke tangent with per-bristle color variance; sample dye under the brush into the splat color (readback-free).
- [ ] **Thick-paint material mode** — high velocity dissipation + low dt, pressure solve intact (David Li's "paint is a barely-moving fluid"); fits the Material dropdown.
- [ ] **Particle-trail dry-brush layer** — small fp particle texture advected by velocity, drawn as trails into dye; fibrous streaks grid dye can't make.
- [ ] **Gravity from device orientation** (mobile) — small gravity term from accelerometer.
- [ ] Experiments while here: dye:sim ratio (we run 4:1; Dobryakov ships 8:1 — test higher ratio + lower sim res with MacCormack compensating); fp16 linear-filtering fallback check for old Android.

## Phase 1.75 — Drawing Foundation: painting / masking / collision architecture overhaul

**Vision:** a Krita-grade drawing and sketching core with the fluid sim as its star layer type — not a fluid toy with drawing bolted on. Unify today's parallel systems (splat pipeline; PNG/capture/path/collision layer flavors; three masking stacks — 15-layer-masking, 05m-layer-masks, SAM/depth-collision) into one architecture.

### D0 — Architecture design (do first; everything hangs off this)
- [ ] Current-state inventory: every layer flavor, mask system, stroke path, undo path, and their couplings (multiplayer stroke events, save/load format, video export compositing).
- [ ] Target model design doc, reviewed with Gabriel before code:
  - **Layer stack**: typed layers — raster (persistent, non-decaying), fluid (the sim — possibly multiple instances later), vector/path, reference/image — with per-layer opacity, blend mode, visibility, transform, and mask slots.
  - **Unified Mask**: ONE mask object type; *sources*: painted, shape, SAM click, depth estimation; *consumers*: layer clip, collision obstacle (with strength), dye emitter region, effect region. A mask is data; what it does is a binding.
  - **Brush engine**: stroke pipeline (pointer → stabilizer → spacing → stamp train), routing (deposit into fluid velocity+dye, into a raster layer, or into a mask — same engine everywhere).
- [ ] Open design questions for Gabriel: pen-tablet/pressure support priority (PointerEvent.pressure/tilt)? Krita parity scope for v1 (which tools first: freehand/eraser/fill/shapes/selections)? file format ambitions (.fluid extension exists — layered project format with versioning)?

### D1 — Brush engine core
- [ ] Stroke pipeline: pointer capture → stabilizer/smoothing (Krita-style weighted lag) → spacing-based stamp emission (distance-parameterized, not event-rate — fixes speed-dependent splat density) → stamp render.
- [ ] Brush parameters: size, flow, opacity, hardness, spacing, jitter, pressure curves (size/flow by pressure), existing stamp shapes (blob/chisel/streak/ring/bar) become brush tips.
- [ ] Brush presets: named, persisted, quick-switch (extends the Brush section + palettes conventions); eraser as a brush mode.
- [ ] Wire Phase 1.5 features as brush properties: wetness deposit, bristle count, pickup amount, pigment mixing toggle.

### D2 — Persistent raster paint layers
- [ ] GPU raster layer type: paint that does not decay or advect (unless told to); the drawing/sketching surface.
- [ ] Compositing pipeline: raster layers + fluid layer + existing PNG/capture layers in one ordered stack with blend modes; meets the existing 05k render + video export.
- [ ] Stroke routing UX: paint INTO fluid vs INTO active raster layer vs INTO mask — one modal choice, obvious in UI.
- [ ] Bridge tools: "ignite" (raster → dye source), "capture" (fluid → raster; exists as Capture Layer — fold in).

### D3 — Unified masking
- [ ] Implement the Mask object + bindings from D0; migrate the three existing mask systems onto it (SAM and depth become mask *sources*, not separate stacks).
- [ ] One mask editor (consolidate mask-editor/15/16 UI): paint masks with the D1 brush engine.
- [ ] Masks as first-class layer citizens: per-layer clip masks, visible overlays, invert/feather/threshold ops.

### D4 — Collision on the unified system
- [ ] Collision = a mask binding with strength/behavior params (existing collisionStrength/obstacle pipeline is the consumer — already fraction-based and multigrid-aware from Phase 1).
- [ ] Any layer or mask can be bound as obstacle; animated/transforming masks keep collision live (existing transform hooks).
- [ ] Depth-collision and webcam flows become mask-source presets on this path.

### D5 — Selections & transforms
- [ ] Selection tools: rectangle/ellipse/lasso + SAM-click ("magic wand"); a selection IS a temporary mask (same object).
- [ ] Raster content transforms: move/scale/rotate selection or layer content (extend existing layer-transform).
- [ ] Fill/gradient into selection; clear/cut/copy within selection.

### D6 — Undo/redo unification
- [ ] One history stack across stroke, layer, mask, and binding ops (today: partial pushUndo for canvas ops only); memory-bounded (tile-based or snapshot-interval for raster).

### D7 — Integration & testing
- [ ] Save/load: versioned project format carrying the full stack (layers, masks, bindings, brush presets); migration from current saves.
- [ ] Multiplayer: stroke events carry brush engine params; decide raster-layer sync scope (or fluid-only for v1).
- [ ] Video export composites the full stack; perf budget via JankMonitor (stroke latency target: stamp-to-photon under ~30ms).

## Phase 2 — UI audit (Stages 1–5) + componentization — AFTER the Drawing Foundation

Stage 4's component library should be designed with the D1–D5 tool UIs as first-class customers (brush preset pickers, layer stack panel, mask bindings) — another reason it comes after.

### Stage 1 — Top mixer strip, left to right
- [ ] Per-channel audit (8 faders incl. material-mode label hack + arm-colors trigger; Color/Actions/Presets channels).
- [ ] Residual jank blips: fader drag-start (40ms), audio-scene-cycle clicks (32ms).
- [ ] Strip-wide: tooltips, keyboard access, hit targets; polling-loop audit.

### Stage 2 — Sidebar, top to bottom
- [ ] Per-section content audit — all 16 sections (several will be reshaped by the Drawing Foundation: Layers, Brush, plus new Masks panel).
- [ ] Sidebar resize handle throttle/snap check.

### Stage 3 — Layout system rework
- [ ] Declarative section registry (replace 800ms-splash-timer DOM scavenging); persisted user layout.
- [ ] Customization design (Gabriel's ideas needed: reorder? favorites? workspaces?).
- [ ] Retire legacy hidden `.controls` markup progressively; one documented layout system.

### Stage 4 — Modular input component library
- [ ] Component set (Slider, Toggle, Select, ColorSwatch, TextField, Buttons, SectionHeader, XYPad, Drawer, Modal) + tokens CSS; ParamRegistry-bound; accessibility rides along.
- [ ] Migrate section-by-section; kill inline styles; absorb programmatic-update pathways.

### Stage 5 — Integration & performance testing
- [ ] Path layers profiling (may be reshaped/absorbed by D2/D5 first).
- [ ] Cross-feature stress matrix; final bar: every interaction ≤ 1 dropped frame with sim running.
- [ ] Full regression: sim features + drawing foundation through the new UI.

## Phase 3 — UX backlog
- [ ] Capture Gabriel's running list of old UI issues; triage.
