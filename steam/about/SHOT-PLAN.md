# Shot plan — About This Game

Fifteen images baked, fourteen placed, 1232×693 (seven from round 1, four feature photos from round 2 — see the round-2 section below). The rule inherited from the store
screenshots holds: **show the feature through the swirls, not through the
interface.** A frame full of sliders sells a control panel.

The rule these add: because each image sits directly under prose that already
names the feature, an About shot does not have to introduce anything. It has to
*prove* the sentence above it. One mechanic per frame, legible at 616 px, read
in the half-second someone spends scrolling past it.

---

## 01 · together — under the intro

**Proves:** two people, one canvas, strokes that interfere.

Two streams entering from opposite corners and meeting off-centre, painted
through real pointer input (`__shot.duetLive`) so the meeting is genuinely
solved rather than composed. Cool palette against warm, held apart long enough
at the edges that the pair reads as *two hands* and not as one busy picture.
The mixing happens in the middle third only.

Quiet space around them. This is the hero of the section and the only shot that
gets to be mostly empty.

## 02 · materials — under *Painting*

**Proves:** the paint is made of different things.

One composition, three times, in three vertical bands: loose fluid, wet paint,
thick paint. Same stroke path, same palette, same everything except the
material — so the difference between the bands is the only variable, and the
eye lands on it without a caption.

Bands rather than a grid, because a 616-wide column turns a 2×2 into four
postage stamps.

## 03 · mandala — under *Painting in symmetry*

**Proves:** you paint one thing and get a whole figure.

Six-arm radial symmetry, one wedge painted, the rosette resolving around it.
Shot square-ish inside the 16:9 frame with the sim's own background either side
— a mandala cropped to 16:9 loses the thing that makes it a mandala.

## 04 · styles — under *Colour and light*

**Proves:** the same painting can look like many different paintings.

The preset-tile device from `bake-screenshots.js` shot 03, re-cut for this
aspect: one seeded composition painted identically under four of the authored
built-in presets (silky, chaotic, marble, electric — neighbours contrast), then
sliced so cell *k* is that region taken from capture *k*. The slices line up,
so it reads as a single canvas whose style changes as your eye travels.

Mutations were the first idea and were abandoned, same as the proven baker
abandoned them: "a mutation is a dice roll, not a design." One distinct hue
family per cell, pinned explicitly — the app's four saved palettes are all
muted nature tones (two share a blue), so `applyPalette` can't differentiate.

## 05 · collide — under *Bringing things in*

**Proves:** paint obeys shapes you put in its way.

A lattice of small obstacles, not three big discs: the paint threads between
them, piles up on the upstream faces, and comes out combed. Structure you place,
paint that obeys it. Obstacle silhouettes stay visible as negative space rather
than being drawn as objects.

## 06 · music — under *Painting to music*

**Proves:** the canvas is listening.

Bass-driven auto-splats caught mid-pulse: a rhythm visible *as spacing* — a run
of splats stepping outward at even intervals, brighter on the onsets. Sound is
the one feature a still cannot show directly, so the shot has to show its
fingerprint instead: regular structure no hand would paint.

**This is the weakest still of the seven, and the first one to cut** if the
section goes to five images. It is also the best candidate for an animated GIF,
where the mechanic actually reads.

## 07 · record — under *Keeping it*

**Proves:** a stroke is a path through time you can replay.

Onion-skin long exposure, borrowed whole from `bake-feature-shots.js` shot 04:
the same compact curl painted at five positions that never touch, each settled
a different age, then added (`lighter`) under a rising alpha ramp — older states
fainter, converging into the present. Two hard-won rules ride along: the stages
must occupy *different ground* ('lighter' over co-located captures sums and
clips into a smear — measured twice), and the Colour Gate stays off for the
whole bake — its density trigger snapped the oldest, densest stage to the
picker colour.

---

## Not shot, deliberately

- **The interface.** No sidebar, no sliders, no room codes. Every one of these
  is canvas pixels edge to edge.
- **Instant Roto and depth colliders.** The interesting half is a photo, and a
  photo on a store page invites the question of who owns it. `05` carries the
  collider idea without importing anyone's picture.
- **Presets, export, save.** File management does not photograph.

---

# Round 2 — feature photos baked on the test harness (2026-08-21)

Shots 08-11 target claims the copy makes and the first seven images did
not picture. They bake through `scripts/bake-feature-photos.js`, which
stages on `scripts/test/harness.js` + `scripts/test/stage.js` instead of
`shot-helpers.js` — the pinned stage is what makes a comparison shot
trustworthy, because it guarantees the ONLY difference between bands is
the feature.

## 08 · brushes — under *Picking a brush*

**Proves:** the five tips are five different marks.

