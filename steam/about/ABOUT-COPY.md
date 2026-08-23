# About This Game — paste-ready

**This file is the single source of truth for the About This Game text.**
Section 6 of [../STORE-PAGE-COPY.md](../STORE-PAGE-COPY.md) points here rather
than holding a second copy that can drift.

Steam BBCode. Paste the block between the fences into the **About This Game**
field. Image tags assume the files in `images/` have been uploaded through the
description editor's image button, which stores them under the app's `extras`
folder and rewrites nothing — the filenames below must match exactly.

Sizing and upload mechanics live in [README.md](README.md); what each image is
supposed to *show* lives in [SHOT-PLAN.md](SHOT-PLAN.md); the alternates for
every slot are in [SETS.md](SETS.md).

---

```
[h2]Swirl Together — a cooperative painting sandbox for two to eight people, or a sandbox for one.[/h2]

The canvas is a real fluid simulation. Colour flows, curls, drags and blooms
under your brush, and it keeps moving after you lift it.

You can paint on it alone. It is better with someone else. Press one button and
you are matched with one stranger, somewhere, who wanted the same thing — or
share a six-character code and fill the canvas with up to eight people you
know. Their strokes push into yours. Yours push back. What you end up with is
something neither of you would have made alone.

No score, no timer, no fail state, no chat. You are here to make a nice thing
with another person for a few minutes.

[b]What is in it:[/b]

[list]
[*]2 to 8 painters on one canvas — one stranger at the press of a button, or a six-character code for friends
[*]Turns on a 30-second to 5-minute timer, or everyone painting at once
[*]3 paint materials: fluid, wet paint that dries, thick paint that piles up
[*]5 brush tips you can rotate — plus stamp shapes you draw yourself
[*]8 painting arms across 5 symmetry modes, each arm with its own colour
[*]A 24-segment kaleidoscope with 5 modes, folding the whole canvas as it moves
[*]Mandala Studio — paint one wedge of up to 24 and the circle fills itself in
[*]8 one-tap physics presets, and every parameter underneath them
[*]10 layers, masks, and colliders you paint by hand for the fluid to break against
[*]2 on-device AI models: cut an object out of a photo, or turn a photo into terrain
[*]6 blend modes for colour shifting, plus glow, relief and gloss
[*]Paint that reacts to your microphone, your speakers, or a music file
[*]Export to video, GIF, stills or PNG sequences, and save the canvas to open another day
[*]Presets you save, export to a file, and hand to other people
[*]Photosensitivity protection on by default — a checkbox if you would rather have the raw thing
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-16-crowd.png[/img]

Six brushes coming in from the rim. Everyone keeps their own colour at the
edges, and nobody owns the middle.

[img]{STEAM_APP_IMAGE}/extras/about-08-brushes.png[/img]

Five tips — Soft, Blob, Chisel, Streak and Ring — or a shape you sketch
yourself, stamped along the stroke.

[img]{STEAM_APP_IMAGE}/extras/about-09-symmetry.png[/img]

Mirror, quad, rake and eight-arm radial. One gesture, drawn everywhere at once,
in as many colours as you have arms.

[img]{STEAM_APP_IMAGE}/extras/about-14-kaleido.png[/img]

The kaleidoscope folds the finished canvas into a tiled figure that keeps
turning with the paint underneath it.

[img]{STEAM_APP_IMAGE}/extras/about-12-imported.png[/img]

Drop in a picture and the paint has to get around it. Cut the object out, or
turn the photo into terrain, on your own machine and offline.

[img]{STEAM_APP_IMAGE}/extras/about-27-handwalls.png[/img]

Or paint the walls yourself and watch the fluid pile up behind them.

[img]{STEAM_APP_IMAGE}/extras/about-11-shading.png[/img]

The same painting, matte and then lit: relief lifts the form, gloss lays a wet
sheen over it.

[img]{STEAM_APP_IMAGE}/extras/about-04-styles.png[/img]

Silky, Chaotic, Marble, Electric. One tap each, and everything underneath them
is a slider if you want it.

[h2]For anyone[/h2]

Nothing here needs to be learned. You put the brush down and colour moves. The
rest is optional depth for the people who want it.

Painting together needs an internet connection. Painting on your own does not.
```


---

## Why this shape

