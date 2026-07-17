# UX Fixes — Triage & Execution Plan (2026-07-17)

> Companion to UX-fixes.md. Section A reviews the uncommitted working-tree sweep
> (23 files) that closed 13 items; Section B triages what remains with sized
> plans; Section C is the proposed execution order.

---

## A. Review of the uncommitted sweep (Gabriel, 2026-07-17)

**Items closed by the sweep:** 1.2 (replay speed), 3.2 (splat-out inertia), 5.1
(mobile sidebar flash — CSS-first hide), 5.2 (sidebar collapse persistence —
writer at 20:3803 + restore in 12:357), 6.1 (EQ scene + barSplat removal), 7.1
(collapse CSS selectors fixed), 7.2 (buttons → `.layer-action-row` in body),
8.1 (gate max-density stepper, 1–6 ±0.1), 10.1 (focus hotkey S→F), 11.1
(battery manager fully unlinked), 12.1 (label rename), 13.8 (mobile
vibrance/clarity boost with restore), 14.1 (fixed capture W/H).

**Verified clean:**
- Battery removal: zero orphaned references in live code (grep across js/
  excluding the unlinked file). Comments scrubbed in 05a/05c/08a/08b/29;
  `clearActiveProfile` calls removed from 04b/05h.
- barSplat removal: no remaining `applyBarSplat` callers. The splat shader
  (05b) keeps dead `barHalfW`/`barPoint` branches — harmless (05i:42 zeroes the
  uniform every classic splat), cleanable whenever 05b is next touched.
- 05k restructure correctly covers **all three row flavors** (raster rows from
  D2 included); collapse works for raster rows too since they share
  `.layer-item-header`/`.layer-item-body`. Drag-from-header still works; the
  raster `setActive` in-place highlight still finds `.raster-paint-btn`.
- EQ removal: every scene lookup in 30 is null-guarded (`scenes[name] ?`,
  `isScene()`), so old saves referencing `eq` degrade to no-scene safely.
- Gate stepper: persists via `gate.maxDensity` + preset snapshot; applies only
  while the gate is on. Correct.

**Follow-ups from the review (small, none blocking):**
1. **Stale `"eq"`** in `audioMode` options — js/01a-param-registry.js:136.
2. **Dead files on disk**: js/14-battery-manager.js, css/battery-styles.css —
   delete or move to an attic folder (they're unlinked; leaving them invites
   confusion).
3. **Focus hotkey**: `e.key === 'f'` misses CapsLock ('F'). Match the old
   behavior's limitation, but `(e.key==='f'||e.key==='F')` is a 1-liner.
   Conflict check passed — no other unmodified-'f' binding found.
4. **13.8 edge**: if the user changes Vibrance/Clarity *while in* mobile mode,
   `disableMobileMode()` restores the stale saved values over their change.
   Also verify settings-autoload order doesn't overwrite the boost on phones.
5. **5.2 timing**: restore runs in `loadSettings`; sections are static DOM so
   class survives the 800ms mixer-layout move — but dynamically-built sections
   (Studio drawer) may rebuild after restore. Needs one manual pass.
6. **3.2 watch**: longer tails delay `pendingArmAdvance` (arm colors advance
   when the tail dies). If arm cycling feels laggy after strokes, that's why.
7. **8.1**: `gateMaxDensity` is a window global, not a ParamRegistry key — the
   mutation engine and sim-slider machinery can't see it. Fine for now; fold
   into the registry if it ever needs mutation/presets-per-style.
8. **14.1**: fixed capture W/H stretches (no letterbox) when aspect differs
   from canvas. Say so in the UI hint, or add letterboxing later.
9. **Commit soon** (live-server rule): the tree currently mixes ~13 features
   in one uncommitted diff. Suggest committing as one "UX sweep" commit now
   (it's coherent and field-tested together), or per-area if bisectability
   matters later.

---

## B. Remaining items — triage

### 1.1 Replay ignores color modes — **small investigation + product decision**
The claim is only half-right. `processReplay` (05d:276) calls
`applyMultiSplatWith` **without** `exactColor`, so arm-color resolution DOES
run on replayed splats; what's baked in is the recorded base color (`ev.color`,
resolved at record time — deliberate faithful-replay design from 822e328).
Net behavior today depends on the arm-0 color mode at replay time.
**Plan:** 15-min harness check of all three modes (fixed/random/step) at 1x and
3x to characterize actual behavior, then decide: (a) keep faithful, (b) add a
"Live colors" toggle in Stroke & Replay that re-resolves via `resolveArmColor`
per event, or (c) always re-resolve. Recommend (b) — preserves both worlds.
**Files:** js/05d-input-replay.js, js/20-mixer-layout.js (toggle), js/12 (persist).
**Risk:** multiplayer remote strokes share the receiver-resolves convention —
keep the toggle local-only.
**Q for Gabriel:** should replay repaint with your *current* palette/mode, or
faithfully reproduce the stroke as painted? (Toggle = both.)

