# Prompt — Rework Recording ⇄ Animations

*v3, 2026-08-23. Supersedes v1. Paste this whole file as the task.*

---

## 0. What changed since v1, and why

v1 was written from a reading of the recorder. v2 followed a full audit of it, and
**six things in v1 were wrong.** They are corrected in place below; listed here so
nobody re-derives them:

| v1 said | Actually |
|---|---|
| "Recorder state crosses the wire" (§6) | **False.** Replay calls `multiSplat(..., shouldBroadcast=false)` — hard-coded at [05g:294](js/05g-arm-colors.js:294). Only `recMode`/`recPlaybackSpeed` appear in multiplayer, both deliberately local ([06:338](js/06-multiplayer.js:338)). R10 carries zero relay risk. |
| R10: "shape id isn't in the schema, add it" | **Wrong fix.** Replay is gaussian *by construction*: `applyMultiSplatWith(…, exactColor=true)` → `__brushTipOn = !exactColor` ([05g:259](js/05g-arm-colors.js:259)) → both the tip ([05i:86](js/05i-sim-stats.js:86)) and the custom stamp ([05i:193](js/05i-sim-stats.js:193)) are gated off. Adding the field changes nothing. |
| R8: "reuse 24-path-layers.js" | **Would destroy every recording.** Path layers are *arc-length* parameterised (`position` 0–1 of total length, points carry no time); recorder interactions are *timestamped*, and the timing is the content. Round-tripping silently applies AE's "rove across time" to every take. |
| §2 fact 1: "tap `splat()` to bake built-ins" | **Wrong tap point.** 04c calls bare `splat()`; 04e calls `multiSplat(…)` which expands one dab into N arm splats *before* splat(). A splat() tap captures 04e post-arm and replay re-expands it — 64 dabs per dab at Multi-Brush 8. Tap `multiSplat`'s entry instead. |
| R5: "may be a `clientWidth === 0` measurement" | **Disproven.** Every open does a synchronous `classList.add('open')` before `recRenderUI()`. Don't spend budget there — it's pure geometry. |
| R7: "prefer baking over hand-authoring" | **Half the work already exists.** `recBuiltinPresetGenerators` ([03:1387](js/03-recording.js:1387)) already maps Smash / Jellyfish / Portrait / Vortex to recorder-native generators emitting real interaction arrays. Start there. |

v2 also added four requirements the first pass missed entirely (R12–R15), a **§4 list of
bugs that must be fixed before any of this is built**, and a hard control budget.

**v3 adds two lenses nobody had run.** Every tool studied up to that point — After
Effects, Motion, Animate, Resolve, DAW automation, Procreate — assumes a *re-renderable
timeline*, the exact thing fact 1 says this app can never have, which is why the brief
kept generating requirements that had to be walked back. The two categories that actually
match this app's medium say:

- **VJ / clip-launch software** (Resolume, Ableton Session View, hardware loopers) — the
  only mature category whose output is genuinely real-time, destructive and unscrubbable.
  It resolves the panel-vs-drawer tension, defines retrigger, and supplies a precedented
  answer to irreversibility. → §3.5, R1, R11, R14.
- **The direct consumer set** (Dobryakov's fluid sim, Bloom, Patatap, Sandspiel,
  Weavesilk/Silk, Powder Toy, Townscaper) — this app's actual neighbours. It **contradicts
  my own recommendation** on look-vs-motion, and it carries a strategic warning about how
  much budget this feature deserves at all. → §9 Q6, §11.

And one genuine unlock both earlier passes missed: **fact 4** below.

---

## 1. What I want

Recording and Animations are currently two unrelated features that happen to sit near
each other. Make them **one feature**: an *Animation* is a saved recording — layers with
their own timings and loop behaviour, saved and recalled the way presets are, played
from a button.

The test everything is judged against:

> **A first-timer records a swirl, sees where it went, tweaks it, and saves it —
> without a tutorial.**

---

## 2. Where this lives today (verified — don't re-derive)

| Thing | Location |
|---|---|
| Recorder core | [js/03-recording.js](js/03-recording.js) — 1667 lines |
| Capture hooks | [05d:521](js/05d-input-replay.js:521), `:758`, `:830`, `:1120`, `:1159`; [05j:339](js/05j-update-loop.js:339) |
| Interaction schema | [03:301](js/03-recording.js:301) — `{timestamp, x, y, vx, vy, color, mult, radius}` |
| Layer model | [03:176](js/03-recording.js:176) |
| **Recorder-native built-in generators** | [03:1233-1392](js/03-recording.js:1233) — `recGenSmashPreset`, `recGenJellyfishPreset`, `recGenPortraitPreset`, `recGenVortexPreset`, indexed by `recBuiltinPresetGenerators` |
| Full recorder markup | [index.html:1209](index.html:1209) — `#recDrawer`, **shared with the Audio Composer via `.studio-tabbar`** |
| Mini recorder | `#recMini` — a *second* transport with its own Record/Pause/PlayAll/Max/prev/next |
| "Preset" UI to rename | [index.html:1256](index.html:1256); storage `recPreset.<name>` ([03:1477](js/03-recording.js:1477)) |
| Drawer geometry | [css/styles.css:977](css/styles.css:977) — `.rec-drawer{height:38vh}` |
| Built-in animations | [04c-anim-burst.js](js/04c-anim-burst.js) (bare `splat()`) · [04e-anim-portal.js](js/04e-anim-portal.js) (`multiSplat(…, exactColor=true)`) |
| Brush shapes | [js/33-brush-shapes.js](js/33-brush-shapes.js) — `config.BRUSH_SHAPE_ID` |
| Correct in-canvas overlay pattern | [34-mandala-mode.js:216-245](js/34-mandala-mode.js:216) — the only correctly-registered persistent overlay in the app; inherits Zoom View's transform for free |
| Correct drag lifecycle | [26-layer-transform.js](js/26-layer-transform.js) — pointerdown → setPointerCapture → snapshot → recompute-from-snapshot → Esc cancels |
| Point-to-segment distance (for hit testing) | `perpendicularDistance` [24:329](js/24-path-layers.js:329) — written for Douglas-Peucker, usable unchanged |
| Replay dab with tip/shape pinned | `emitReplayDab` [05d:450-524](js/05d-input-replay.js:450) — the template for R10 |
| Undo providers | [05n:212-214](js/05n-hotkeys-init.js:212) — three registered, **zero from the recorder** |

**Four facts that shape the design:**

1. **You cannot scrub a fluid sim backwards.** Stateful and destructive. No re-simulation,
   no re-renderable timeline. Every professional tool in §5 assumes one — that's why
   this brief keeps having to walk their idioms back.
2. **Bake built-ins at `multiSplat`'s entry** ([05g:244](js/05g-arm-colors.js:244)), not at
   `splat()` — and only behind an explicit bake mode with an origin tag (see §4.3).
   For 04c you must first route its eight bare `splat()` calls through `multiSplat`,
   which is worth doing anyway (04c currently bypasses `__unsavedWork` entirely).
3. **Playback is unundoable.** `UndoManager` is a UI-state snapshot stack with no concept
   of the dye field. Firing an Animation permanently alters the painting.