One specimen per band: a short mark centred in the x-region that band is
cut from, so each band shows a whole brush. Soft, Blob, Chisel, Streak,
Ring, one palette, one seed, one geometry, ten frames of settle (advection
is what destroys a stamp's character, and the stamp is the subject).

Two things had to be true before this shot could exist at all:

1. `config.BRUSH_TIP` only reaches the shader when `__brushTipOn` is set,
   and `multiSplat` sets that **only for non-exact-colour calls**
   (05g:259). Programmatic strokes normally pass `exactColor: true`, which
   silently bypasses every tip. The stroke runs `exact:false` and holds
   its colour through arm 0 instead.
2. A **custom brush stamp overrides every built-in tip, Ring included**
   (05i:126-135, 173), and stamps persist in saved settings. One was
   active from a previous session — tips 0 and 4 painted *bit-identical*
   dabs. `__stage()` now clears the active stamp.

The first attempt drew one long stroke across all five bands; it read as a
single stroke changing texture, not as five brushes.

## 09 · symmetry — under *Painting in symmetry*

**Proves:** "Mirrors, quads, rakes... each arm carrying its own colour."
The mandala photo shows radial only.

Four full frames in a 2×2 contact sheet: mirror L↔R (2 arms), mirror quad
(4), rake (4), radial (8), each from one identical off-centre gesture with
eight distinct arm colours. Per-arm colour needs `exact:false` too —
`exactColor` bypasses `resolveArmColor` entirely (05g:277).

Cells are WHOLE captures, not quadrants: quadrant-slicing cuts away the
structure the shot exists to show, and the first attempt returned an empty
rake cell because rake translates its arms out of the sliced quadrant.

## 10 · lightshift — under *Light*

**Proves:** "Drawing a path through colours and letting the light shift
along it as the paint moves."

Three crossing strokes settled into a dense mass, then the colour path
applied at threshold 0.55 (the 0.85 default is inert on settled dye) in
`replace` mode. A single-point path is deliberate: multi-point paths
animate on the module's own rAF, and a still can only honestly show the
static case.

## 11 · shading — under *Light*

**Proves:** relief and gloss.

Look-only features never touch the dye, so both halves come from ONE
settled sim state: settle, capture with shading off, switch it on,
capture again. Same paint by construction; the composition runs
continuously across the seam. Glow stays **off in both halves** — the
first attempt switched glow on with the shading, which is two variables
and blew the lit half to white.

---

# Round 3 — 2026-08-21

## 12 · imported — under *Bringing things in*

**Proves:** "Dropping in an image... the paint breaks against it."

The source picture is drawn PROCEDURALLY in-page (a pale disc with punched
holes), imported through the real `createLayerFromDataUrl`, then turned
into a collider through the real `collisionLayers.createFromLayerMask`
luminance path — no AI model, no download, and **no third-party
photograph**, which a store page is the wrong place to put.

Image layers are browser-composited DOM and invisible to a canvas grab, so
the capture draws the layer's own bitmap at the layer element's MEASURED
rect and puts the fluid over it — the same stack the player sees. The dye
pools inside the punched holes, which is the part that proves it is a
collider and not a sticker.

## 13 · wetness — UNPLACED

**Proves:** "wet paint that dries."

The deterministic A/B the rig exists for: identical seed, identical
stroke, `WET_INFLUENCE` the only variable. Dry fragments into wisps; wet
travels further as a continuous mass.

Both halves are cut from the SAME source window — `bands()` would have
compared the dry stroke's beginning against the wet stroke's end and
credited wetness for the difference. `pairSameWindow()` exists for this.

**Not placed in the copy:** honest and correct, but the difference is a
texture difference, and at 616px it risks reading as the same picture
twice. Hold it for a page that has room, or use it if the wetness bullet
ever needs its own proof.

## 14 · kaleido — under *Light*

**Proves:** the kaleidoscope named in the look controls — a DISPLAY-space
mirror, a different animal from the paint-space arms in shot 09.

`_kaleidoBootstrapped` is pre-set deliberately: the first manual enable
otherwise forces the multiplier to 8 and segments to 16, which would add
paint-space symmetry on top and quietly conflate the two features.

## 15 · stamp — under *Picking a brush*

**Proves:** "or draw your own stamp shape and paint with that."

A star drawn in-page, imported through the real `BrushShapes` path.
Custom stamps ride the same `__brushTipOn` gate as the built-in tips, so
the stroke is `exact:false`; and the texture upload is asynchronous with
`multiSplat` DROPPING every dab that lands while it is pending (05g:255),
so waiting on `stampPending()` is mandatory, not polite.

Six dabs, not eleven: the first attempt overlapped them into a continuous
chain, and a stamp whose edges you cannot see is not a stamp.
