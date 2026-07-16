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

### D7 — Integration & testing (moved here 2026-07-16, Gabriel: park it; resumes after D2–D6 land)
- [ ] Save/load: versioned project format carrying the full stack (layers, masks, bindings, brush presets); migration from current saves.
- [ ] Multiplayer: stroke events carry brush engine params; decide raster-layer sync scope (or fluid-only for v1).
- [ ] Video export composites the full stack; perf budget via JankMonitor (stroke latency target: stamp-to-photon under ~30ms).

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
- ~~**Gravity from device orientation** (mobile)~~ — DROPPED 2026-07-14 (Gabriel: "not going to worry about gyroscopes").
- [ ] Experiments while here: dye:sim ratio (we run 4:1; Dobryakov ships 8:1 — test higher ratio + lower sim res with MacCormack compensating); fp16 linear-filtering fallback check for old Android.

## ▶ ACTIVE — Phase 1.75 — Drawing Foundation: painting / masking / collision architecture overhaul

**Vision:** a Krita-grade drawing and sketching core with the fluid sim as its star layer type — not a fluid toy with drawing bolted on. Unify today's parallel systems (splat pipeline; PNG/capture/path/collision layer flavors; three masking stacks — 15-layer-masking, 05m-layer-masks, SAM/depth-collision) into one architecture.

**The vibe (Gabriel, 2026-07-14):** shapes/masks/colliders currently feel jagged — it's a smoothness/sharpness problem that runs through drawing, masking, AND collision together. Drawing should feel good enough that sketching a little collider is as natural as importing one. Every D-stage should be judged against that: stroke quality, mask edge quality, and collider edge quality are ONE pipeline, not three.

