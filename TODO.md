# Fluid-UI Roadmap

**Direction (Gabriel, 2026-07-13):** this is a fluid *drawing and painting* app — shaders-for-fluidity stays the core, but the app needs a solid drawing/sketching foundation, as close to Krita-like as possible. Order: Phase 1 closeout → painterly upgrades → **drawing/painting/masking/collision architecture overhaul** → then componentization + UX review of everything.

**Standing principle:** quality machinery (governor / battery / boot ascent) may trade FPS and fidelity — NEVER the aesthetic. Enforced by `LookWatchdog`; every perf claim measured with `JankMonitor` before/after.

---

## ✅ Completed (2026-07-09, details in git log)

- **Phase 1 sim quality**: RK2 backtrace · MacCormack ("Crisp Advection") · curl-noise Swirl · obstacle-aware projection · multigrid pressure ("Multigrid Pressure", 3.3× more incompressible at ~⅓ cost) · "Ridges" slider (res-independent sharpen, default 0).
- **UI audit Stage 0 + emergencies**: JankMonitor + LookWatchdog · 97% interaction-jank cut · 144Hz unlock · collapse-animation layout thrash (6 sites) · governor effect-shedding opt-in + hydration races · resize-settle deadlock + init-size race · dead-code sweep (~1,400 lines) · kernel normalizations.

---

## To revisit (parked 2026-07-14 — Gabriel: jump straight to the Drawing Foundation)

**Why parked:** the jagged feel of shapes/masks/colliders is an architecture problem, not a polish problem — "drawing should feel good so we can sketch little colliders as easily as we import them." Everything below stays valid; it resumes after (or gets absorbed into) Phase 1.75.

### Phase 1 closeout leftovers (small, mostly Gabriel-side)