4. **There is one legal place to re-render: an offscreen scratch sim.** Fact 1 says you
   can't re-render *the user's canvas*. It does not say you can't run a recording from a
   blank state into an FBO nobody is looking at. That single move makes three things
   legal that both earlier passes had rejected as impossible: **auto-generated thumbnails**
   (replay into the scratch sim, freeze the result — R6), **safe preview/cue** (a selected
   recording animates in the drawer, never touching the painting), and **hover-audition**
   (previously rejected outright). Thumbnail generation and preview are the same code
   path. Build it once, early — it is load-bearing for R1, R6 and R12.

---

## 3. The mental model

> **The canvas edits WHERE. The timeline edits WHEN. An Animation is both, saved
> under a name — and firing one is a performance, not an edit.**

Dragging a point on the canvas must never change timing; dragging on the timeline must
never change position.

### 3.5 — Fire surface vs edit surface *(new in v3; resolves the R1-panel-vs-R5-drawer tension)*

Every clip-launch tool separates the surface you *perform* from the surface you *author*,
because they cannot share one. TouchDesigner draws the hardest version (Perform Mode
renders one window; you edit in Designer Mode). Resolume and Ableton draw a softer one in
a single window: the grid is permanently the top half, and the panels below always
describe the **selected** clip. Resolume splits the tile physically — the thumbnail
launches, the name handle below it selects.

Adopt that split:

- **The Animations panel is the grid.** Clicking a tile body **always fires** — zero
  exceptions, zero modals, no modifier-key alternate meanings.
- **A thin name strip / caret at the tile's bottom edge selects** it into the drawer
  *without firing*.
- **The drawer is the properties editor for the selected tile** — rename, thumbnail, loop
  behaviour, trigger style, preview, path editing. **It contains no play button at all.**
- **Emitter slots.** Introduce 2–4 slots; each holds at most one running recording, and
  firing into an occupied slot stops the incumbent. This is what makes retrigger
  well-defined, and it bounds splat cost deterministically (N slots × splats/frame is the
  whole load) — which matters more here than in a video mixer, because inbound splat rate
  is what will tank the sim. Neither Resolume nor Ableton has any concept of two instances
  of one clip running at once; you get concurrency by adding a *visible, countable* layer.

**Two surfaces you can fire from is the failure mode.** Mid-performance you can't tell
which is authoritative, which is running something, or whether the drawer's play button
replaces the grid's running clip or stacks on it. "What is currently writing to my canvas"
must be readable from one place. This also settles the mini recorder question in R15.

---

## 4. Fix these first — they are bugs, not features

Every one verified by reading the code. Several make v1's acceptance tests unpassable,
and two are live data-loss paths. **None of R1–R15 should be built on top of them.**

**4.1 — Every per-layer button in the drawer is dead.**
[03:680](js/03-recording.js:680): `if (e.target.closest('input, textarea, select, button')) return;`
sits *above* `const target = e.target.closest('[data-action]')`. On a button click
`e.target` **is** the button, so all six per-row controls — visibility, play, loop, mask
enable, edit mask, clear mask — hit the guard and return. Only the row background
dispatches. [24:728-735](js/24-path-layers.js:728) does it correctly: resolve
`[data-action]` first, apply the input guard only in the no-action fallback.
*There is no working baseline in the layer list to preserve.*

**4.2 — Recording twice into a layer corrupts the take.**
`recStartRecording` never clears `interactions` and sets `recordingStartTime =
Date.now() - playbackPosition`. With `playbackPosition` at 0 (the normal case), the
second take's timestamps restart at 0 and are pushed onto an array holding larger ones —
then `recUpdatePlayback` binary-searches it assuming ascending order. Symptom: "chunks
of my recording don't play back." Same corruption from F9-then-Shift+F9: Shift+F9 calls
`recStartRecording()` directly without cancelling the pending countdown, which fires a
second one 1–3s later mid-take. Establish a sorted-by-timestamp invariant, and make
every arm path cancel the countdown unconditionally.

**4.3 — In a multiplayer room, your peers' brushwork is recorded into your layer.**
`emitReplayDab` ends with an unconditional `recRecordInteraction(x, y, dx, dy, col)`
([05d:521](js/05d-input-replay.js:521)) and is the common sink for *inbound peer strokes*
([06:1519](js/06-multiplayer.js:1519) → `scheduleStrokeReplay`). Arm Record in a Swirl
Together room, let a peer paint, stop — their dabs are in your layer, and under R1 they
get saved into a named Animation. Fix: tag origin once at `multiSplat`'s entry
(`__splatOrigin ∈ {input, replay, peer, anim:<id>}`), set and restored in the same
try/finally that already handles `__brushTipOn`; `recRecordInteraction` accepts `input`
only. **This must land before any change to the capture surface.** Same root cause as
"an Animation fired mid-recording bakes itself into the take", which needs no
multiplayer at all.

**4.4 — The Settings "Clear" button deletes every saved recording while its dialog
promises it won't.** `clearExceptPresets()` preserves only `fluidUI:preset.`
([09:271-284](js/09-settings-manager.js:271)); saved recordings are `fluidUI:recPreset.*`,
which matches the removal prefix and misses the preserve prefix. The confirm text reads
*"Your presets are kept."* ([12:508](js/12-save-load.js:508)). Meanwhile the live layer
array rides the settings snapshot as `recordedLayers`, and the quota degradation ladder
strips `recordedLayers[].timeline.interactions = []` **first**, before depth data and
layer images, with only a `console.warn`. The situation is exactly inverted from the
persistence contract: the ephemeral working set is snapshotted, the named saves are not.
*Check `brush.shapes` and `palettes.*` against that same prefix while you're there.*

**4.5 — A save that exceeds quota reports success.**
`recSaveActiveLayerAsPreset` ignores `sm.set()`'s return, which is `false` on
QuotaExceeded ([09:135](js/09-settings-manager.js:135)). Copy `BrushShapes.add()`'s
pattern ([33:291](js/33-brush-shapes.js:291)), which checks and surfaces *"Saved only for
this session"*.

**4.6 — Built-in animations bypass the Take Turns paint gate.**
04c/04e contain no `canPaint`/`isWatcher` check. A watcher who is blocked from painting
can fire Smash or Vortex right now. Nothing crosses the relay, so it doesn't vandalise
the shared canvas — it permanently desynchronises *their* canvas from everyone else's,
in a sim with no resync path. R1 multiplies this from 8 fixed buttons to unbounded
user content.

**4.7 — Velocity is stored in raw canvas pixels while position is normalised.**
[03:301](js/03-recording.js:301) stores `x: x/canvas.width` but `vx: dx` — and `dx`
originates as `(coords.x - pointer.x) * 10.0` in canvas px. `broadcastReplayStroke`
normalises velocity for the wire precisely because it must; the recorder doesn't. So a
recording replays with correct positions and wrong forces at any other window size.
Normalise at capture, denormalise at replay, version the schema, and store `cw, ch` on
the saved Animation envelope to up-convert legacy records. **Aspect** needs its own
decision: x and y are normalised independently, so a 16:9 recording replays on 4:3 as a
non-uniform stretch — letterbox the Animation's coordinate frame, or accept it.

