# Candidate sets — pick one or two per feature

24 photographs in `images/`, grouped by the feature they prove. Every one
is baked from the real sim on the pinned test stage, so any of them can be
re-baked identically or tweaked and re-baked.

**How to use this:** each feature below has 4-5 candidates and a
recommendation. You only need to pick; the copy in `ABOUT-COPY.md` already
has slots, and swapping a choice is a one-line filename change.

---

## 1 · Painting with people — 4 candidates

| File | What it is | Note |
|---|---|---|
| `about-01-together.png` | Two hands meeting off-centre, cool vs warm | **Currently placed.** The calmest; reads as *two people* |
| `about-16-crowd.png` | Six hands from the rim into one shared centre | ⭐ **Recommended.** Identity at the edges, the shared thing in the middle — the whole pitch in one frame, and it says "up to eight" without a number |
| `about-18-headon.png` | Gold and violet colliding head-on into mirrored vortices | Most dramatic. Neither hand wins |
| `about-19-asymmetric.png` | One broad sweep, one small careful mark | Quietest; has empty space if text ever needs to sit on it |

## 2 · The paint itself — 5 candidates

| File | What it is | Note |
|---|---|---|
| `about-02-materials.png` | Fluid / wet / thick, one composition | **Placed.** The material comparison |
| `about-08-brushes.png` | Soft · Blob · Chisel · Streak · Ring specimens | ⭐ **Placed.** Five tips, one palette |
| `about-15-stamp.png` | Seven star dabs from a stamp drawn in-app | **Placed.** Unmistakable proof of custom shapes |
| `about-20-angle.png` | The Chisel tip at four rotations | Weakest of the five — the rotation reads, but the marks are muddy and similar at a glance |
| `about-13-wetness.png` | Wet vs dry, same seed and stroke | Unplaced. Rigorous but subtle — a texture difference |

## 3 · Symmetry — 4 candidates

| File | What it is | Note |
|---|---|---|
| `about-09-symmetry.png` | Mirror, quad, rake, radial-8 with per-arm colour | ⭐ **Placed.** Best of the set — four distinct figures, colours singing |
| `about-14-kaleido.png` | The kaleidoscope tiling | **Placed.** The most striking single image in the whole About section |
| `about-03-mandala.png` | Six-arm radial rosette | **Placed.** Beautiful but overlaps what 09 does better |
| `about-21-armcount.png` | The same gesture at 2 / 4 / 6 / 8 arms | Honest but dim and soft. Include only if you want the "one slider" story explicitly |

## 4 · Colour and light — 5 candidates

| File | What it is | Note |
|---|---|---|
| `about-04-styles.png` | Four built-in presets as one continuous canvas | **Placed.** Silky / chaotic / marble / electric |
| `about-10-lightshift.png` | The colour path over dense paint | **Placed.** Richest colour of the set |
| `about-11-shading.png` | The same paint, matte then relief + gloss | ⭐ **Placed.** Cleanest proof in the whole section — one settled state, one variable |
| `about-23-glow.png` | The same paint, glow off then on | Same device as 11. Good, but two off/on splits side by side in one section is repetitive — pick one |
| `about-24-palettes.png` | One composition in four colour keys | Proves the claim; composition is plain |

## 5 · Bringing things in — 4 candidates

| File | What it is | Note |
|---|---|---|
| `about-12-imported.png` | A picture imported, turned into terrain, paint pooling in its holes | ⭐ **Placed.** The only one that shows an *imported image* |
| `about-26-terrain.png` | Paint running along depth-map contour ridges | ⭐ Strong — reads as landscape without needing a photo |
| `about-27-handwalls.png` | Three hand-drawn walls, paint piling and curling around them | Strong — the barrier reads as something a hand placed |
| `about-05-collide.png` | The pin lattice, vortex streets | **Placed.** The most "physics demo" of the four |

---

## Rejected this round (`images/rejects/`)

Kept on disk in case a second opinion disagrees, but I would not ship them:

- **`about-17-braid.png`** — two hands weaving. Tried twice. Fast strokes
  wash downstream into parallel ribbons; slow strokes never separate and
  blur into one bar. The weave does not survive the medium, which is the
  same lesson the store-screenshot baker recorded about spectrum bars.
- **`about-22-kaleidomodes.png`** — all four kaleidoscope modes as a grid.
  First attempt returned three black cells (mirror modes fold a region the
  stroke never touched); fixed, and the result is muddy, with the
  Mirror-Quad cell reading as moiré noise. `about-14` already sells this
  feature far better.
- **`about-25-stencil.png`** — paint confined inside a cut-out rosette.
  Nice idea, but small and lost in black at first and blown out to white
  when enlarged. Worth another try if you like the concept.

## If you want the page tighter

The strongest eleven, one or two per feature:
`16 crowd` · `18 headon` — `02 materials` · `08 brushes` · `15 stamp` —
`09 symmetry` · `14 kaleido` — `04 styles` · `11 shading` · `10 lightshift` —
`12 imported` · `26 terrain`