- [x] **Preset active states** — FIXED 2026-07-13: `updatePresetButtons` queried the legacy `.presets` container the mixer refactor had emptied, AND a three-way specificity war (JS inline cssText vs `all:unset !important` stylesheet rule vs `.active` class) made active styling unrenderable on every presets-channel button. All styling now class-based (`.mixer-preset-btn`); built-in ↔ user preset actives supersede each other through the real state owner (clearActivePreset), synced across both user-preset surfaces (strip + sidebar); slider divergence clears. Verified in harness.
- [x] **Preset retune** — DONE 2026-07-13 (engineering half): `PRESSURE_DISSIPATION` compressed into 0.925–0.97 preserving each preset's relative order (old values in comments in 04b for revert); default + registry def 0.944 → 0.95. AWAITING Gabriel's taste pass across all 8.
- [x] **Multigrid small-grid verification** — DONE 2026-07-13: sim 128 → pyramid 64x53>32x27>16x14>8x7, sim 64 → 3 levels; zero NaNs, finite pressure at both. Correctness holds at mobile-class grids; real-phone PERF check (toggle defaults off there) still Gabriel-side when convenient.
- [x] **Collision feel** — instrumented 2026-07-13: A/B tests (hard wall + feathered depth-style mask) show the legacy damp pass barely alters outcomes anymore — the obstacle-aware projection dominates and already provides tangential slip. Added `config.WALL_SLIP` (0 = legacy apron damp, 1 = interior-only; default 0.6, console-tunable, no UI) for feel experiments on real content. Gabriel's feel pass decides if the knob deserves a slider or the damp pass retires entirely.
- [ ] **Regression pass** on the local build: settle-banding soak (slow presets), freeze preservation, Gate overflow, collision feel (incl. WALL_SLIP 0-vs-1), edge-absorb mode, recording/replay, video export, multiplayer, web + mobile defaults, preset taste-check.
- [x] **fp16 pressure headroom** — CONFIRMED + FIXED 2026-07-14: Gabriel reported speed-scaled jitter with Multigrid on (gone with it off). Harness measured the MG-converged pressure PEGGED at fp16 max 65504 under fast multi-arm strokes (Jacobi's under-converged field peaks ~1.8k — why MG-off "cured" it); clipped peaks → glitchy projection under fast strokes. Fix: whole pressure system rescaled by `config.PRESSURE_SCALE` (1/64; console A/B: set 1 for legacy) — divergence scales at the source, gradient divides back out, everything between is linear. Mild-regime look preserved (measured). Also shipped: Multigrid tuning sliders (V-Cycles / Pre / Post / Coarse / Relaxation ω) in a panel under the toggle; ω default 1.0 = historical behavior (damped-Jacobi theory tested and refuted — neutral here). NOTE for Gabriel's verify: if fast-stroke jitter persists, next suspect is the governor ladder's MG cliffs (fast-relief flips 2-cycles→1→Jacobi mid-stroke) — JankMonitor `governorState` during a fast stroke will show it.
- [ ] Watch items (act only if seen): MacCormack checkerboard dithering (→ soft-revert); 144Hz cadence confirm (`JankMonitor.summary().cadence`).

### Phase 1.5 — Painterly upgrades (parked 2026-07-14; wetness attempt reverted 2026-07-14 — land atomically next time; D1 wires these as brush properties)

**Shipped first (822e328): brush-system fixes** — strip renames (Size / Brush), Brush Colors panel at 1x, two-way arm-0 ↔ picker color sync, faithful replay (recorded radius+mult per event, both replay paths), multiplayer replay unblocked (16KB relay cap → quantize + chunk + reassemble). Web deploy still pending for the multiplayer fix to reach web peers (`npm run deploy`).

- [x] **🐛 REGRESSION: path layers no longer respect their own color** — FIXED 2026-07-14. Root cause as suspected: removing `resolveArmColor`'s `multiplier < 2` gate let arm 0's color mode override programmatic splat colors at 1x. Fix: `exactColor` flag on `multiSplat` (7th param) / `applyMultiSplatWith` (8th param) bypasses arm-color resolution. Callers audited and set to exactColor=true: path layers (24), audio scenes (30), audio-reactive generators (22), ascend-star tail (04d), portal anim ×3 (04e); 04c has no multiSplat calls (stale header comment). Kept arm resolution (they ARE user strokes): live pointer (05j), stroke replay (05d), recording-layer replay (03), cursor trail (04a), multiplayer remote (06). Verified in harness: with arm 0 in fixed-red mode, real path playback deposited 120/120 splats in the layer's own green; pointer path still resolves arm-0 red at 1x. WATCH: multiplayer remote strokes resolve the RECEIVER's arm modes (pre-existing design — sender's arm config isn't broadcast); if a receiver's arm-0 color mode hijacking remote stroke colors at 1x reads as a bug in practice, flip 06-multiplayer.js:472 to exactColor=true or broadcast resolved colors.

Research-sourced (sources in git history of this file). Adoption order per the survey; each ships behind a control, each gets a verify pass. These double as brush-engine groundwork for the Drawing Foundation below.

- [ ] **Wetness/drying map** — one fp16 channel: decays over time, refreshed by splats; scales dye advection/dissipation/swirl. Dry paint holds; wet paint flows and re-wets neighbors. Unlocks rewetting-brush + blow-dry tools. THE paint-vs-smoke feature.
  - Implementation notes from design pass: wetness lives at SIM res (cheap; R16F double-FBO, preserved across reinits like density); advect+dry in one pass (reuse the shared RK2 snippet with swirl=0; drying = batched half-life decay, fp16-safe like decayDt); splat deposits via a small dedicated add-shader called from splat() when enabled. CRITICAL: the dye-mobility scaling (disp *= mobility(wetness)) must live INSIDE the shared rk2Backtrace snippet with uWetness/wetInfluence uniforms on all three dye passes — MacCormack forward/correct/main must compute identical displacements or the correction dis-coheres. At-rest bit-stability preserved (mobility 0 → disp exactly 0). Params: WET_INFLUENCE slider (0 = feature fully off, passes skipped) + WET_DRYING half-life slider; Effects section next to Swirl.
- [ ] **Edge darkening + granulation** — darken dye ∝ |∇density| (watercolor pooling); static paper-noise modulation (pigment settling). Post-FX siblings of the heightfield shading; hours each.
- [ ] **Pigment-space color mixing** — Kubelka-Munk mixing at splat time via spectral.js port (MIT; NOT Mixbox — CC BY-NC). Blue+yellow=green. Write-time only, no latent storage.
- [ ] **Fake-bristle splatting + dirty-brush pickup** — N jittered sub-splats along stroke tangent with per-bristle color variance; sample dye under the brush into the splat color (readback-free).
- [ ] **Thick-paint material mode** — high velocity dissipation + low dt, pressure solve intact (David Li's "paint is a barely-moving fluid"); fits the Material dropdown.
- [ ] **Particle-trail dry-brush layer** — small fp particle texture advected by velocity, drawn as trails into dye; fibrous streaks grid dye can't make.
- [ ] **Gravity from device orientation** (mobile) — small gravity term from accelerometer.
- [ ] Experiments while here: dye:sim ratio (we run 4:1; Dobryakov ships 8:1 — test higher ratio + lower sim res with MacCormack compensating); fp16 linear-filtering fallback check for old Android.

## ▶ ACTIVE — Phase 1.75 — Drawing Foundation: painting / masking / collision architecture overhaul

**Vision:** a Krita-grade drawing and sketching core with the fluid sim as its star layer type — not a fluid toy with drawing bolted on. Unify today's parallel systems (splat pipeline; PNG/capture/path/collision layer flavors; three masking stacks — 15-layer-masking, 05m-layer-masks, SAM/depth-collision) into one architecture.

**The vibe (Gabriel, 2026-07-14):** shapes/masks/colliders currently feel jagged — it's a smoothness/sharpness problem that runs through drawing, masking, AND collision together. Drawing should feel good enough that sketching a little collider is as natural as importing one. Every D-stage should be judged against that: stroke quality, mask edge quality, and collider edge quality are ONE pipeline, not three.

### D0 — Architecture design (do first; everything hangs off this)
- [x] Current-state inventory — DONE 2026-07-14 (3-agent survey). Headline: jaggedness is the same decision made 3× — edges go binary early (SAM 0/1 + NN rescale; depth hard-threshold@128; sim-res obstacle canvas), smoothing happens too late (LINEAR+smoothstep at the very end). The projection already treats obstacles as continuous fractions, so feeding it AA coverage fixes collision edges with zero solver changes. Input side: 1 dab/frame, no local gap-fill (remote HAS one — 06:456), no stabilizer/pressure/eraser, masks can't be painted. Full detail + target model: **docs/drawing-foundation-d0.md**.
- [x] **Collider fuzz root cause (c608e35): single-V-cycle multigrid is UNSTABLE around colliders** — velocity diverges exponentially (507→10,280 in 30 frames, no NaN) because one cycle's overcorrection reflects off the Neumann walls and the second cycle is what cleans it up. The governor's low rung capped MG to exactly 1 cycle under load — fuzz appeared precisely when scenes got heavy and vanished with MG off. Fixed: low rung = 2 light cycles (1/1/4 ≈ old cost), mgCycles slider floor 2. Bisect also cleared: MacCormack (identical off), obstacle-drain halo (speckle spatially uniform), hasObstacle side machinery (flow-inert collider = control). WATCH: velocity through narrow collider channels still peaks ~2k (bounded, physical squeeze) — if residual grain bothers on dense colliders, next knob is VELOCITY_DISSIPATION per-preset, not the solver.
- [x] **D0.5 rev 3 (bff2a46)** — two feel regressions from rev 1 field-tested by Gabriel and fixed same day: (a) MG mushiness (fixed ±band grew porous aprons; solidity lower edge raised) then (b) high-strength whole-canvas fuzz (root cause: obstacle texel = coverage×strength, so solidity's absolute window changed edge geometry with the strength slider — near-binary ragged walls at strength 1.0). Final architecture: fwidth-adaptive depth cut (band ∝ local gradient, cap config.DEPTH_EDGE_BAND=12) + 1-sim-texel GPU blur on the composited obstacle (bounds ALL ramps ~1.5 texels) + solidity separates coverage (texel/uObsMax uniform, strength-independent 0.2–0.8 ramp) from strength (legacy interior curve preserved). Measured: velocity HF noise flat across strength 0.4/0.7/1.0 with MG (0.068/0.088/0.082 ≈ Jacobi), edge at exact predicted radius, apron 0.5 texels. LESSON for D3: coverage and strength must be separate channels in the unified Mask model.
- [x] **D0.5 edge-quality quick pass** — SHIPPED 2026-07-14 (Gabriel: "run D0.5 first"). (1) Depth colliders: 1-bit cut @threshold → smoothstep over ±`config.DEPTH_EDGE_BAND` (16; 0.5≈legacy hard) in obstacle compositor + both previews (05m + editor 15) so visual and collider edges agree. (2) SAM masks: NN-binary rescale → bilinear 0-255 coverage (`soft` flag; same-res masks get 3×3-box AA + bbox grow); consumers (drawMaskShape alpha, isPointInShapeMask ≥128, editor preview) handle soft + legacy. (3) Obstacle canvas composed at 2× sim res (cap 2048) — updateObstacleTexture's existing drawImage box-filters down to fractional coverage the cut-cell projection already consumes. Harness-verified: circle collider edge at exactly predicted radius (27.0 texels, 180 rays); smooth-depth ramp 1.4→4.3 texels with band; worst-case BINARY depth source now yields a 148-texel AA edge ring; SAM soft alpha passes exact values; legacy 0/1 masks unchanged.
- [ ] Target model design doc — DRAFTED (docs/drawing-foundation-d0.md), AWAITING Gabriel's review + answers to its remaining open questions (raster-compositing home GL-vs-DOM, pressure in v1, tool scope, .fluid format, multiplayer scope, undo depth):
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