Modelled on the Overvoid store page Gabriel picked out: a one-line statement of
what the thing is, two or three short paragraphs, one counted feature list, then
images with a line of context under each.

- **Every number is checked against the code**, because a store page is the one
  place an inflated count gets caught in the first minute:

  | Claim | Source |
  |---|---|
  | 2 / 8 painters | `PUBLIC_CAP = 2`, `PRIVATE_CAP = 8` — `party/shared.ts:7` |
  | 30 sec – 5 min turns | `#turnTimerSel` options — `index.html:1040` |
  | 3 paint materials | `#materialMode`: Fluid · Paint-Wet · Paint-Thick — `index.html:589` |
  | 5 brush tips | gaussian · blob · chisel · streak · ring — `js/04a-canvas-gl-config.js:743` |
  | 8 arms | `multiplier` hard max 8 — `js/01a-param-registry.js:63` |
  | 5 symmetry modes | `#symmetryMode` — `index.html:699` |
  | 24 kaleido segments, 5 modes | `#kaleidoSegments` max 24, `#kaleidoMode` — `index.html:767` |
  | 24 mandala wedges | `#mandalaWedges` max 24 — `index.html:722` |
  | 8 physics presets | `applyPreset()` buttons — `index.html` |
  | 10 layers | `MAX_LAYERS = 10` — `js/01-config.js:1` |
  | 6 colour-shift blend modes | `#lightShiftMode` — `index.html:922` |
  | 2 on-device models | SlimSAM + Depth-Anything-Small (see §10 of the pack) |

- **"Dozens of brushes" stays cut.** Five tips across three materials, plus
  stamps and symmetry, is a real combinatorial space and an honest sentence.
- **No audio "scenes" claim.** Only one scene (Tunnel) is registered in
  `js/30-audio-scenes.js`; the bullet describes the band-driven reactivity that
  actually ships.
- **Eight images, one caption each**, taken from the ⭐ recommendations in
  SETS.md. `16 crowd` replaces `01 together` (it says "up to eight" without a
  number) and `27 handwalls` is added because hand-painted colliders are the
  feature Gabriel leads with; drop `04 styles` and `09 symmetry` first if the
  page needs to be shorter.
- **Photosensitivity is a bullet now, not a paragraph.** It still says what the
  feature does and makes no medical-safety claim; the in-app first-run warning
  is where the epilepsy advisory lives.

---

## Open decisions


- **[DECIDE]** whether the communal-ledger / wishlist line goes in here. Rules
  verdict (REFACTOR-AUDIT.md §9.3): allowed in the description, but keep it out
  of every capsule image, no fake Steam UI, no external links, and have softer
  fallback phrasing ready if a reviewer reads it as a feature-removal threat.
- **[DECIDE]** whether eight inline images is the right density. Dropping
  `about-04-styles` and `about-09-symmetry` gives a six-image page that still
  has one picture per pillar — see SETS.md for the alternates in each slot.
- **[DECIDE]** the opener. `Swirl Together — a cooperative painting sandbox...`
  mirrors the Overvoid page's flat "X is a Y" line. If you want the old hook
  back, `Paint is a fluid. So paint with someone.` is the strongest sentence
  either draft produced and can sit above it as a second [h2].

---

## Previous drafts

Kept because none of these were ever committed — git cannot give them back.
Delete once the page is live.

<details>
<summary>1 · Illustrated long version (~40 bullets, 7 images)</summary>