### 1.3 Recording honors "lock layer color" — **needs-design (tiny)**
No color-lock mechanism exists anywhere (grepped 24-path-layers, 03-recording).
The item presupposes one. **Plan:** add `lockColor` checkbox to recording-layer
UI (03); when set, `recRecordInteraction` stores the layer's configured color
instead of the live stroke color. ~half day once specced.
**Q:** which layer type did you mean — recording layers, path layers, or both?

### 2.1–2.3 Multiplayer sync — **verify first, then small fixes**
Code reality: `broadcastSplat` sends `{x,y,dx,dy,color,mult,radius}` (06:363,
33ms throttle) and the remote apply uses the recorded radius (06:435-443).
`broadcastReplayStroke` chunks full strokes (06:496). So 2.1/2.3 are *probably
working* since 822e328 — needs a 2-client session to confirm, not code.
**2.2 is real:** path-layer splats (`applyPathSplat`) never touch a broadcast
path — remote peers see nothing. **Plan:** throttle-batch path splats through
`broadcastSplat` with `exactColor` carried (needs a new flag on the wire
message + remote apply honoring it), or accept fluid-only v1 (matches the D0
multiplayer decision). Deploy note: web relay needs `npm run deploy` (still
pending from the 822e328 fix).
**Q:** is path-layer sync worth the wire format bump now, or park until D7?

### 3.3 Pressure iterations 12+ — **likely closable, 30 min**
Landscape changed: with Multigrid ON the Jacobi loop doesn't run
(`PRESSURE_ITERATIONS` only feeds the governor-capped Jacobi fallback,
05j:320). The "instability at 12+" report almost certainly predates the
PRESSURE_SCALE fp16 fixes and MG. Registry already caps at 50.
**Plan:** harness sweep 12/20/35/50 iterations with MG off, watch for NaN/
artifacts; expect "works as intended", close the item. If artifacts appear at
LOW counts, that's under-convergence, not a bug.

### 4.1 Multiple paths per path layer — **medium**
Confirmed single `points: []` per layer (24:235); draw/generators write it
directly (24:281,295-327); transforms clone it (24:1038,1152+).
**Plan:** `layer.paths = [{points}]` with `layer.points` kept as a getter alias
to `paths[0].points` for compat; "+ Path" button appends, draw mode appends
instead of replacing; `applyPathSplat` iterates paths sequentially (playhead
per path or one shared position? — start shared); persistence (24:1258 region +
12) migrates old `points` → `paths[[points]]`. Transform overlay operates on
all paths' points. ~a day incl. the migration.
**Q:** do multiple paths play simultaneously (parallel emitters) or in sequence?

### 6.2 Ferrofluid rework — **needs-design, largest item on the list**
Candidates, in increasing fidelity/cost:
(a) **Splat choreography tune-up** (current architecture): gentler continuous
pull + critically-damped spike envelopes on beats, settle via temporary
VELOCITY_DISSIPATION drop. Days, low risk, may still read as "splats".
(b) **Attractor forcing field**: a small analytic force term in the vorticity/
velocity pass (uniform array of 1-3 magnet positions) pulling dye radially —
real pooling emerges from the sim; beats modulate attractor strength/polarity.
Needs one shader uniform block + scene driving it. ~2-3 days, best
quality/effort ratio. Recommend this.
(c) **Height-field spikes**: fake normal-mapped spike field on top of pooled
dye (display-side), physical pooling from (b) underneath. Add-on to (b).
**Q:** approve direction (b)? Any reference footage of the look you want?

### 6.3/6.4 Audio composer UI — **large, mostly the final-UI-pass's job**
Mini timeline (27) is draw-only today; full editing in the sidebar means
segment hit-testing, drag-resize, overlap layout — component-library work.
**Plan:** defer both to the final UI pass EXCEPT two functional gaps worth
doing early: playhead indicator on the mini view (cheap) and segment duration
numeric input in the full view. Rest waits for componentization.

### 7.3 Collider masking education — **small**
Tooltip/infobox at collider creation points (23's createFrom* buttons + 05k
"Generate Collision Layer") + one hint row in collision controls linking the
workflow: mask/feather first → collider inherits the soft edge. Also mention
⤓ Mask (import → refine with brush → → Collider) which is now the cleanest
route. Copywriting > engineering.