**4.8 — Recorder masks are 100% inert, and a quota bomb if they ever aren't.**
[15-layer-masking.js](js/15-layer-masking.js) reads `window.recLayers` in eight places;
`recLayers` is a top-level `let` in a classic script ([02:352](js/02-palettes.js:352)) and
is therefore **not** a window property. `checkMaskPoint()` always takes the `!layer`
branch and returns true. Separately, recorder masks serialise raw — a `sam-mask`
`Uint8Array` becomes `{"0":…,"1":…}` at ~8-10 bytes/pixel, so one 400×400 Smart-Select
mask is ~1.3MB of JSON. Decide: wire it (note `recLayers` is *reassigned* at 03:1192 and
05n:496, so a one-time `window.recLayers = recLayers` goes stale) or drop masks from the
recorder model — but fixing 4.1 without deciding this opens a mask editor against a
layer it can never find.

**4.9 — Two vestigial things not to trust.** `recThrottledRefreshUI` and its four
tuned-looking constants have **zero callers** anywhere — 35 lines of fiction; don't port
them forward as if measured. And `body.rec-countdown #canvas-area::after` renders
`content: '⏱ ...'` — a literal static ellipsis ([styles.css:1157](css/styles.css:1157)).
The countdown digit exists only as the Record button's `textContent`, inside a drawer
that can be closed.

---

## 5. Control budget — the hard rule

The research produced far more good ideas than this audience can absorb. So:

> **The recorder's first layer holds exactly: Record, Stop, Play, the loop-length chips,
> and the layer list (name · number badge · visible · play). Everything else lives behind
> one per-row expander, or is cut. Any new control must name the control it displaces.
> Unmatched additions are rejected by default.**

Collapsed layer row: **≤ 72px**, and that is an acceptance criterion checked
continuously, not at the end. (The R5 arithmetic below only fails because today's card
is 216px.)

**Lexicon, fixed in R2's rename pass.** *Animation* = the saved thing. *Layer* = one
recording inside it. *Path* = the visible line. **One-shot** and **Loop-N** are the only
loop words — see R11; ping-pong and reverse are cut, so the path-layer vocabulary is no
longer the model. Banned from all user-facing text: *take*, *overdub*, *punch*, *latch*,
*roving*, *filmstrip*, *reverse*, and **arm** — which already means the Multi-Brush arms
in this codebase. "Re-record this layer" and "Add to this layer", not "Replace take" and
"Overdub". Consider **Perform** rather than Play for the fire verb: the consumer lens
found that when this category ships a moving thing, it exists to be *filmed*, not edited,
and "perform" sets that expectation without promising a document.

---

## 6. UX research — what survived

Two passes: six lenses on professional motion/recording tools, then three adversarial
critics, then two lenses the first pass missed. What survived:

**a. The canvas edits where, the timeline edits when.** Apple Motion: dragging a keyframe
horizontally changes *when*, never *what*. → §3, R5, R8.

**b. Two-way selection.** Adobe Animate lets you pick a motion path from the stage *or*
its timeline row. → R4, R8.

**c. Rough by hand, fine by widget.** Direct manipulation is poor at precision. → R8's
nudge and numeric field — which is also R8's only keyboard-accessible path.

**d. Never block the moment between takes with a name dialog.** Stop lands the recording
already named; naming is post-hoc inline edit. Never refuse a collision — auto-bump and
offer undo. (Today a collision returns the string `'exists'` and dead-ends.) → R1, R2.

**e. Non-destructive by default, and the destructive verb gets its own place.** DAWs ship
Read/Touch/Latch/Write because a physical fader must serve both reading and writing on
one control — and the entire practitioner literature is people leaving a track in Write
and destroying a pass. **Do not import the modes.** Record always makes a new layer;
"Re-record this layer" lives in the row's ⋯ menu. → R3.

**f. Small multiples are only comparable on a shared scale.** Fit-to-bbox thumbnails make
a 20px twitch and a full-canvas sweep look identical — Excel's sparkline bug. Every path
preview renders the full canvas rect in normalised coords. → R6.

**g. Identity is a number, not a second colour.** A CVD-safe hue ring was proposed and
rejected: the canvas is a full-spectrum dye field so every hue is invisible against some
part of it, and giving a red swirl a blue identity chip means a first-timer's first
question is "why is my red swirl blue?" Use a numbered badge plus a dark-cased
dual-stroke, which survives any background for free. → R4.

**h. Teach by pre-loaded example, never by a tour.** Song Maker ships songs; Game Builder
Garage ships a finished game you take apart; Scratch ships "See Inside". On Steam a tour
is a Skip button pressed before the player has a reason to care. → R7.

**i. `prefers-reduced-motion` freezes the chrome, never the canvas** — WCAG names
animation-preview as the essential exception. Ship an in-app toggle too; desktop Steam
users often have no OS setting, and `fluidui.photoSafe` is the precedent.