```
[h2]Paint is a fluid. So paint with someone.[/h2]

Swirl Together is a painting game for two to eight people. The canvas is a real
fluid simulation — colour flows, curls, drags and blooms under your brush — and
you are never the only one touching it. Your partner's strokes push into yours.
Yours push back. What you end up with is something neither of you would have
made alone.

There is no score, no timer, no fail state. You are here to make a nice thing
with another person for a few minutes.

[img]{STEAM_APP_IMAGE}/extras/about-01-together.png[/img]

[h2]You can Swirl Together by:[/h2]

[b]Painting with people[/b]
[list]
[*][b]Getting matched with a stranger.[/b] One button, one other person somewhere who wanted the same thing. No chat, no profiles, no accounts.
[*][b]Sharing a six-character room code.[/b] Up to eight people on one canvas. Desktop and browser players sit in the same room.
[*][b]Taking turns.[/b] Pass the brush around on a 30-second to 5-minute timer, or throw it open and all paint at once.
[*][b]Hosting properly.[/b] Lock the room, lock the look so nobody nudges your settings, pass the turn, clear the canvas.
[*][b]Watching it happen.[/b] Every stroke lands in real time, including the painter's view of the simulation.
[/list]

[b]Painting[/b]
[list]
[*][b]Pushing real fluid around.[/b] A GPU simulation with vorticity, pressure and dye transport. Colour keeps moving after you lift the brush.
[*][b]Choosing what the paint is made of.[/b] Loose fluid, wet paint that dries, or thick paint that piles up and holds a ridge.
[*][b]Dialling the physics in.[/b] Viscosity, swirl, wetness and dry time, ridges, micro detail — or just tap Silky, Thick, Wispy, Chaotic, Ethereal, Turbulent, Marble, Electric.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-02-materials.png[/img]

[b]Picking a brush[/b]
[list]
[*][b]Five tips.[/b] Soft for the classic dab, Blob for a notched round stamp, Chisel for a squared press, Streak for an elongated smear, Ring for a thin band with a hollow centre.
[*][b]Turn the brush.[/b] Rotate the tip as you go — chisels and streaks carry their angle.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-08-brushes.png[/img]

[list]
[*][b]Or draw your own.[/b] Sketch a shape and paint with it — every dab lands in the shape you drew.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-15-stamp.png[/img]

[b]Painting in symmetry[/b]
[list]
[*][b]Painting with up to eight arms at once.[/b] Mirrors, quads, rakes, wedges and spirals — and every arm can carry its own colour.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-09-symmetry.png[/img]

[list]
[*][b]Opening the Mandala Studio.[/b] Paint one wedge and watch the whole mandala fill in around it.
[*][b]Zooming in.[/b] A zoom mode for detail work, a focus mode for when the interface should get out of the way.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-03-mandala.png[/img]

[b]Colour and light[/b]
[list]
[*][b]Building palettes.[/b] Save colours, cycle a new one every stroke, or let it run random.
[*][b]Layering colour.[/b] Tint, overlay, multiply, screen and additive blending.
[*][b]Pressing Mutate[/b] when you would rather be surprised — then stepping back through every mutation you liked.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-04-styles.png[/img]

[b]Light[/b]
[list]
[*][b]Drawing a path through colours[/b] and letting the light shift along it as the paint moves.
[*][b]Moving the light around.[/b] A light source you place, glow, clarity, vibrance.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-10-lightshift.png[/img]

[list]
[*][b]Turning on the kaleidoscope.[/b] The whole canvas folds into a tiled figure that keeps moving with the paint underneath it.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-14-kaleido.png[/img]

[list]
[*][b]Giving the paint a surface.[/b] Relief lifts the form and gloss lays a wet sheen over it — the same painting, matte on the left, lit on the right.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-11-shading.png[/img]

[b]Bringing things in[/b]
[list]
[*][b]Dropping in an image.[/b] Drag a file onto the canvas or paste it straight from the clipboard, then move, scale and blend it.
[*][b]Cutting an object out.[/b] Click the thing you want and an on-device model separates it from its background.
[*][b]Turning a photo into terrain.[/b] Depth estimation builds a collider from the picture, and the paint breaks against it.
[/list]

Both models run locally on your own machine, offline, and only on images you
choose to import.

[img]{STEAM_APP_IMAGE}/extras/about-12-imported.png[/img]

[list]
[*][b]Painting your own walls.[/b] Draw colliders by hand and watch the fluid pile up behind them.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-05-collide.png[/img]

[b]Painting to music[/b]
[list]
[*][b]Feeding it sound.[/b] Your microphone, whatever your speakers are playing, or a file you load in.
[*][b]Letting the music paint.[/b] Bass, mids, treble and onsets drive splats, brush size, kaleidoscope and colour.
[*][b]Scoring a piece.[/b] Lay changes out along a timeline and let the canvas follow the track.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-06-music.png[/img]

[b]Keeping it[/b]
[list]
[*][b]Recording your strokes.[/b] Paint onto a replay layer, then play it back — one layer or all of them, quarter speed to quadruple, looping.
[*][b]Exporting it.[/b] Video, GIF, stills, or a numbered PNG sequence.
[*][b]Saving the whole canvas[/b] and loading it back another day.
[*][b]Keeping your presets.[/b] Save your own, export them to a file, hand them to a friend.
[/list]

[img]{STEAM_APP_IMAGE}/extras/about-07-record.png[/img]

[h2]For anyone[/h2]

Nothing here needs to be learned. You put the brush down and colour moves. The
rest is optional depth for the people who want it.

Painting together needs an internet connection. Painting on your own does not.
```

