# Fluid-UI Roadmap

Agreed order (2026-07-09): sim quality first, then the full UI audit/overhaul (top nav → side nav → layout rework → component library → integration testing).

## Phase 1 — Simulation quality (advection + pressure)

Research pass complete 2026-07-09 (advection + pressure solvers + implementations survey). Key sources inline.

- [x] **1a-0. RK2 (midpoint) backtrace in the existing advection shader** — DONE 2026-07-09 (shared `rk2Backtrace` snippet in 05b, used by main advection + both MacCormack passes; velocity and dye both get it).
  - One extra velocity fetch inside advectionFrag, zero extra passes, zero feedback risk. Straighter characteristics in swirly regions — curved strokes stop corner-cutting.
  - Ref: Bridson's textbook baseline; cgurps/2DFluidSimulation pairs it with MacCormack.

- [x] **1a. MacCormack advection for dye** — DONE 2026-07-09. Implemented as 2 extra dye-res passes (macAdvectFrag/macCorrectFrag in 05b, dispatched in 05j) borrowing `sharpened`/`detailed` as same-frame scratch (zero extra VRAM); main advection pass self-fetches the corrected field (macMode=1) so all fp16 decay/drain machinery runs exactly once. "Crisp Advection" toggle in Simulation section (config.MACCORMACK, default on desktop / off mobile, persisted, governor-gated via fxOn for now). VERIFIED: no shader errors, dye advects NaN-free, toggle round-trips, 60fps held, and bit-perfect rest stability (65,536 texels, zero deltas over ~240 frames with zeroed velocity + freeze) — banding fix intact.
  - Two passes: forward SL → temp; backward SL of temp + correction `φ + 0.5(φⁿ − φ̂ⁿ)` + clamp, writing final. Clamp = min/max of the 4 bilinear corner texels of the *initial* lookup, via `texelFetch` (GPU Gems 3 ch. 30 formulation — the industry standard).
  - Feedback-loop safety (why this is NOT the Catmull-Rom failure): building blocks are bilinear (gain ≤ 1); the clamp forbids new extrema; per-texel L∞ gain ≤ 1 by construction. Residual risk is checkerboard dithering — mitigate with soft-revert: drop the correction when |correction| > k·(localMax−localMin).
  - Revert to plain SL when the backtrace exits the domain or crosses an obstacle boundary (Selle 2008 practice).
  - fp16 note: correction quantizes to ~0 in near-uniform regions → graceful degradation to plain SL, which is safe.
  - At rest the settle ease-out zeroes displacement → correction exactly 0 → bit-stable (banding regression watch anyway).
  - Ship behind a quality toggle (ParamRegistry + QualityGovernor step-down to plain SL under load). Dye only; velocity MacCormack is a separate later experiment (adds energy, changes preset feel).
  - Code refs: GPU Gems 3 ch.30 `PS_ADVECT_MACCORMACK` (https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-30-real-time-simulation-and-rendering-3d-fluids); Selle et al. 2008 (https://faculty.cc.gatech.edu/~jarek/papers/maccormack.pdf); GLSL walkthrough w/ perf data (https://phramebuffer.wordpress.com/the-advection-stage-and-speeding-up-the-smoke-simulation/); repos: cgurps/2DFluidSimulation, Bixio999/3d-fluid-simulation, tmarrec/fluid-simulation.
  - Bonus data point: PHrameBuffer found MacCormack let them run 10 Jacobi iterations where plain SL needed 40 — may pay for itself.

- [x] **1a-2. Curl-noise micro-swirl in the dye advection pass** — DONE 2026-07-09. swirlGLSL (value-noise curl potential, time-scrolled) shared by all three dye passes via the rk2Backtrace snippet; magnitude rides on local advective displacement (mTexels), so swirl exists only where paint moves and the settle ease-out keeps at-rest bit-stability (verified: 40k texels, zero deltas over 120 forced steps at swirl=0.8). Velocity self-advection hard-sets swirl=0 (never written back — divergence-free AND feedback-safe). "Swirl" slider in Effects (config.SWIRL, default 0, persisted, mutation scope extended). A/B verified: mean |dye diff| 0.20 at swirl 0.8, no NaNs, energy conserved within 5%. Candidate later upgrade: per-material swirl defaults (fits Material modes).

- [x] **1b. Obstacle-aware projection** — DONE 2026-07-09. Divergence zeroes solid-neighbor velocity contributions, pressure Jacobi mirrors center pressure at solid neighbors (Neumann), gradient-subtract uses the same stencil + solidity-blended no-penetration at faces + kills velocity inside solids. Continuous fluid-fraction treatment (smoothstep 0.1→0.5 of the antialiased mask — same convention as splat obsBlock), ready for 1c's volume-fraction restriction. Gated on the same collisionLayers check as the damp pass (which stays as belt-and-suspenders). VERIFIED with a synthetic circle mask: velocity exactly 0 inside, upstream flow ~70 cells/s deflecting to ~163/~78 through the side lanes (flow-around-a-cylinder signature), pressure hill upstream, ZERO dye penetration, no NaNs. (Investigated the suspected "governor re-init wipes obstacle" bug: NOT a bug — 05j:105 already re-composites via collisionLayers.updateObstacleFromLayers() after every initFramebuffers, verified end-to-end across a physicsResolution change with a procedural mask. The wipe seen during testing only affects raw updateObstacleTexture uploads with no layer/procedural backing, which no real code path does.)
  - Today obstacles are enforced only by the post-projection damping pass (05j-update-loop.js:221); the pressure solve is blind to them — root cause of dye piling at stagnation zones (the burn-halo / pinned-dye battles documented in advectionFrag).
  - Change: divergence, pressure, and gradient-subtract passes sample uObstacle and treat solid texels as walls (zero normal velocity into solids in divergence; Neumann pressure — use own-cell pressure for solid neighbors; zero normal velocity at solid faces in gradient subtract).
  - Only active when collision layers are on (same gate as obstacleDamp). Keep obstacleDamp as fallback toggle during rollout.
  - Also feeds 1a: MacCormack should revert-to-SL across obstacle boundaries (see above).
  - Design for 1c now: treat the obstacle texture as a float fluid-fraction field (0=solid, 1=fluid, fractional at antialiased edges — our masks are already written this way at collisionStrength) rather than thresholding to binary; the multigrid restriction needs fractions (see 1c).
  - Research note: unconverged Jacobi + obstacles = visible leakage through / bouncing at solids — obstacle quality and 1c are coupled; expect full payoff only when both land.

- [x] **1c. Multigrid pressure solve (V-cycle)** — DONE 2026-07-09. mgResidual/mgRestrict/mgProlong shaders (05b) + pyramid FBOs and mgSolvePressure orchestrator (05c) + dispatch in 05j. pressureFrag doubles as the smoother via an hSq=(2^L)² uniform; RHS stored in level-0 units all the way down so fp16 never sees compounding 4^L factors. Obstacle fractions box-restricted down the pyramid each frame when collisions active; Neumann stencil at every level. "Multigrid Pressure" toggle (config.MULTIGRID, default on desktop / off mobile, persisted). Governor ladder mapped onto effIters: ≥24 → 2 V-cycles, ≥12 → 1, below → warm Jacobi floor. VERIFIED: residual |divergence| mean 0.486 vs 1.593 for Jacobi-32 (3.3× more incompressible at ~1/3 the fill cost), zero NaNs, obstacle test with MG shows velocity exactly 0 inside mask + deflection lanes, pressure max ~5.2k (12× fp16 headroom — watch on violent presets).
  - Deferred follow-ups: boundary-band extra smoothing sweeps (add only if obstacle convergence visibly stalls — damp pass currently backstops); raise PRESSURE_DISSIPATION toward ~0.95 + preset retune (dissipation < 1 was doubling as stabilizer for the unconverged solve); real-GPU perf check on desktop + mobile (pyramid = ~40 small draws/frame).
  - (Research pass had confirmed: Poisson filters REJECTED — free-space kernel assumption collides with obstacles + fp16 risk; FFT rejected: periodic-only; CG/MGPCG rejected: reductions impractical without compute.)
  - Empirical payoff (vassvik, verified): 1 V-cycle ≈ accuracy of ~1000 Jacobi iterations at ~10-Jacobi fill cost. 2 V-cycles ≈ 11 full-res-pass-equivalents vs our current 32 — ~3x cheaper AND far more converged. Unconverged pressure = the mushy expansion we see, and with 1b's obstacles it would show as leakage/bounce at solids.
  - Recipe (cross-source consensus): 5–7 levels (coarsen by 2 down to ~8–16 cells), V(1,1) to V(2,2) pre/post smoothing, plain Jacobi smoother first (structure matters far more than smoother; RBGS in-cycle only if profiling shows smoothing dominates), 4–8 smoothing iterations at coarsest level instead of exact solve, bilinear restriction/prolongation. Residual math in highp; consider scaling residuals before fp16 store (underflow at deep levels — our ANGLE fp16 lesson applies).
  - **Obstacle key #1 (Weber 2015 cut-cell MG):** restrict fluid VOLUME FRACTIONS down the pyramid, not a binary mask — binary masks lose thin solids at coarse levels and stall convergence. Obstacle texture becomes a float "fluidity" field; restriction is just averaging.
  - **Obstacle key #2 (McAdams 2010):** 1–2 extra smoothing sweeps in a mask-dilated band near solids per level — the difference between MG that converges with obstacles and MG that mysteriously stalls.
  - Warm start: our decay-multiply IS documented best practice (β≈0.85 in the literature); raise PRESSURE_DISSIPATION toward ~0.95 once MG lands. NOTE: dissipation < 1 currently double-duties as a stabilizer for the unconverged solve — presets will want retuning after MG.
  - QualityGovernor ladder: 2 V-cycles (desktop) → 1 V-cycle (mobile default; per-pass tile overhead dominates there) → truncated V-cycle (fewer levels) → warm-started Jacobi floor.
  - Refs: vassvik projection notes (https://gist.github.com/vassvik/f06a453c18eae03a9ad4dc8cc011d2dc); McAdams/Sifakis/Teran MGPCG (https://pages.cs.wisc.edu/~sifakis/papers/mgpcg_poisson.pdf); Chentanez–Müller separating boundaries (https://matthias-research.github.io/pages/publications/separatingBoundaries.pdf); Weber cut-cell MG (Eurographics 2015); wildabc WebGL MG FLIP precedent (https://wildabc.wordpress.com/2012/12/11/webgl-demo-free-surface-flow/). No polished public WebGL2 MG fluid repo exists — ours would be among the first.

- [ ] **1d. Regression checklist for 1a–1c** — run after each: banding-at-rest (settle ease-out), fp16 decay batching still no-ops on skip frames, freeze mode preserves artwork, Gate bloom ceiling, overflow/open-boundary mode, mobile (highp cost), multiplayer determinism assumptions, video export.

- Explicitly rejected by research (don't revisit): BFECC (dominated by MacCormack), BiMocq² (fp16-hostile mapping fields), IVOCK (second Poisson chain for plume-specific gains), covector/flow-map methods (no real-time track record), **any sharpening/anti-diffusion written back into stored dye** (gain > 1 in the feedback loop = the Catmull-Rom crackle class; display-side sharpening only).

## Phase 1.5 — Painterly upgrades (research-sourced backlog, cherry-pick after Phase 1)

From the implementations survey (2026-07-09). Ordered by payoff-per-effort; none block Phase 2.

- [ ] **Wetness/drying map** — one extra fp16 channel, decays over time, refreshed by splats; multiplies advection strength/dissipation/curl-noise for dye. Dry paint stops moving; wet flows into it. THE feature separating paint tools from smoke demos; enables rewetting-brush and blow-dry tools for free. (Curtis 1997 watercolor; Stuyck 2017 mobile oil paint: https://graphics.cs.kuleuven.be/publications/SD2016RTOPOMH/index.html)
- [ ] **Edge darkening + granulation** — post-effect siblings of our heightfield shading: darken dye ∝ |∇density| (watercolor edge pooling); static paper-noise texture modulates density (pigment settling). Hours each, makes dye read as pigment-on-paper. (refs: https://johnowhitaker.github.io/inkwash/about, https://www.cs.nthu.edu.tw/~chunfa/pcm2004.pdf)
- [ ] **Pigment-space color mixing at splat time** — mix incoming splat color with existing dye in Kubelka-Munk space instead of additive RGB (blue+yellow=green). Use spectral.js (MIT, ~100 lines of math to port to GLSL: https://github.com/rvanwijnen/spectral.js). NOTE: Mixbox is CC BY-NC — license trap for commercial use; avoid unless cleared. Mixing at write time only — no latent storage needed.
- [ ] **Fake-bristle splatting** — N jittered sub-splats along stroke tangent with per-bristle color variation instead of one round splat; reads as "brush" not "airbrush". Pair with **canvas color pickup** (sample dye texture at brush pos into splat color — dirty-brush effect users love; readback-free). (concepts validated by NVIDIA WetBrush + David Li's paint: https://github.com/dli/paint)
- [ ] **Thick-paint material mode** — David Li's core insight: paint is a barely-moving fluid. Crank velocity dissipation + drop dt, keep pressure solve. Nearly free; fits the existing Material modes dropdown.
- [ ] **Particle-trail dry-brush layer** — small fp texture of Lagrangian particles advected by velocity, drawn as trails into dye accumulation; fibrous streaks grid dye can't produce. (~1 week; gpu-io fluid example: https://github.com/amandaghassaei/gpu-io)
- [ ] **Gravity from device orientation** (mobile) — tie a small gravity term to accelerometer; delightful, nearly free. (Stuyck 2017)
- [ ] **Check: dye:sim resolution ratio** — Dobryakov ships 8:1 (1024 dye / 128 sim); we default 2048/512 = 4:1. Lesson from shipped work: budget goes to dye res + advection quality, not sim res or more Jacobi. After MacCormack (1a), test lower sim res + higher ratio.
- [ ] **Check: fp16 linear-filtering fallback** — some Android GPUs lack linear filtering on half-float (WebGL2: `OES_texture_half_float_linear` equivalent); Dobryakov ships a manual 4-tap bilerp shader path. Verify what we do on such devices.
- Longer-term candidates (revisit only if wet-media features prove popular): MoXi lattice-Boltzmann ink mode (sumi-e feathering/tendrils — a second solver, 3+ weeks), shallow-water thick-paint height layer (Stuyck full pipeline). WebGPU confirmed NOT worth porting the current grid pipeline for; design new features texture-resident so they port mechanically if we ever need compute.

## Phase 2 — Full UI audit & overhaul

Working order: instrumentation → top nav left-to-right → sidebar top-to-bottom → layout/customization rework → component library → integration testing.

### Stage 0 — Instrumentation (do first; feeds every later stage)
- [x] Frame-time + long-task overlay + per-interaction jank capture — DONE 2026-07-09: js/08b-jank-monitor.js. Attributes dropped frames (adaptive to display Hz) + PerformanceObserver long tasks to the hover/click that caused them (mixer-strip channels, sidebar sections, drawers, stats panel), 600ms attribution windows with hover-storm merging. "UI Jank" section in Stats For Nerds; `JankMonitor.worst(n)` returns the ranked offender list — that list IS the Stage 1–2 work queue. `JankMonitor.report(n)` / `.reset()` for before/after measurement. Verified: synthetic 80ms stall during a section hover → captured, labeled, attributed exactly.
- [ ] Collect real data (Gabriel, local Electron app): play normally for a session with Stats For Nerds open, then run `JankMonitor.worst(15)` in devtools and paste the result — that ranks the Stage 1/2 audit order by actual damage.
- [x] Governor mis-stepdown check — RESOLVED 2026-07-09 without governor changes: the scary 82 drops/s ambient baseline was a monitor cadence artifact (fixed, see cadence block); real ambient is 0.74 drops/s over 18 min — the sim is healthy and the governor is not being fooled. Post-fix interaction rate fell 188 → 5.35 drops/s (~97%); residual offenders (all ≤40ms presentation blips, proc≈0): fader drag-start (#densityDissipation pointerdown 40ms), audio-scene-cycle clicks (32ms) — folded into Stage 1/2 line items, not emergencies.
- [x] 144Hz panel presenting at 60 — ROOT-CAUSED 2026-07-09: `disable-gpu-vsync` (electron-main.js) made Chromium's frame scheduler fall back to a software timer at the default 1/60s interval instead of following the display — the "uncap FPS" flags WERE the 60Hz cap (Windows was correctly set to 144 the whole time). Removed both legacy flags (59dac84); Electron 39 follows the real refresh natively. AWAITING relaunch confirmation: cadence should read gapMedian ≈ 6.9ms / displayHzEst ≈ 144, and simFps becomes honest (the 143.7 under the old config was snap-accounting over a real 60/s render rate). Note: at a true 144Hz + fpsCap 144 the sim computes 2.4× the frames — watch the governor absorb it or drop the cap to taste.

**Principle adopted 2026-07-09 (Gabriel): quality machinery (governor/battery/boot-ascent) may change FPS and fidelity, NEVER the aesthetic.** First application: sharpen kernel normalized to 2048-reference texels (resolution changes no longer alter the look) + "Ridges" slider makes the boot-ascent's coarse-emboss accident a deliberate effect + boot ascent now respects the persisted governor-off setting (settings-hydration race fixed in bootFactors). REMAINING texel-scale offenders to audit under the same principle: micro-detail (clarity/vibrance) kernel, MacCormack ringing scale (both change character subtly with dye res).

### Stage 1 — Top mixer strip, left to right
Current inventory (built by 20-mixer-layout.js `buildMixerStrip`):
`Brush | Curl (material-mode select as label) | Viscosity | Isolation | Multiply (value opens arm-colors dropdown) | Time | Density | Velocity || Color channel || Actions channel || Presets channel`

For EACH channel: hover-state perf (no reflow/repaint storms), open/close animation perf (transform/opacity only), event hygiene, visual consistency, UX issues.
- [ ] Fader channels ×8 — incl. the two embedded-widget oddities: Curl's material-mode `<select>` label (deferred resize hack, setTimeout(0)) and Multiply's arm-colors dropdown trigger.
- [ ] Color channel (swatches, quick palette).
- [ ] Actions channel (pause/clear/freeze/etc.).
- [ ] Presets channel.
- [x] Strip-wide: `syncBrush` 2s interval — no-op-write guard added 2026-07-09 (compares before writing; kills the periodic invalidation). Full event-driven replacement folded into Stage 4's Slider component (programmatic set-points get a single change pathway there). Audit for other polling loops still open.
- [ ] Strip-wide: tooltips, keyboard access, hit-target sizes.

### Stage 2 — Sidebar, top to bottom
Current inventory (built by `buildSidebar`, 20-mixer-layout.js:654):
`Focus → Mutate Shader → Audio → Branding → Layers → Animations → Brush → Kaleidoscope → Simulation → Effects → Colors & Palettes → Display → Recording → Export → Multi Artist → Settings` (+ dynamically appended: battery manager & other .collapsible-section converts)

For EACH section: collapse/expand animation perf, hover states, content audit (stale controls, inline styles, UX debt), does it belong at this position/grouping?
- [ ] Focus
- [ ] Mutate Shader (wiring uses setTimeout(200) + 100ms retry loop — replace with ready events)
- [ ] Audio
- [ ] Branding
- [ ] Layers
- [ ] Animations
- [ ] Brush
- [ ] Kaleidoscope
- [ ] Simulation
- [ ] Effects
- [ ] Colors & Palettes
- [ ] Display
- [ ] Recording (incl. rec-mini + full studio drawer interplay)
- [ ] Export
- [ ] Multi Artist
- [ ] Settings
- [x] Cross-section: compositor isolation — DONE 2026-07-09 from first JankMonitor field data (72 dropped frames on a sidebar hover pass, ZERO long tasks = compositor contention, not JS). #sidebar-right + #mixer-strip promoted to own layers (translateZ(0)) + contain: layout style on both and .sidebar-section. AWAITING Gabriel's re-measure to confirm the drop count falls; dropAt maps now name residual offenders per element.
- [x] Cross-section: section open/close animation — FIXED 2026-07-09, confirmed by Gabriel's Event Timing round (presentation delays up to 1.2s on toggles, proc=0 everywhere) + his own visual diagnosis. `transition: grid-template-rows` (and animated padding) re-laid-out everything below the section EVERY FRAME for 250–300ms. Removed at all 6 sites: .sidebar-section, .section-body (padding), .anim-settings(+inner), .collapsible-section (legacy styles.css), .path-layer-item (22-overlays — also relevant to the Stage 5 path-layers complaint), .layer-item-collapsible. Collapse now snaps in one layout; a 0.15s compositor-only opacity fade on the body carries the motion feel. AWAITING re-measure.
- [ ] Sidebar resize handle (initSidebarResize) — continuous resize triggers canvas reflow? Throttle/snap.

### Stage 3 — Sidebar customization + layout system rework
- [ ] Design: how users customize section order/visibility (drag-to-reorder? pin favorites? per-workspace presets?). Capture Gabriel's ideas here before building.
- [ ] Rework how 20-mixer-layout.js constructs the layout: today it *moves* DOM out of the hidden legacy `.controls` div after an 800ms splash timer — fragile load-order coupling (deferred wiring hacks in multiple modules exist because of it). Replace with declarative section registry (id, title, accent, builder, default position) + persisted user layout (save-load integration).
- [ ] Delete dead code: 17-mixer-ui-init.js and 18-layout-manager.js are marked "NOT LOADED" — remove (git history keeps them), plus buildBrandingSection_OLD_UNUSED in 20-mixer-layout.js.
- [ ] Retire the legacy hidden `.controls` markup in index.html progressively as Stage 4 components replace it (it's ~560 lines of inline-styled markup that exists only to be scavenged).
- [ ] Layout: main-area/canvas/sidebar/strip flex interplay, mobile mode, focus mode, ui-scale — one documented system instead of scattered rules across styles.css / 20-mixer-strip.css / 21-sidebar.css / init-responsive.css.

### Stage 4 — Modular input component library
Inventory of current input variants to consolidate (from index.html + dynamic builders):
range sliders (plain, slider-star, slider-blue, slider-orange, mixer faders), checkboxes (plain, checkbox-group, anim-switch toggles, mutation-lock chips), native selects (5+ inline-styled variants), color pickers (native input, swatch widgets), text inputs (palette/preset names, time-input mm:ss:ms), buttons (at least 6 inline-styled families incl. emoji-buttons, mp-btn-*, mutation-btn, action-*), custom canvas widgets (light grid, light-shift wheel, ss-origin picker), value displays, section headers, drawers/tabs (studio drawer), modals (delete-palette, hotkey overlay).
- [ ] Define the component set: Slider (w/ value display + accent), Toggle, Select, ColorSwatch, TextField, Button (variants), SectionHeader, XYPad (light grid / origin picker generalize to this), Drawer, Modal.
- [ ] Build as classic-script factory module (project convention — no framework) + one CSS file with design tokens (00-tokens.css already exists as the base).
- [ ] Migrate every control section-by-section (reuse the Stage 1–2 per-section checklists as the migration order). All new components must bind through ParamRegistry where a param exists.
- [ ] Kill all inline styles in index.html and dynamic builders as they migrate.
- [ ] Accessibility pass rides along: labels/for, focus states, keyboard operability.

### Stage 5 — Integration & performance testing
- [ ] **Path layers performance** (known offender — Gabriel: "doesn't play nice") — profile 24-path-layers.js interaction with the render loop; fix.
- [ ] Cross-feature matrix: audio-reactive + recording + multiplayer + collision + kaleido + path layers active simultaneously — frame-time budget per combination; document which combos degrade and let QualityGovernor see UI/feature load, not just sim load.
- [ ] Re-run Stage 0 instrumentation over the full audited UI: every hover/open/close interaction ≤ 1 dropped frame at 60fps with sim running.
- [ ] Regression sweep of Phase 1 sim features through the new UI (toggles, governor knobs, presets).

## Phase 3 — UX backlog (old issues)
- [ ] Capture Gabriel's running list of old UI issues here as they come up; triage into Stage 1/2 items above or standalone fixes.
