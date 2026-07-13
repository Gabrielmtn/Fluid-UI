# Fluid-UI Roadmap

Original goals (agreed 2026-07-09): **sim quality → UI performance audit → UX overhaul.**
Rewritten 2026-07-13 after Phase 1 + audit Stage 0 shipped. History/details: git log + this file's history.

**Standing principle:** quality machinery (governor / battery manager / boot ascent) may trade FPS and fidelity — NEVER the aesthetic. Enforced by `LookWatchdog` (console-logs any look-state change with timestamps); `JankMonitor` (`summary()`, `worst(n)`, cadence block) measures every perf claim before/after.

---

## ✅ Completed (2026-07-09, see git log for details)

- **Phase 1 sim quality, all core items**: RK2 backtrace · MacCormack crisp advection ("Crisp Advection") · curl-noise Swirl slider · obstacle-aware projection (flow deflects around collision masks) · multigrid pressure V-cycle ("Multigrid Pressure", 3.3× more incompressible at ~⅓ the cost) · "Ridges" slider (res-independent sharpen kernel, 0 = off default).
- **Phase 2 Stage 0 instrumentation + emergencies**: JankMonitor + LookWatchdog · 97% interaction-jank reduction (collapse-animation layout thrash at 6 sites; compositor isolation) · 144Hz unlock (the "uncap" vsync flags WERE a 60Hz pin) · frame-rate-honest settle ease-out · governor effect-shedding behind opt-in + settings-hydration races fixed · resize-settle deadlock + init-size race fixed (monitor moves track correctly) · dead-code sweep (~1,400 lines) · micro-detail kernel normalization · mutation wiring cleanup.

---

## Phase 1 closeout (small, mostly Gabriel-side)

- [ ] **1d. Regression pass** on the local build (the test plan): settle-banding soak on slow presets, freeze-mode preservation, Gate overflow, collision-mask feel, overflow/edge-absorb mode, recording/replay, video export, multiplayer session, web + mobile builds at their defaults.
- [ ] **Preset retune**: multigrid converges hard, so `PRESSURE_DISSIPATION < 1` no longer double-duties as a stabilizer — drift it toward ~0.95 and taste-check all 8 presets (Marble/Thick most likely to read differently).
- [ ] **Mobile/real-GPU perf check** of the multigrid pyramid (~40 small draws/frame on tile GPUs; toggle defaults off there — verify that's right).
- [ ] Watch items (no action unless seen): fp16 pressure headroom on violent presets (observed max ~5.2k vs 65k limit); MacCormack checkerboard dithering (add soft-revert if it ever shows); 144Hz cadence confirm (`JankMonitor.summary().cadence` → gapMedian ≈ 6.9ms).
- [ ] Optional future experiment: velocity MacCormack (livelier vortices, changes preset feel — separate toggle).

## Phase 2 — UI audit (Stages 1–5 remaining)

### Stage 1 — Top mixer strip, left to right
`Brush | Curl | Viscosity | Isolation | Multiply | Time | Density | Velocity || Color || Actions || Presets`
- [ ] Per-channel audit (hover perf, event hygiene, visual consistency, UX): the 8 faders — incl. the material-mode `<select>`-as-label resize hack (Curl) and the arm-colors dropdown trigger (Multiply) — then Color, Actions, Presets channels.
- [ ] Residual jank blips from field data: fader drag-start (40ms presentation, `#densityDissipation` pointerdown), audio-scene-cycle clicks (32ms).
- [ ] Strip-wide: tooltips, keyboard access, hit-target sizes; audit for remaining polling loops.

### Stage 2 — Sidebar, top to bottom
`Focus → Mutate → Audio → Branding → Layers → Animations → Brush → Kaleidoscope → Simulation → Effects → Colors & Palettes → Display → Recording → Export → Multi Artist → Settings`
- [ ] Per-section content audit (stale controls, inline styles, UX debt, grouping/position) — all 16 sections.
- [ ] Sidebar resize handle: throttle/snap check (continuous drag vs canvas-area ResizeObserver churn).

### Stage 3 — Layout system rework (the architectural rock)
- [ ] **Section registry**: replace the 800ms-splash-timer DOM scavenging from hidden `.controls` with a declarative registry (id, title, accent, builder, default position) — kills the load-order coupling that spawned the setTimeout/retry wiring hacks.
- [ ] **Customization design** (needs Gabriel's ideas first): section reorder/visibility — drag? pinned favorites? workspace presets? Persisted via save-load.
- [ ] Retire the legacy hidden `.controls` markup in index.html progressively (~560 lines that exist only to be scavenged).
- [ ] One documented layout system (main-area/canvas/sidebar/strip flex, mobile mode, focus mode, ui-scale) instead of rules scattered across 4 CSS files.

### Stage 4 — Modular input component library
- [ ] Define the set: Slider (value display + accent), Toggle, Select, ColorSwatch, TextField, Button variants, SectionHeader, XYPad (light grid / origin picker unify), Drawer, Modal.
- [ ] Build as classic-script factory + tokens CSS (00-tokens.css is the base); all components bind through ParamRegistry where a param exists.
- [ ] Migrate section-by-section (Stage 1–2 checklists = the migration order); kill inline styles as controls migrate; slider component absorbs the syncBrush-style programmatic-update pathway.
- [ ] Accessibility rides along: labels/for, focus states, keyboard operability.

### Stage 5 — Integration & performance testing
- [ ] **Path layers** (Gabriel's named offender): profile 24-path-layers.js against the render loop; collapse-animation fix helped — measure what remains.
- [ ] Cross-feature matrix: audio-reactive + recording + multiplayer + collision + kaleido + path layers simultaneously; frame budget per combo.
- [ ] Final sweep target: every hover/open/close ≤ 1 dropped frame with the sim running (JankMonitor before/after).
- [ ] Regression: Phase 1 sim features through the new UI (toggles, governor knobs, presets, save/load).

## Phase 3 — UX backlog
- [ ] Capture Gabriel's running list of old UI issues; triage into Stage 1/2 items or standalone fixes.

---

## 🧊 Future shelf (deliberately deferred 2026-07-13 — revisit when we want new creative features)

Phase 1.5 painterly backlog, research-sourced (sources in this file's git history):
wetness/drying map (the paint-vs-smoke feature; one fp16 channel) · edge darkening + granulation · Kubelka-Munk pigment mixing via spectral.js (MIT — avoid Mixbox, CC BY-NC) · fake-bristle splatting + dirty-brush color pickup · thick-paint material mode · particle-trail dry-brush layer · gravity from device orientation (mobile) · dye:sim ratio experiment (Dobryakov ships 8:1, we run 4:1) · fp16 linear-filtering fallback check for old Android · MoXi ink mode + shallow-water paint (big; only if wet media proves popular) · WebGPU: confirmed not worth porting the grid pipeline; keep new features texture-resident.