</details>

<details>
<summary>2 · Long store-pack version (no images)</summary>

```
[h2]Paint is a fluid. So paint with someone.[/h2]

Swirl Together is a painting game for two or more people. The canvas is a real
fluid simulation — colour flows, curls, drags and blooms under your brush — and
you are never the only one touching it. Your partner's strokes push into yours.
Yours push back. What you end up with is something neither of you would have
made alone.

There is no score, no timer, no fail state. You are here to make a nice thing
with another person for a few minutes.

[h2]Two ways in[/h2]
[list]
[*][b]Paint with a stranger.[/b] Press one button and get matched with one other
person, somewhere, who wanted the same thing. No chat, no profiles — just two
brushes on one canvas.
[*][b]Paint with a friend.[/b] Share a six-character room code. Up to eight
people on the same canvas.
[/list]

[h2]Real fluid, real paint[/h2]
[list]
[*]A GPU fluid simulation you paint into directly — vorticity, dye transport,
wet paint that dries, thick paint that piles up.
[*]Five brush tips across three paint materials — soft dye, thin acrylic, and
thick acrylic that carves like a palette knife — plus multi-armed mandala
symmetry and custom stamp shapes you draw yourself.
[*]Layers, masks and colliders. Drop in an image and paint around it, or cut a
shape out and let the fluid break against it.
[*]Light that behaves like light: bright paint glows, throws shafts of it
across the canvas, and casts real shadows from anything standing in the way.
[*]Kaleidoscope, colour shifting, surface shading — a deep drawer of look
controls, and a Mutate button for when you would rather be surprised.
[*]Paint that listens to music, if you want it to.
[*]Save a canvas, export a still, or record the whole painting as a video.
[*]Save what you like as a preset, and swap presets with other people.
[/list]

[h2]For anyone[/h2]
Nothing here needs to be learned. You put the brush down and colour moves. The
rest is optional depth for the people who want it.

Swirl Together starts with photosensitivity protection switched on. Rapid
flashes are eased into smooth fades and the rate of brightness change is
capped across the whole screen. It is a checkbox in Display settings, so you
can take it off if you would rather have the raw thing.
```

</details>

<details>
<summary>3 · Three-pillar condensed version (colliders · people · kaleido)</summary>

```
[h2]Paint is a fluid. So paint with someone.[/h2]

The canvas is a real fluid simulation. Colour flows, curls, drags and blooms
under your brush — and you are never the only one touching it. Your strokes
push into theirs. Theirs push back.

No score, no timer, no fail state. Just a nice thing, made with someone else,
for a few minutes.

[h2]Paint your own colliders[/h2]
Draw a shape and the paint breaks against it. Dams, channels, letters, a
silhouette cut out of a photo you dragged in — put something in the way and the
fluid has to find its way around it, catching light and throwing real shadows
as it goes.

[h2]With a friend, or with a stranger[/h2]
Press one button and get matched with one other person, somewhere, who wanted
the same thing. Or share a six-character room code and fill the canvas with up
to eight people you know. No chat, no profiles — just brushes, and whatever the
paint does when it meets in the middle.

[h2]Kaleidoscope and Mandala[/h2]
Mirror your brush across up to eight arms. Fold the whole canvas through a
kaleidoscope. Or open Mandala Studio, paint one wedge, and watch the rest of
the circle paint itself — a single stroke opening like a flower.

[h2]And then there is the rest of it[/h2]
Wet paint that dries. Thick paint that piles up. Layers, masks, shafts of
light, paint that listens to music, and a Mutate button for when you would
rather be surprised. Nothing needs to be learned first: you put the brush down
and colour moves. The depth is there when you want it.

Swirl Together starts with photosensitivity protection switched on — rapid
flashes are eased into smooth fades and the rate of brightness change is capped
across the screen. It is a checkbox in Display settings if you would rather
have the raw thing.
```

</details>