Sources:
[Apple Motion — keyframes](https://support.apple.com/guide/motion/modify-keyframes-in-the-timeline-motn1474b524/mac) ·
[Apple Motion — paths](https://support.apple.com/guide/motion/modify-animation-paths-motn14748beb/mac) ·
[Adobe Animate](https://helpx.adobe.com/animate/using/editing_the_motion_path_of_a_tween_animation.html) ·
[AE Motion Sketch](https://www.richardharrington.com/blog/2025/11/18/draw-your-animation-with-motion-sketch-in-adobe-after-effects) ·
[AE roving keyframes](https://www.provideocoalition.com/after-effects-hidden-gems-weekly-roving-keyframes/) ·
[Blender motion paths](https://docs.blender.org/manual/en/latest/animation/motion_paths.html) ·
[Cavalry motion paths](https://cavalry.studio/docs/user-interface/menus/window-menu/viewport/motion-paths/) ·
[Procreate Dreams — performing](https://help.procreate.com/dreams/handbook/keyframes-and-performing/performing) ·
[Procreate — "recorded motion plays back differently"](https://help.procreate.com/articles/DEJu8e-recorded-motion-is-playing-back-differently-from-how-it-was-performed) ·
[Ableton — recording new clips](https://www.ableton.com/en/manual/recording-new-clips/) ·
[Ableton — comping](https://www.ableton.com/en/live-manual/12/comping/) ·
[Pro Tools automation](https://www.soundonsound.com/techniques/automation-facilities-pro-tools) ·
[Unreal Take Recorder](https://dev.epicgames.com/documentation/en-us/unreal-engine/take-recorder-in-unreal-engine) ·
[Figma variants](https://help.figma.com/hc/en-us/articles/360056440594-Create-and-use-variants) ·
[Chrome Music Lab Song Maker](https://www.useallfive.com/work/chrome-music-lab-song-maker) ·
[Tufte on sparklines](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/) ·
[Sparklines are not scaled together](https://www.mrexcel.com/excel-tips/sparklines-are-not-scaled-together/) ·
[WCAG 2.3.1 three flashes](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) ·
[Xbox accessibility guideline 118](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118) ·
[NN/g on modes](https://www.nngroup.com/articles/modes/)

### Anti-patterns — proposed, and rejected with reasons

- **A Record Mode dropdown (New / Overdub / Replace).** Makes the transport's meaning
  depend on hidden state — the exact failure DAW automation modes are cautionary tales
  about. Tools with a real take model removed the choice from the transport entirely.
- **A draggable scrub head on the path strip.** A draggable head is a promise of
  re-simulation, and thirty years of muscle memory says dragging shows that moment. It
  can only move a cursor here, which reads as broken rather than as a design limit. Worse:
  if scrubbing fires replay splats, arrow-key autorepeat (~30/s) is a burst generator
  aimed at the group least able to anticipate it.
- **Fit-to-bbox thumbnails.** See (f).
- **Re-running the sim into a small FBO for thumbnails.** Violates fact 1; also not
  reproducible across GPUs (ANGLE fp16 rounding is a known issue here), so the same
  recording yields different strips on different machines; also puts 12+ live-updating
  cells inside one 10° visual field, which WCAG combines.
- **Marching ants / blinking selection, or a hue-per-layer ring.** The overlay is a DOM
  canvas composited *above* the WebGL blit — **outside PhotoSafe's measured framebuffer**,
  so the app's own limiter cannot see it, and WCAG 2.3.2 has no small-area exemption.
- **Onion-skinning by replaying ghost dye.** In Procreate the ghost is a stored raster.
  Here its only medium is the sim, so drawing the ghost is a permanent edit that perturbs
  the take being recorded. Borrow the colour convention, never the mechanism.
- **Hover-to-audition an Animation *into the user's canvas*.** Ableton Hot-Swap works
  because audio is non-destructive; auditioning here would permanently splat into the
  painting. *Partially rescinded in v3:* fact 4 makes auditioning legal **into the
  offscreen scratch sim** — which is also how Resolume does it, with a preview monitor on
  a distinct, deliberately less prominent hit target than the launch one. Two safe
  substitutes, use both: hovering a row draws its stored path as a ghost overlay (zero sim
  writes, doubles as R4's preview), and selecting a tile animates it in the drawer via the
  scratch sim.
- **Generalising the alternate into `variants[]`, or shipping folders.** The trigger
  surface is one button with two mouse buttons, so variant #3 is unreachable by design.
  Procreate 5.4 shipped folders and produced migration states where users had both
  "Procreate Library" and "Procreate Library 1".
- **Bare arrow keys for R8's nudge.** [05n:426](js/05n-hotkeys-init.js:426) binds
  ArrowUp/Down to layer cycling whenever `recEnabled`. Use Shift+Arrow.
- **A longer/bigger countdown, or a coach-mark tour.** See (h). A large high-contrast
  countdown flashing over a bright canvas is also the stimulus class PhotoSafe exists for.

---

## 7. Requirements

R1–R11 are yours from v1, corrected. R12–R15 are gaps both the brief and the first
research pass missed entirely. Order is the build order.

### R1 — An Animation is a saved recording
`{version, name, layers[], loopBehaviour, brushShapeId, cw, ch, alternate?}`. Saving puts
a button in the Animations UI that plays it.
**The three things v1 left undefined, now answered from the clip-launch lens:**

(a) **Retrigger — default Restart**, implemented as *stop-the-running-emitter, then start
a new one*, **not** as a playhead jump. In a video mixer a restart just moves a read
cursor and the frame is redrawn; here the playhead is a **write** cursor, so a naive
restart runs a second splat stream over the first and doubles deposited dye. Ship exactly
three per-recording trigger styles: **Restart** (default), **Toggle** (second press
stops), **Hold** (emits while held). Never run two instances of one recording at once —
both flagship tools structurally forbid it, and here it is worse than in video: two copies
deposit at identical coordinates on the same frames, saturating to flat white and
destroying the exact look the recording captured.

(b) **Concurrency is governed by the emitter slots** (§3.5), not by the layer list. Firing
an Animation plays *all* its layers together. Note per-layer Play is currently *exclusive*
— `recTogglePlayback` stops every other layer — so wiring the button to that verb silently
drops layer 2.

(c) **Stop All must be safe to mash.** One always-visible control that halts every emitter
this frame — no pre-roll, no quantization, no fade, no confirm — leaving the canvas
byte-for-byte as it is. **Never merge it with Clear.** In Resolume, eject-all and a
blackout are effectively the same gesture because the output is transient and the next
frame is simply black; here the two have wildly asymmetric cost — stopping emitters is
free, clearing destroys the painting. Panic gets hit reflexively and without looking; if
it eats the artwork once, nobody touches the grid again.

(d) **A short cancellable pre-roll instead of a confirm dialog.** Zero tools in this
category put a modal in front of a launch — a modal turns an instrument into a form.
Ableton and Resolume get a cancel window for free from launch quantization: the clip is
queued and pulsing, and no output has happened yet. Insert a fixed ~250–400ms pre-roll
between press and first splat, show a filling ring on the tile, and let a second press
cancel with nothing having touched the dye. Feel-test the duration — too long reads as
lag. *(If the audio Feature Bus exposes a clock, quantized launch makes this a musical
feature rather than an invented delay.)*
Also state what happens to a playing Animation on Clear, preset load, Space/Shift+Space,
and joining/leaving a room.
✅ *Accept:* record two layers with different `loopMaxMs`, save, reload, press the
button — both play with original timings. Then: **resize the window and repeat** (see
4.7), and **press the button twice** and get the documented retrigger behaviour.

### R2 — "Preset" becomes "Animation", and the store becomes durable
Rename every user-facing string. **The key migration is a schema promotion, not a
rename:** an existing save is `{interactions, duration, loopMaxMs}` for *one* layer —
`recSaveActiveLayerAsPreset` already drops name, visible, isLooping, colorMode,
recordMode, recordStepPalette and mask. Write it as a versioned upcast with a stated
field-by-field mapping and explicit defaults for the seven missing fields.
Land 4.4 and 4.5 in the same commit. Collapse the four existing save/serialise forks
(`recSaveActiveLayerAsPreset`, `recExportAll`, `recGetLayersSnapshot`, and R1's) into one
versioned serialiser.
✅ *Accept:* an old save loads with its **loop behaviour and colorMode asserted**, not
merely "it loads". Save an Animation, run `clearExceptPresets()`, reload — it survives.
Pin the whole write→clear→reload→read cycle in `scripts/test`, not as a manual step.

### R3 — Recording is non-destructive by default
`recStartRecording` calls `recAddLayer()` unconditionally. "Re-record this layer" and
"Add to this layer" live in the row's ⋯ menu only — never on the transport, never as a
dropdown. Add a one-deep ↺ per row that swaps `_prevTake` (swap = redo for free).
**Do not build a `takes[]` hierarchy** — under the always-new-layer rule a layer can only
acquire a second recording through the ⋯ menu, so the array, the chooser row and the
flatten-on-save rule all serve a path nobody walks; `_prevTake` covers every case.
Fix 4.2 here.
✅ *Accept:* Record twice in a row produces two layers, not one corrupted one.

### R4 — All paths visible at once
Every layer's path drawn over the canvas simultaneously: selected solid, others thin
ghost at ~25%. **Identity is a numbered badge**, not a colour (§6g). Draw every stroke
twice — `lineWidth = w+3` at `rgba(0,0,0,0.72)`, then `lineWidth = w` — because the
background is a live sim and no single halo colour works. One toggle: "Show paths".
During playback each path draws only ±1.5s around its own head, so you see comets rather
than N static spaghetti strands — that behaviour is automatic and never named as a mode.
Force-hide while recording, and whenever the room panel is on stream.
**Build a new overlay**, don't adapt the existing one: `enterDrawMode` sizes its backing
store from the wrapper rect but displays at the full `.draw-canvas-area`, so stored 0–1
values are relative to the viewport and playback denormalises against the sim canvas —
draw a circle, get an offset ellipse. Copy [34-mandala-mode.js:216](js/34-mandala-mode.js:216)
instead. Two canvases: a static one redrawn only on edit/resize/selection-change, and a
small head canvas for the moving heads.
**Static opacity only** — the overlay is outside PhotoSafe's reach (§6 anti-patterns).
✅ *Accept:* 4 layers, all 4 paths distinguishable, clicking one selects it. Plus a
**measured frame-time delta with 4 layers playing, on a non-dev GPU** — this app has
already shipped one "fast on my machine" regression from exactly this class of pass.

### R5 — Rework the full-recorder layout
Three zones: transport (compact, always visible) · path strip · layers (≥2 rows visible
without scrolling).
**The arithmetic:** at 38vh on 1920×1080 the drawer is 410px, of which 266px is
unconditional chrome (10px resize handle + 37px tabbar + **three** `.rec-header` rows at
52/52/57 + 58px timeline), leaving `.rec-body` at 143px against a 216px `.rec-item`. Two
rows needs 445px — a 1869px-tall viewport. **But** that 216px is the mini-timeline + mask
row + Max row + colormode row, which §5's budget moves behind one expander. Collapse the
card to ≤72px and two rows fit in the existing 143px. So: **collapse the row first**
(cheap, testable alone), then decide whether the drawer height changes at all.
`--ui-scale` does not help — it zooms the 38vh box and the card contents equally.
`#recDrawer` is **shared with the Audio Composer**; the 37px tabbar belongs to neither
tab. Also: state a minimum viewport (propose 1280×720, 600px-tall floor) — at 812×375 the
drawer is 142px, *less* than its own chrome.
**Empty state:** `recRenderUI` has no zero-length branch, and `applyMode` creates one
layer, so a first-timer's actual first sight is one card reading "0 interactions | 0.0s"
with a hard-coded 🎬 gradient identical on every layer forever. That is as much the
reported "layers aren't visible on load" as the squeeze is, and more vertical room does
not fix it.
Migrate the timeline and resize handlers to pointer events + `setPointerCapture` +
`touch-action:none` — they're `mousedown`/`mousemove` today, the third instance of a bug
class this repo has already fixed twice.
✅ *Accept:* transport + strip + two layer rows, no scrolling, first open, cold boot, at
the stated floor viewport — **and** collapsed row ≤72px — **and** the Audio tab still
renders and scrolls.

### R6 — Path thumbnails on the strip
*You asked for a filmstrip that feels like a video editor. One critic argued to cut it to
a single per-row thumbnail, on the grounds that R4's canvas overlay already answers
"which path am I tweaking" in the place the user is looking, and that R6 is the largest
build for the smallest payoff. I've kept it and staged it so you can judge the cheap half
first — but you should know the argument exists.*
**Stage 1:** one path thumbnail per layer row, from the existing `drawPathPreview`
([24:676](js/24-path-layers.js:676)) extended with bounds.
**Upgrade unlocked by fact 4:** a clip in a grid is identified by *an image of its own
output*, not by its name — Resolume even lets you regenerate a thumbnail from the current
frame, and a whole third-party market exists purely to make VJ grids scannable, which is
direct evidence that names alone don't scan. So on save, **replay the recording into the
offscreen scratch sim from a blank state and freeze the result** as the tile's thumbnail.
This is the one place re-rendering is legal, and it's the same code path as preview. A
stroke recording also carries a free second identifier a video clip doesn't: draw the raw
path as a vector sparkline over the rendered thumbnail. Name text is a caption underneath,
never the primary identifier. Offer "Set thumbnail from canvas" for when the on-canvas
result reads better.
Fix the duration-owner bug
while you're there: `recDrawTimeline` maps against per-layer `recGetEffectiveDuration`
while the minis use `recGetGlobalDurationBase` — the two strips silently disagree on
scale today.
**Stage 2 (judge after stage 1):** the multi-cell strip. Rules that are not optional:
every cell renders the **full canvas rect in normalised coords**, never fit-to-bbox
(§6f); time shows as dots at a fixed interval (~33ms), *not* one dot per interaction —
interactions are pointermove samples, so per-sample dots encode event rate, not speed;
bleed the previous cell's tail across the seam; render from stored interactions only.
Cache in an offscreen atlas. Note the main timeline canvas currently rasterises at ~0.56×
its displayed width wherever `--ui-scale` engages — fold zoom in alongside dpr or the new
strip looks worse than the flat one it replaces.
**No draggable scrub head** (§6 anti-patterns). Click-to-select-that-layer, and label the
row "Path map" — not "Preview", which promises re-simulation.

### R7 — Prune built-ins, keep a few as worked examples
**Start from `recBuiltinPresetGenerators`** ([03:1387](js/03-recording.js:1387)) — Smash,
Jellyfish, Portrait and Vortex already have recorder-native generators emitting real
interaction arrays. Promote those to real multi-layer Animations. Use the gated bake path
(fact 2 + 4.3) only for a survivor with no generator.
Selection rule: **decomposition simplicity, not impressiveness.** If a built-in bakes to
more than ~3 layers it's a demo, not a lesson — which rules out Chimera, whose own
sub-label reads "Three sine strokes × 8 arms". Cut built-ins become a collapsed "Classic"
group flagged `builtin:true`, fork-on-edit, restorable.
Seed the empty recorder with one worked example plus a "Start empty" link. Flag it
`_builtin` and have the serialiser skip it, or the first thing in a new user's snapshot
is content they didn't make. **Write down the fork moment**: the user presses Record,
which adds a *new* layer — so without a rule their first save contains Vortex's layer
plus theirs.
✅ *Accept:* "Open in recorder" loads a kept built-in as editable layers that replay
recognisably — **and** bake with Multi-Brush at 8 and assert the dab count matches (fact 2).

### R8 — Paths are selectable and editable after creation
Click a path to select; drag points to reshape; Shift+Arrow to nudge; a numeric field for
precision *and* as the non-pointer path. Reshaping changes where, never when.
**Write it fresh.** Nothing in the codebase hit-tests a polyline or moves a vertex — all
three hit-test implementations use bounding boxes, every drag moves a whole object.
Reusable: `perpendicularDistance` (already a point-to-segment function) and
26-layer-transform.js's drag lifecycle. Compute hit tolerance in CSS px through
`getCanvasCoordinates`' scale, and hit-test the decimated point set.
**The trap in v1's acceptance test:** replay emits `i.vx, i.vy` as stored impulses, so
moving a point without recomputing velocity from its new neighbours pushes the fluid
along the *old* path — the test passes visually for one dab and then fails. Decide
explicitly whether a dragged point recomputes velocity from the new tangent or keeps the
recorded impulse. Either way the first and last interaction must never move, or the loop
seam breaks.
Optional Smooth slider defaulting to **0**, non-destructive, survivors keep their
original timestamps. Be honest in the label: each interaction is a *deposit*, and replay
emits one dab per interaction with no interpolation, so decimation genuinely removes
paint — either port 05d's replay interpolator ([05d:544](js/05d-input-replay.js:544),
which exists because dropped deposits turned strokes into "a string of separate blobs")
or label it "fewer, cleaner points; thins the stroke".
**Blocked on R14.** Defer Bezier handles — a second selection state whose hit target
collides with the point it belongs to is fatal on touch.

### R9 — Right-click alternate
A checkbox when editing: **"Save as this animation's right-click alternate."** Preserve
the surviving built-ins' alternates. No alternate → right-click falls back to primary.
**Right-click alone is not a trigger on Steam.** On Deck it's Steam+L2 or an imprecise
two-finger tap, and the web build has no right-click on touch at all. Render an Animation
with an alternate as a **split control**: primary face plus a persistent second focusable
segment (≥44px) labelled with the alternate. Right-click stays an accelerator.
✅ *Accept:* left-click primary, right-click alternate, both survive reload — **and the
alternate can be detached again**, which forces the detach affordance to exist.

### R10 — Recordings respect the custom brush
Not a schema gap — a gate. `applyMultiSplatWith(…, exactColor=true)` → `__brushTipOn =
false` → tip *and* stamp off. Recorder playback also silently discards BRUSH_TIP
(Soft/Blob/Chisel/Streak/Ring) and BRUSH_ANGLE.
**Do not flip `exactColor`** — [05g:277](js/05g-arm-colors.js:277) branches on the same
flag for arm colour resolution, and the recorder has *already* resolved colour per
`layer.colorMode` by then. Flipping it resolves colour twice: `REC_COLOR_MODES` silently
stops working and every existing recording changes colour. Instead pin `__brushTipOn`
(and BRUSH_TIP / BRUSH_SHAPE_ID / `__remoteStroke`) explicitly around the recorder's call,
or add a separate parameter. Copy `emitReplayDab`'s pin-then-restore-in-`finally`
([05d:450-524](js/05d-input-replay.js:450)) — it already handles the missing-stamp case.
Never call `BrushShapes.setActive()` on replay (it persists and publishes to the room).
Pre-warm every shape id at play-start or the opening dabs print untextured.
**This is a decision, not just a fix:** is the recorder a user-stroke source or a
programmatic one? The code currently classes animations as programmatic *deliberately*
([05g:240-250](js/05g-arm-colors.js:240)), and flipping it changes how every existing
recording looks.

### R11 — Loop behaviour is explicit and per-layer
**Only two values survive the destructive medium** — and this corrects v2, which inherited
`loop / pingpong / once` from the path-layer vocabulary:

- **One-shot** (default) — plays once, releases its emitter slot.
- **Loop-N** — an explicit repeat count, default 1. Infinity is available but **is not the
  default**: an infinite loop in a destructive medium is a runaway accumulator, and every
  clip-launch tool that ships follow-actions pairs looping with a count.

**Ping-pong and reverse must not be offered.** Reverse is meaningful for video because it
re-reads frames in the other order. A stroke recording played backwards does **not**
un-deposit dye — it paints the same path again with the velocity sign flipped, roughly
doubling density while stirring the field the other way. Any control labelled "reverse" is
a direct lie about reversibility in a medium whose entire design problem is that nothing
is reversible. Same for play-once-and-hold: there is no last frame to hold.
Show the state on the tile: a small loop glyph when Loop-N is set, plus a progress arc
around the tile border that fills once per pass, so the remaining count is legible without
reading.

**Loop length is a pre-commitment, not a field edited
after:** chips — 2s · 4s · 8s · 15s · Free — in the primary row, writing both
`recMaxDurationMs` and the new layer's `loopMaxMs`. Keep the mm:ss:ms field as an advanced
override, but note today's field is hostile: 2000ms debounce, destroyed by any
`recRenderUI()` rebuild, and `recParseTime` silently returns 10000 for `abc`, `5s` or `0`.
Demote Speed to advanced, preview-only, never persisted — today it's global and silently
session-dependent.
**Do not add a third time control.** Global Max × per-layer loopMaxMs × Speed already
produce states no first-timer can predict.
**Flash safety:** both setters clamp with `Math.max(1, …)`, so this field accepts a 1ms
loop. Floor the **user-edit paths only** (03:746, 03:956) at 400ms and show the derived
rate in Hz — do *not* floor the load paths (03:1198, 03:1219, 03:1459) or every old save
is silently retimed, breaking R2. The dangerous band is roughly 60–500ms, where a
full-canvas stroke deposits and dissipates once per cycle. Sim-side flashing is
PhotoSafe's job (`PHOTOSAFE_RATE=5.0/s`, `PHOTOSAFE_PAIR_WINDOW=0.18s`); the **overlay**
is not, which is why R4 is static by contract.

### R12 — Animations are manageable, not just creatable *(NEW)*
Saved recordings today have **no delete, no rename, and no update** — `sm.remove()` is
never called with a `recPreset.` key, there is no delete control in the markup, and a
colliding save returns `'exists'` and refuses. The store is append-only and permanent,
and R1 promotes it to a headline feature.
Per-row Rename (inline, same control as save-time naming), Delete into a recoverable
trash (the vault's `.trash/<name>-<ts>` convention already solves this), Duplicate, and
a visible "Update <name>" button rather than an overwrite confirm.
Ship in R2's slice — the migration is the only moment the store's shape is open.
✅ *Accept:* save three, rename one, delete one, reload: rename persisted, deleted one
gone and recoverable for the session, no entry unremovable.

### R13 — Import is non-destructive and validated *(NEW)*
`recImportFromFile` executes `recLayers = []` **before validating anything**, with no
confirmation and no undo, then assigns `interactions` and `mask.shapes` verbatim — no
bounds check on x/y/radius/timestamp, no length cap, no ordering check (which R3 just
made a load-bearing invariant). Today that's a private button. R1 makes Animations
shareable, which turns it into an untrusted-document parser whose first act is destroying
the recipient's unsaved work.
Add as new layers rather than replacing; validate and clamp (finite, x/y in 0..1, radius
in range, count capped, timestamps sorted and non-negative); reject with a visible reason.

### R14 — The recorder joins the undo system *(NEW)*
`UndoManager.register()` is called three times; **zero recorder providers exist**, and
Ctrl+Z picks the highest-seq provider. So after R8's point-drag, Ctrl+Z silently undoes
the user's most recent *paint stroke* instead. The recorder's existing destructive ops are
already in this hole: `recDeleteActiveLayer` has no confirm and no undo (its one guard is
an `alert()`), and `recClearActive` wipes a take with no confirm, bound to the **bare
Delete key** whenever `recEnabled`.
Cover: delete layer, clear layer, import, point drag, smoothing change. **R8 must not ship
before this** — a bound-but-wrong Ctrl+Z is worse than an unbound one.
**Firing an Animation gets exactly ONE level of undo, snapshot-backed** — v2 left this
open; both new lenses converge on the same answer, and it is precedented twice over. Boss
loopers — the only mature product whose medium is as destructive as this one — solve it
with a single level of undo of the last commit, footswitch-reachable, with loud feedback,
where the base loop is never at risk; hold again and REDO brings it back. The Powder Toy,
after fifteen years as the most destructive sandbox in the category, still stores exactly
one undo state, and its community routed around it with *stamps* (snapshot the world,
reload the last one). Sandspiel skipped undo entirely in favour of serialising whole state.

So: **snapshot dye + velocity at the instant a recording fires, and expose one "Put it
back"** that blits it, plus a redo that restores the post-fire state. One level, not a
stack. Surface it as a transient control for ~10s after playback ends. Add a manual
Snapshot/Restore pair as the general safety net.
**Refuse every request to generalise this into a dye undo history** — that is the
re-renderable-timeline fantasy coming back through the door, and advertising undo in a
destructive medium creates the one complaint you can never fix. *Measure the cost of the
FBO pair snapshot at the current render cap first; that number decides whether this ships
at all.*
*"I pressed the shiny button and ruined my painting"* is a Next Fest review, not an edge
case.

### R15 — Discovery *(NEW)*
The entire recorder is **off by default** behind a three-state dropdown: `recMode`
defaults to `off`, `recEnabled` initialises false, and every capture hook early-returns on
`!recEnabled`. So the target user's exact failure is unaddressed — paint a good swirl,
want to keep it, discover nothing was captured, with no indicator and no entry point on
the default screen.
R1's goal sentence is unreachable without changing this. **The clip-launch lens says kill
the arming step outright**: retroactive capture is the authoring idiom in this category.
Ableton's Capture exists explicitly *"if you forgot to press the Record Button before
playing, or if you prefer to improvise freely without the stress of recording"* — Live is
always listening, and Capture retrieves what you just played, detecting tempo and setting
loop boundaries for you. Resolume's recorder runs without interrupting the mix and can
drop the result straight onto an empty clip slot. The cost argument that constrains audio
capture doesn't apply here: this is kilobytes of `{t,x,y,vx,vy,color,radius}`, not pixels.
So: **run the recorder always into a rolling ring buffer, and ship one button — "Keep the
last 10 seconds of painting"** — that auto-trims to the gesture (pointerdown→pointerup
plus an idle-gap heuristic, the analogue of Capture's loop-boundary detection),
auto-renders the thumbnail via fact 4, and drops it into the first empty grid slot.
Decide: does the default become Minimized, or does the buffer run whenever the recorder is
not explicitly Off? (If the buffer: **4.3 must land first**, or it continuously and silently
captures peer paint; and use a preallocated ring written in place — a per-dab object plus
`colorArray.slice()` in the paint hot loop at 144Hz is not viable. Label it "Keep the last
10 seconds of **painting**" — it saves the movement, not the picture.)
Also unresolved: **the mini recorder** (`#recMini`) is the surface a first-timer actually
meets and duplicates the drawer's transport with a different shape. Say what it becomes.
And the Animations panel's **empty state** after R7 cuts 8 buttons to 3–4 is the literal
first screen of this feature; nobody has described it.

### Error states — applies across R1, R2, R6, R10, R12, R13
Every recorder error reports into one 12px, 0.7-opacity `<span id="recStatus">` **inside
the drawer** — which is closed in `min` mode and absent in `off`. So the failures with the
worst consequences are invisible in two of three modes. Enumerate and give each a surface
that doesn't depend on the drawer: save failed (quota), name collision, import rejected
and why, Animation references a deleted brush shape, Animation body failed to load. The
app already has a modal pattern for anything that must be acknowledged.

---

## 8. Don't break

- **Persistence contract** — Animations are user-authored content: write through
  immediately, restore every boot, do **not** ride the settings snapshot. But note §6's v1
  claim of "parity with palettes and brushes" was optimistic: the Preset Vault is
  **Electron-only** (`PresetVault.available === false` on web, every op a no-op), and the
  web build is what the Next Fest demo link serves. State the durability target per build,
  or say plainly that web Animations are localStorage-only and best-effort.
- **PhotoSafe** — the limiter measures only the WebGL blit. Every overlay and thumbnail is
  a DOM canvas composited above it and is **unmetered**. That's why R4 is static by
  contract. Also state whether Animation buttons are gated before the first-frame modal is
  dismissed.
- **Button system** — buttons inherit colour from their panel. Never per-button. Run
  `auditButtons()` after the UI work. (This is also why the Animations list can't be
  colour-coded — differentiate by stored glyph.)
- **Multiplayer** — replay does *not* broadcast (v1 was wrong). Two live issues instead:
  4.3 (peer paint recorded into your layer) and 4.6 (animations bypass the turn gate).
  Both are bug fixes independent of this feature and should land first.
- **No pen pressure.** Do not reintroduce it.
- Keep hotkeys working: Space, Shift+Space, F9, Shift+F9, Esc, ↑/↓, Delete — noting ↑/↓
  and bare Delete are already claimed (R8 nudge, R14).
- **Storage** — ~220 B per interaction at full precision; a 10s layer ≈ 132KB; capture rate
  is coupled to **display refresh**, so a 144Hz painter records ~2.4× the data for the same
  gesture. Quantizing exactly as the wire already does roughly halves it, free. Twenty
  saved Animations is the whole practical localStorage budget, and the 21st save silently
  no-ops.

---

## 9. Decisions I need before you build

1. **R10's core question** — is the recorder a user-stroke source or a programmatic one?
   Not reversible per-recording; it changes how every existing recording looks.
2. **R8's velocity question** — does a dragged point recompute velocity from the new
   tangent, or keep the recorded impulse? These are two different animations.
3. **Masks (4.8)** — wire them or drop them from the layer model? They are 100% inert
   today and a quota bomb if serialised.
4. **R15's default** — does the recorder stop being off-by-default, and does the mini
   recorder survive?
5. **Peer visibility** — should firing an Animation be visible to peers? Today it's purely
   local. If yes, the only near-term shippable form is **built-ins by id, with colorMode
   forced to `original`** (~30 lines, no relay change) — user Animations need chunking past
   the relay's 16KB silent drop, a deploy, and turn gating. "Peers see nothing" is a
   legitimate Next Fest answer if stated as a decision.
6. **Does an Animation capture look settings or only motion?** ***I was wrong here.*** v1
   and v2 leaned motion-only. The consumer lens says the opposite, with evidence: a
   "preset" in this category is one named thing bundling look **and** behaviour, switched
   by a single control, with no partial application. Bloom's Worlds each *"introduce new
   combinations of sounds, shapes, colours and rules of behaviour"*; Patatap's spacebar
   swaps palette, shapes and sounds together. Neither exposes a way to take the motion
   without the colours — and the argument for why is the load-bearing part: **a
   motion-only recording replayed under different colours produces something the user
   does not recognise as what they saved, and they report it as data loss, not
   flexibility.** Recommendation reversed: capture look + motion as one inseparable
   *Scene*. If a look-preserving option is ever needed it is a single "keep my current
   colours" checkbox at **apply** time, never a choice at save time.
7. **Is the artifact a Scene or a file?** In this category the saved thing is a still or
   a flat video, never a re-playable motion document — Procreate records every stroke and
   still exports only a movie; Sandspiel's gallery is GIFs; Townscaper's whole community
   output is screenshots. Whatever an Animation is internally, consider making its two
   **default** outputs a PNG and a clip, one click from Perform, with the re-playable
   Scene as the quieter third option. Related: on Steam, don't build a video recorder —
   Steam Game Recording is client-wide, background, GPU-encoded and free. Spend that
   budget on a great **still** export (high-res, optional transparent background, UI
   hidden) and ship the GIF/MP4 path on **web**, where there's no platform recorder.
8. **Do the ~8 procedural animations get cut, or promoted?** You asked to clean most of
   them out, so that's the default — but the consumer lens argues the other way and it's
   worth one minute of your time: Bloom's 12 moods and 10 Worlds and Patatap's sets *are
   the product* — curated, one-key, and the thing DLC sells more of. It also proposes the
   highest-value job for them, which needs no timeline, no save UI and no reversibility:
   an **attract mode**. After N seconds idle on a near-empty canvas, one Scene plays
   itself and any input takes over instantly. That's free trailer footage, free streamer
   footage, and a no-tutorial teacher for Next Fest.
9. **Which built-ins survive R7** — propose from the generator set, I'll pick.
10. **Does this feature belong in the demo at all?** GMTK's Next Fest write-up is blunt
   that demos are free so players *"have invested nothing – and so will happily quit
   out"*; he shipped 25 of 120 perks. The lens recommends keeping the Animation feature
   out of the demo's first 60 seconds entirely — present in the demo as one row of named
   Scene buttons that instantly transform the canvas, with saving as a full-version
   feature. Your call, but it changes the build order.
11. **Reproducibility, measurable in-repo.** Does a recorded layer replayed at a different
   sim resolution, render cap or frame dt land anywhere near the same picture? If it
   doesn't, a Scene storing strokes + params + seed isn't reproducible even on the user's
   own machine, and the honest artifact is video plus a look preset. `scripts/test`'s
   virtual-clock bit-identity harness can answer this — no competitor source can.
12. **Aspect (4.7)** — letterbox an Animation's coordinate frame to its recording aspect,
   or accept the stretch?

---

## 10. How to work

Land in slices in this order: **§4 bug fixes** → **fact 4's offscreen scratch sim** (it is
load-bearing for R1, R6 and R12, and it's small) → R3/R5 collapsed row → R1/R2/R12 (one
slice — the store's shape is only open once) → R4 → R14 → R8 → R6 stage 1 → R7 → R9/R10/R11
→ R6 stage 2 if it still looks worth it.

Multi-file changes go on a branch and land atomically — the dev server serves the repo
live. Show me R5 and R6 stage 1 early; layout and the path preview are what I want to feel
before anything is built on top of them.

Two notes on the ground under you: the working tree currently has **uncommitted changes in
05d/05i/05j/06/04a** (a `BRUSH_VELOCITY_ONLY` "Push" feature landing on the same
`__brushTipOn` gate as R10), so expect conflicts there and re-derive line anchors at
implementation time — 05d shifted ~38 lines during this audit. And `scripts/test` has a
deterministic harness; use it for the R2 persistence cycle and the R4 frame-time budget
rather than testing by hand.

---

## 11. One caveat I'd be wrong not to report

The consumer-category research turned up something that isn't about *how* to build this,
but *how much of it to build*, and it points against the current scope. Reporting it once,
then it's your call:

- **This app's direct ancestor reached mass scale with none of this.** Pavel Dobryakov's
  Fluid Simulation reports ~25M Android downloads at 4.87★ from ~450k ratings. Its listed
  capabilities are: play with fluids, use it as a live wallpaper, and *"many toggles to
  change the way the fluids look and behave."* The paid tier's only stated difference is
  **the number of options**. Eight years and 16k+ GitHub stars in, there is no save, no
  record, no replay. "Save an animation" is not a verb this category's 25 million users
  have ever been offered.
- **Users of the nearest neighbours ask for painting control, not motion tooling.** Silk 2
  ships high-res export, undo/redo, symmetry and palettes — no video, no animation, no
  replay — and its feature requests are custom palettes, brush width, layers, and drawing
  over imported images. Max Bittker on his own falling-sand sim: *"For the most part, it
  gets used as a paint program, and the actual simulation aspects are an afterthought."*
- **The demonstrated monetisable axis is more looks**, which is also the axis your Steam
  DLC cadence already assumes.

None of that says don't build it. It says: if the Animation merge ever competes for
schedule against palettes, brushes, scenes or a great still export — especially with a
Next Fest date on the calendar — **the painting surface should win**, and the cheapest
high-value slice of this whole document is probably the **attract mode** (§9.9) plus a
**stills gallery**, neither of which needs a timeline, a library, or reversibility.

The §4 bug list is the exception and stands regardless of scope: three of those are live
data-loss or data-corruption paths, one silently records other people's brushwork into
your file, and none of them are about animations at all.

Sources for §3.5, R11, R14, R15 and this section:
[Resolume — clips](https://resolume.com/support/en/clips) ·
[Resolume — layers](https://resolume.com/support/en/layers) ·
[Resolume — composition](https://www.resolume.com/support/en/composition) ·
[Resolume — autopilot](https://www.resolume.com/support/en/autopilot) ·
[Ableton — launching clips](https://www.ableton.com/en/manual/launching-clips/) ·
[Ableton — Session View](https://www.ableton.com/en/manual/session-view/) ·
[Ableton — Capture MIDI](https://help.ableton.com/hc/en-us/articles/360000776450-Capture-MIDI) ·
[TouchDesigner — Perform Mode](https://docs.derivative.ca/Perform_Mode) ·
[Boss RC-1 manual (undo/redo)](https://static.roland.com/assets/media/pdf/RC-1_M_eng01_W.pdf) ·
[The Powder Toy — single undo step](https://powdertoy.co.uk/Discussions/Thread/View.html?Thread=8692) ·
[Making Sandspiel](https://maxbittker.com/making-sandspiel/) ·
[Procreate — time-lapse](https://help.procreate.com/articles/gZrGyA-time-lapse) ·
[Dobryakov — Fluid Simulation (Play Store)](https://play.google.com/store/apps/details?id=games.paveldogreat.fluidsimfree) ·
[WebGL-Fluid-Simulation repo](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) ·
[Bloom — 10 Worlds](https://www.orbmag.com/news/brian-eno-and-peter-chilvers-announce-generative-music-app-bloom-10-worlds/) ·
[Silk 2](https://apps.apple.com/us/app/silk-2-generative-art/id1050339928) ·
[Townscaper](https://store.steampowered.com/app/1291340/Townscaper/) ·
[GMTK — how to make a great Steam Next Fest](https://gmtk.substack.com/p/how-to-make-a-great-steam-next-fest) ·
[Steam Game Recording](https://store.steampowered.com/gamerecording) ·
[Chrome Music Lab Song Maker](https://musiclab.chromeexperiments.com/Song-Maker/)