### 7.4 Crisp collider edges — **verify, likely close**
D0.5 + four fuzz rounds + D3's brush-painted masks already rebuilt this
pipeline (adaptive band, 2× supersample, coverage/strength separation,
CURL_WALL_GATE). Remaining ceiling is SIM resolution, not edge processing.
**Plan:** side-by-side at sim 256 vs 512 with a mask-painted collider; if still
unsatisfying, the knob is `buildSketchDepth`'s ≤512 downsample cap and
DEPTH_EDGE_BAND, not new architecture. Close or convert into "raise caps".

### 7.5 Drop-zone / drag UX overhaul — **medium, UI-pass adjacent**
Auto-scroll while dragging (rAF loop reading pointer Y vs panel bounds),
collapse-others-on-drag (add class on dragstart, remove on dragend), better
drop-target highlight. No Electron-CSS hazards if transform/height based.
Could ship independently of the component library; fine either side.

### 7.6 Collider performance — **measure first**
Known suspects, in order: (1) live-binding readback (already coalesced 120ms,
stroke-end only); (2) `_doUpdateObstacle` full recomposite on every control
input tick (rAF-throttled but still per-tick during slider drags — add a
trailing 100ms debounce for slider `input`, recomposite once on `change`);
(3) `updateLayerZIndices` reapplying `applyLayerMask` per layer on EVERY
reorder/render (05k:408-416) — the actual likely jank source, it re-decodes
images. **Plan:** JankMonitor session with 3+ collision layers; fix (3) by
skipping mask reapply when nothing mask-relevant changed; (2) as described.

### 9.1 Underbar — **needs-design, defer to UI pass**
Context-sensitive settings strip under the mixer. Overlaps Stage-4 component
library head-on; building it pre-componentization means building it twice.
**Plan:** park; write the design brief during the UI pass. If one concrete use
case is urgent (which settings did you want there first?), do a single
hard-coded instance for that case only.
**Q:** what would the first underbar contents be?

### 13.1–13.4 Mobile gestures — **medium, one shared foundation**
Build ONE gesture layer in 05d's touch path: 2-pointer tracking with
role-dispatch (pinch distance → brush size via the existing brushSize slider
drive; two-finger vertical drag → replayTimePeriod; both with on-canvas
indicator toast). 13.4: add a "Clear" button to gate editors (30) — dbl-click
is unreliable on touch, button is honest. Gesture layer must not fire during
single-finger painting and must yield to pinch-zoom-disabled canvas
(touch-action review). ~1-2 days for the layer + all three consumers.

### 13.5 Host locks settings — **medium**
Room-level lock EXISTS (host-only join lock, 06:137/244). Settings lock is
new: a `sys-settingsLock` message; receivers set `window.__mpSettingsLocked`;
gate writes at the ParamRegistry/slider-binding layer (single choke point in
05h + 20 rather than disabling every control individually) + banner.
**Q:** lock everything except painting, or a curated subset?

### 13.6 Slider touch targets — **small** (CSS: min 28px hit areas, bigger
thumb on coarse pointers via `@media (pointer: coarse)`).

### 13.7 Force vertical layout — **small-medium**: the new
`(max-height:500px)&&(max-width:1200px)` media query (21-sidebar) already
catches landscape phones for the sidebar; audit remaining horizontal paths in
13-mobile-mode + strip CSS under the same query.

---

## C. Suggested execution order

1. **Commit the current sweep** (one commit), then the follow-up nits
   (A.1–A.3: registry string, dead files, hotkey case) as a second commit.
2. **Close-or-verify batch** (harness/manual, ~half day): 3.3, 7.4, 2.1/2.3,
   1.1 characterization, 5.2 timing test, 13.8 device check.
3. **Small function fixes**: 7.3 education copy, 13.6 slider targets, 13.7
   layout audit, 7.6 measurement + the updateLayerZIndices fix.
4. **Medium features**, each atomic: 13.1-13.4 gesture layer; 4.1 multi-path;
   1.3 color lock (after the one-line spec); 13.5 settings lock; 2.2 path-layer
   sync (or park for D7); 7.5 drag UX.
5. **Design-first**: 6.2 ferrofluid (approve direction b), then build.
6. **Defer to final UI pass**: 6.3/6.4 (except playhead + duration input),
   9.1 underbar.

Open questions for Gabriel (one-liners): 1.1 faithful-vs-live replay colors?
1.3 which layer type? 2.2 now or D7? 4.1 parallel or sequential paths?
6.2 direction (b)? 9.1 first contents? 13.5 lock scope?