### D0 — Architecture design (do first; everything hangs off this)
- [x] Current-state inventory — DONE 2026-07-14 (3-agent survey). Headline: jaggedness is the same decision made 3× — edges go binary early (SAM 0/1 + NN rescale; depth hard-threshold@128; sim-res obstacle canvas), smoothing happens too late (LINEAR+smoothstep at the very end). The projection already treats obstacles as continuous fractions, so feeding it AA coverage fixes collision edges with zero solver changes. Input side: 1 dab/frame, no local gap-fill (remote HAS one — 06:456), no stabilizer/pressure/eraser, masks can't be painted. Full detail + target model: **docs/drawing-foundation-d0.md**.
- [x] **Collision hardening round 2 (0d21b0a, 3070081)**: Strength slider was non-functional (legacy response saturated at 0.5 — half the slider dead, cliff at 0.4→0.5) → full-range cubic response across projection/damp/splat/drain; NEW-layer default 0.7→1.0 (old 0.7 meant "solid"; EXISTING saves at 0.7 now read permeable — raise to ~1.0 for old firmness). Strength-1.0 sealed pockets: confined-vortex stagnation pressure (~v², REAL physics, 20-40× the 0.9 case) sat at 33-44% of fp16 → clipped on long/growth sessions ("breaks and flows away") → PRESSURE_SCALE 1/256 (4× headroom, now ~2% of ceiling), uniform-gated soft valve in the pressure decay pass (knee 21k stored), solidity capped 0.995 (no Neumann islands). Also: Max Speed slider (fca3d40, soft-knee velocity ceiling 5-60 canvas-widths/s — growth-preset pockets settle smoothly instead of jittering at the cap). OPEN THREAD from Gabriel: isolation / "paints that don't move other paint" with the dab train — investigate VELOCITY_INFLUENCE interplay when he's back with repro details. Follow-ups shipped 2026-07-15/16: strength-1.0 response ceiling 0.997 ("as solid as is stable", 98e53ec) + resolution-aware pressure scale fixing the 1k-sim strength-1.0 breakdown (8e28229).
- [x] **Collider fuzz root cause (c608e35): single-V-cycle multigrid is UNSTABLE around colliders** — velocity diverges exponentially (507→10,280 in 30 frames, no NaN) because one cycle's overcorrection reflects off the Neumann walls and the second cycle is what cleans it up. The governor's low rung capped MG to exactly 1 cycle under load — fuzz appeared precisely when scenes got heavy and vanished with MG off. Fixed: low rung = 2 light cycles (1/1/4 ≈ old cost), mgCycles slider floor 2. Bisect also cleared: MacCormack (identical off), obstacle-drain halo (speckle spatially uniform), hasObstacle side machinery (flow-inert collider = control). WATCH: velocity through narrow collider channels still peaks ~2k (bounded, physical squeeze) — if residual grain bothers on dense colliders, next knob is VELOCITY_DISSIPATION per-preset, not the solver.
- [x] **D0.5 rev 3 (bff2a46)** — two feel regressions from rev 1 field-tested by Gabriel and fixed same day: (a) MG mushiness (fixed ±band grew porous aprons; solidity lower edge raised) then (b) high-strength whole-canvas fuzz (root cause: obstacle texel = coverage×strength, so solidity's absolute window changed edge geometry with the strength slider — near-binary ragged walls at strength 1.0). Final architecture: fwidth-adaptive depth cut (band ∝ local gradient, cap config.DEPTH_EDGE_BAND=12) + 1-sim-texel GPU blur on the composited obstacle (bounds ALL ramps ~1.5 texels) + solidity separates coverage (texel/uObsMax uniform, strength-independent 0.2–0.8 ramp) from strength (legacy interior curve preserved). Measured: velocity HF noise flat across strength 0.4/0.7/1.0 with MG (0.068/0.088/0.082 ≈ Jacobi), edge at exact predicted radius, apron 0.5 texels. LESSON for D3: coverage and strength must be separate channels in the unified Mask model.
- [x] **D0.5 edge-quality quick pass** — SHIPPED 2026-07-14 (Gabriel: "run D0.5 first"). (1) Depth colliders: 1-bit cut @threshold → smoothstep over ±`config.DEPTH_EDGE_BAND` (16; 0.5≈legacy hard) in obstacle compositor + both previews (05m + editor 15) so visual and collider edges agree. (2) SAM masks: NN-binary rescale → bilinear 0-255 coverage (`soft` flag; same-res masks get 3×3-box AA + bbox grow); consumers (drawMaskShape alpha, isPointInShapeMask ≥128, editor preview) handle soft + legacy. (3) Obstacle canvas composed at 2× sim res (cap 2048) — updateObstacleTexture's existing drawImage box-filters down to fractional coverage the cut-cell projection already consumes. Harness-verified: circle collider edge at exactly predicted radius (27.0 texels, 180 rays); smooth-depth ramp 1.4→4.3 texels with band; worst-case BINARY depth source now yields a 148-texel AA edge ring; SAM soft alpha passes exact values; legacy 0/1 masks unchanged.
- [x] Target model design doc — REVIEWED + DECIDED 2026-07-14 (docs/drawing-foundation-d0.md §4): GL-canvas raster compositing; pressure wired + curves in v1; v1 tools = freehand + eraser + mask brush; versioned .fluid in D7; multiplayer fluid-only v1; undo depth decided in D6; gyro gravity dropped. **D1 IS GO.**
  - **Layer stack**: typed layers — raster (persistent, non-decaying), fluid (the sim — possibly multiple instances later), vector/path, reference/image — with per-layer opacity, blend mode, visibility, transform, and mask slots.
  - **Unified Mask**: ONE mask object type; *sources*: painted, shape, SAM click, depth estimation; *consumers*: layer clip, collision obstacle (with strength), dye emitter region, effect region. A mask is data; what it does is a binding.
  - **Brush engine**: stroke pipeline (pointer → stabilizer → spacing → stamp train), routing (deposit into fluid velocity+dye, into a raster layer, or into a mask — same engine everywhere).
- [ ] Open design questions for Gabriel: pen-tablet/pressure support priority (PointerEvent.pressure/tilt)? Krita parity scope for v1 (which tools first: freehand/eraser/fill/shapes/selections)? file format ambitions (.fluid extension exists — layered project format with versioning)?

### D1 — Brush engine core
- [x] **Slice 1 (fa0abdf): stroke pipeline live on the fluid brush** — js/05d0-brush-engine.js: PointerEvents (coalesced + pen pressure) → weighted-lag stabilizer → distance-parameterized dab spacing with gap-fill → dab queue drained by 05j (≤64/frame, momentum-per-distance preserved). Legacy listeners keep all side jobs (replay/broadcast/recording/splat-out); legacy splat path remains as fallback. Brush section "Stroke Engine": Stabilizer + Spacing sliders, Pressure→Size/Flow checkboxes (persisted). Verified: violent single-event jump = 11 spaced dabs across the segment (was 1). AWAITING Gabriel's feel pass — defaults: spacing 35%, stabilizer 0%. KNOWN GAPS for later slices: stroke-replay events don't record per-dab pressure radius (D7 schema); Splat Rate slider is now redundant on the engine path (retire or repurpose in D1 polish); touch pointermove path uses touchmove feed (touch-action:none would clean it up).
- [x] **Slice 2 (2026-07-16): brush parameters + presets + strip Brush dropdown.** (a) Params: `BRUSH_FLOW` (dye/alpha per dab, both routes incl. splat-out tail; opacity folded into Flow — true per-stroke opacity needs stroke buffers, deferred), `BRUSH_JITTER` (per-dab disc scatter at emission; anchors stay on-path so spacing/stabilizer are jitter-independent; replay faithful since events record jittered positions), `BRUSH_PRESSURE_CURVE` (gamma slider replacing the hard-coded 0.7 in size/flow response). (b) Tips: blob/chisel/streak stamp shapes + new thin-ring become brush tips (`BRUSH_TIP` + `BRUSH_TIP_TEXTURE`=stampNoise) — dye-only like the clay stamps, velocity stays gaussian; applied ONLY on user strokes by riding multiSplat's exactColor split (`__brushTipOn`), so path layers/audio scenes stay classic; material modes keep STAMP_* authority when active. Harness-verified via dye-texture readback: ring center 0.002 vs band peaks 1.98; exactColor dab solid gaussian. (c) Presets: named, persisted (`brush.presets`), quick-switch chips, same-name overwrite, delete on chip ×, eraser state included (eraser-as-a-brush); apply drives the Size fader + every control through the normal commit paths; manual tweaks clear the chip highlight. Verified full round-trip. GAPS: bar stamp not a tip (stays the EQ-scene splat); tips don't apply to the sketch route (disc+hardness shader — unify in D2/D3); recording-replay + multiplayer remote strokes resolve the RECEIVER's tip (same pre-existing design as arm colors); presets don't capture arm count/colors (that's the kaleido channel, not the brush); Splat Rate still unretired.
- [x] **Brush UI moved to the strip (2026-07-16):** clicking the Brush channel LABEL opens a dropdown panel (arm-colors positioning pattern) with presets / Paint Into / Tip+Texture / Flow / Stabilizer / Spacing / Jitter / pressure controls / sketch controls — "too common to live in the side nav" (Gabriel). The value ("1x") still opens Brush Colors. Sidebar section renamed '🖌️ Stroke & Replay', keeps Replay Mode/Period, Splat Rate, Splat In/Out. Legacy element ids + `brush.*` settings keys preserved, saved values migrate untouched.
- [ ] Wire Phase 1.5 features as brush properties: wetness deposit, bristle count, pickup amount, pigment mixing toggle.

### D2 — Persistent raster paint layers
- [x] **Slice 1 (f8d77a6): Sketch layer live** — RGBA8 dye-res FBO composited in displayFrag (after fluid effects, raw vUv — kaleido never warps it), survives FBO reinits. "Paint Into" Fluid|Sketch routing on the D1 engine (sketch = plain draughtsman stamp: no arms/ramps/replay/broadcast); Eraser (destination-out) + Hardness slider + Show/Clear controls; **Sketch → Collider button** (alpha → ≤512 depth-mask collision layer — the "sketch a collider" vibe payoff, one button). Verified E2E: continuous 942-column stroke, eraser 253→3 alpha, reinit survival, collider lights 6,960 obstacle texels, fluid path regression-clean. GAPS for next slices: sketch not in save/load (D7), not in video export compositing (24-video-export reads DOM divs + sim snapshot — sketch is inside the GL canvas so exportStill/video DO capture it via the canvas ✓ but GIF path untested), single layer only (full stack = D2 proper), fluid-target eraser still open (dye-subtract stamp).
- [x] **Slice 2 (2026-07-16): Ignite + Capture bridges.** 🔥 Ignite pours the sketch into the fluid as dye (one-shot additive, `igniteFrag`; sketch untouched, sim velocity takes over) and ❄ Capture freezes the current dye into the sketch (`captureFrag`: premultiplied over-composite, alpha = max channel so faint haze lands translucent — folds the Capture Layer idea in at raster level; undoable). Both buttons in the strip Brush panel's Sketch group. Harness-verified via texture readbacks both directions. GAP: ignite is one-shot — a continuous "emitter region" binding is D3 mask-consumer territory.
- [ ] Compositing pipeline: raster layers + fluid layer + existing PNG/capture layers in one ordered stack with blend modes; meets the existing 05k render + video export.
- [ ] Stroke routing UX: paint INTO fluid vs INTO active raster layer vs INTO mask — one modal choice, obvious in UI.

### D3 — Unified masking
- [ ] Implement the Mask object + bindings from D0; migrate the three existing mask systems onto it (SAM and depth become mask *sources*, not separate stacks).
- [ ] One mask editor (consolidate mask-editor/15/16 UI): paint masks with the D1 brush engine.
- [ ] Masks as first-class layer citizens: per-layer clip masks, visible overlays, invert/feather/threshold ops.

### D4 — Collision on the unified system
- [x] **First live binding shipped (2026-07-16): ⟳ Live sketch → collider.** The Sketch Collision layer TRACKS the sketch — every mutation (stroke end, eraser, Clear, Capture, undo/redo; 05i fires `__onSketchMutated`) refreshes the bound layer in place via `updateLayerDepthMask` (readback coalesced to 1/120ms, stroke-END cadence, never per-dab). Empty sketch → zeroed collider (erasing everything clears the wall). Binding auto-disables if the bound layer is deleted (button state follows via `__onSketchLiveChanged`). Draw-a-wall-watch-the-fluid-part is now one toggle. This is the PROTOTYPE for D4's binding model — the mask source is the sketch; generalize to any mask source when D3 lands the Mask object.
- [ ] Collision = a mask binding with strength/behavior params (existing collisionStrength/obstacle pipeline is the consumer — already fraction-based and multigrid-aware from Phase 1).
- [ ] Any layer or mask can be bound as obstacle; animated/transforming masks keep collision live (existing transform hooks).
- [ ] Depth-collision and webcam flows become mask-source presets on this path.

### D5 — Selections & transforms
- [ ] Selection tools: rectangle/ellipse/lasso + SAM-click ("magic wand"); a selection IS a temporary mask (same object).
- [ ] Raster content transforms: move/scale/rotate selection or layer content (extend existing layer-transform).
- [ ] Fill/gradient into selection; clear/cut/copy within selection.

### D6 — Undo/redo unification
- [x] **Slice 1 (2026-07-16): sketch stroke undo/redo.** GPU snapshot ring (RGBA8 dye-res, depth 6, FBO-pooled, lazily sized — res changes just invalidate pool entries; restoring an old-res snapshot rescales via normalized-UV copy). One snapshot per mutating op: stroke start (first dab opens, engine-idle closes via 05j), Clear, Capture. Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y route to sketch history while Paint Into = Sketch (deliberately no fall-through to the UI-state undo), plus ↶/↷ buttons in the Brush panel. Live collider follows undo/redo. Verified: stroke→undo→redo→clear→undo alpha round-trip exact. Memory bound: 6 × dye-res RGBA8 (≈96MB worst case at 2048; revisit for mobile in D6 proper).
- [ ] One history stack across stroke, layer, mask, and binding ops (today: partial pushUndo for canvas ops only; sketch strokes now have their own GPU ring — fold both into the unified stack); memory-bounded (tile-based or snapshot-interval for raster).

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
