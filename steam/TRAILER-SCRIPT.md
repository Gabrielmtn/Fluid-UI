# Swirl Together — feature trailer

One trailer, **about 72 seconds**, cut once and exported twice: the only
difference between the two files is the last five seconds (the end card).

| Store page | App | Has today (checked 2026-09-26) | Gets |
|---|---|---|---|
| Swirl Together | 5068940 | 1 trailer ("Swirl Together Teaser"), 5 screenshots | this trailer, dragged to **first** place |
| Swirl Together Demo | 5162690 | **no trailer, no screenshots** | this trailer + the same 5 screenshots |

The demo page is empty of media right now. Uploading the five screenshots from
`steam/screenshots/` to it is a two-minute win you can do before any filming.

---

## The rules this cut is built on

- **Most people see it muted.** The store autoplays trailers with the sound
  off, so the words on screen have to carry the whole pitch. Your voiceover is
  for the people who unmute: it adds warmth and detail, it never carries
  something the picture does not.
- **The first 3 seconds are the paint moving.** No logo, no title, no studio
  card. The name comes at the end.
- **The unusual thing inside 10 seconds.** Here that is *other people's paint
  pushing into yours*, so the second painter arrives at 0:08.
- **Show it through the swirls, not the interface.** One 1-second shot of the
  Swirl With a Stranger button is the only UI in the trailer.
- **The words on screen are in the sim.** The opening line and the title are
  typed with the Text tool, so the paint really breaks around the letters. An
  editor can't fake that, and it shows the text feature without a single
  extra shot.

---

## The cut

| # | Time | On screen | Words on screen | Voiceover |
|---|---|---|---|---|
| 1 | 0:00–0:08 | One brush pulls a bright stroke through paint that's already moving. It curls. The brush lifts and the paint keeps going. At ~0:03 the words appear **in the sim** and the paint splits around them. | *Paint is a fluid.* | "This paint is a real fluid. It curls, it blooms, and it keeps moving after you let go." |
| 2 | 0:08–0:22 | A second cursor comes in with a different colour, and the two meet head-on and spin into mirrored whirls. 1-second insert of the **Swirl With a Stranger** button. Then six brushes come in from the edges to one shared middle. | *So paint with someone.* → *A stranger, or up to 8 friends.* | "It's better with someone. One button finds you a stranger. A code brings up to eight friends. Their strokes push into yours. Yours push back." |
| 3 | 0:22–0:34 | A word is typed and the paint breaks around its letters while Scatter light shafts stop at them. A wall drawn by hand, with paint piling up behind it. A photo turned into terrain with paint running down its ridges. | *Put things in its way.* | "Put something in its way (a word, a wall, a photo) and the paint finds its way around." |
| 4 | 0:34–0:45 | One stroke drawn with eight arms, each in its own colour. A mandala filling itself in. The kaleidoscope turning on Spiral. | *One stroke, everywhere.* | "Paint one stroke and watch it repeat: mirrors, spirals, a mandala that fills itself in." |
| 5 | 0:45–0:52 | Audio react, fed the trailer's own music, so the paint pulses on the beat you're hearing. | *It listens to your music.* | "Let your music hold the brush." |
| 6 | 0:52–1:02 | One recorded stroke played back four times in four looks (Liquid opal, Electric bloom, Two currents, Slow marbling), cut on the beat. Then the Light Source sweeping across relief and gloss. | *Replay it in a new light.* | "Record a stroke, and replay it in a completely different light." |
| 7 | 1:02–1:12 | A wide, calm canvas with everyone's paint drifting together. **SWIRL TOGETHER** typed in the sim, Scatter light shafts falling through the letters. End card. | see End cards | "No score. Nothing to get wrong. Just make something nice, with someone." *(beat)* "Swirl Together." |

Every claim here is checked against the build: stranger pairing is 2 players
and a code room holds 8 (`party/shared.ts`), the kaleidoscope really has a
Spiral mode, Liquid opal / Electric bloom / Two currents are shipped looks,
and audio react takes a music file.

---

## Voiceover: the clean read

About 110 words. Read it slower than feels natural. `/` means a short
breath and `//` a real pause where the picture does the talking.

```
[0:02]  This paint is a real fluid. /
        It curls, / it blooms, / and it keeps moving after you let go. //

[0:09]  It's better with someone. /
        One button finds you a stranger. / A code brings up to eight friends. /
        Their strokes push into yours. / Yours push back. //

[0:23]  Put something in its way / (a word, / a wall, / a photo) /
        and the paint finds its way around. //

[0:35]  Paint one stroke / and watch it repeat: /
        mirrors, / spirals, / a mandala that fills itself in. //

[0:46]  Let your music hold the brush. //

[0:53]  Record a stroke, / and replay it in a completely different light. //

[1:03]  No score. / Nothing to get wrong. /
        Just make something nice, / with someone. //

[1:09]  Swirl Together.
```

Record the voiceover **last**, against the finished picture, so the pauses
land on the cuts. A scratch read on your phone during the edit is enough to
time things.

---

## End cards (the only part that differs)

| File | Last 5 seconds say |
|---|---|
| `swirl-together-trailer.mp4` (main page) | **SWIRL TOGETHER** · *Wishlist now on Steam* · *Free demo available* |
| `swirl-together-demo-trailer.mp4` (demo page) | **SWIRL TOGETHER** · *Play the free demo* · *Wishlist the full game* |

Keep dates off the card unless you're sure of them. A "Next Fest" or
"November 2" line goes stale the day it changes, and the trailer outlives it.

---

## Filming it: six short sittings

Each sitting ends with named clips in one folder (not in the repo, since video
files are big): e.g. `Videos\Swirl Together trailer\clips\`, one file per
take, named `3-word-01.mp4`, `3-wall-02.mp4` and so on. Record long takes
(a minute or more) and use the best 2–4 seconds.

### Before the first sitting: the rig (10 minutes)

- **Film the full desktop app**, not the demo (its 5:00 clock is on screen)
  and not the itch playtest (its "0.02 playtest" label is on screen).
- **OBS**: Video 1920×1080, **60 fps**. Recording quality "Indistinguishable",
  format MKV (survives a crash), then File → Remux Recordings to get MP4.
  Window Capture of Swirl Together with **Capture Cursor off**: the app draws
  its own brush ring, and a Windows arrow makes it look like a screen
  recording. (No OBS? Win+Alt+R records too, at lower quality.)
- **In the app**: the highest quality tier your machine holds at a steady
  60 fps, **F** for Focus mode (hides the UI), then the **16:9** format preset
  so the canvas is exactly 1920×1080.
- ⚠ **Focus mode leaves a red FOCUS badge in the top-left corner.** It will
  be in every frame. Either crop it in OBS or have it hidden for filming
  first (see Decisions).

**Ten-minute first step:** set up the rig and film one minute of beat 1: just
paint, slowly, in a look you love. Watch it full screen. If it looks as good
as the app does, the rig is right and everything after this is just more
clips.

### Sitting 1: solo beauty (beats 1, 4, 7)
- Slow, confident strokes. Fast scribbles wash out into parallel stripes on
  video.
- Beat 1: type **Paint is a fluid.** with the Text tool, then paint *through*
  it so the fluid splits around the letters.
- Beat 4: number keys **1–8** set the arm count live, so pressing 8 mid-take
  reads well. Then Mandala Overlay, then the kaleidoscope on Spiral.
- Beat 7 title: type **SWIRL TOGETHER**, turn **Scatter** on (Effects) so
  its light shafts fall through the letters, and let it drift for 20 seconds without
  touching it.
- **Space** freezes the fluid if you need to hold a frame.

### Sitting 2: things in its way (beat 3)
- A word typed onto moving paint, Scatter on, so the light shafts stop at
  the letters.
- A wall painted by hand, then paint pushed at it so it piles up and curls.
- A photo **you own** (your own picture, not one off the internet) turned
  into terrain. The store images avoided third-party photos for the same
  reason.
- Skip Gravity in the text shots. Paint is still lost at walls under gravity
  (known, not fixed yet).

### Sitting 3: together (beat 2) — needs a friend
- The friend on a call, both in one code room, each in a clearly different
  colour. Their cursor in the frame is the point, so keep brush rings **on**
  for this one.
- The head-on shot: start at opposite sides and move toward each other
  slowly.
- The 1-second button insert: open two copies (desktop plus browser) and press
  **Swirl With a Stranger** in both, so the pairing on screen is real.
- Six-from-the-edges: a code room with a few people, or two people doing
  several passes (the edit will hide it).

### Sitting 4: music and replay (beats 5, 6) — needs the track picked
- Beat 5: audio react fed **the trailer's own music file**, so the pulses in
  the footage land on the beats in the finished trailer.
- Beat 6: **F9** records a stroke and **F8** plays it back. Play the same
  stroke four times, switching to a different look before each play
  (the look buttons: Liquid opal, Electric bloom, Two currents, Slow
  marbling). Then one
  take of the Light Source sweeping over relief and gloss.

### Sitting 5: the edit
- Lay the music first and cut on its beats. Beat order and times are above;
  they bend to the music, not the other way around.
- Caption font: one clean sans, white, lower third, 4–5 words at most, on
  screen for at least 2 seconds. (Beats 1 and 7 need no caption, since the
  words are in the sim.)
- Scratch voiceover to check timing, then the real read against the locked
  picture.
- Levels: voice peaks around −3 dB, music dipped roughly 8–10 dB under the
  voice, the whole mix about −14 LUFS.
- No hard flashes faster than three a second: protection is on by default
  and reduces flashing; it does not make the app seizure-proof, and the
  trailer is cut by hand, so check it too.
- Export **1920×1080, 60 fps, H.264 MP4, AAC stereo, ~20 Mbps**. Steam asks
  for 5,000+ kbps and caps at 1080p. Export twice, once per end card.

### Sitting 6: upload (yours, in Steamworks)
1. **5068940** → Edit Store Page → Trailers → upload
   `swirl-together-trailer.mp4`, category *Gameplay*, drag it **above** the
   Teaser. (The first two trailers play before any screenshot.) Keep the
   Teaser second or remove it.
2. **5162690** (the demo) → Edit Store Page → Trailers → upload
   `swirl-together-demo-trailer.mp4`; Screenshots → the five from
   `steam/screenshots/`.
3. Publish each page's changes.

---

## Decisions (yours)

1. **The music track.** It sets the pace of the edit and drives the beat-5
   shot, so it's the one thing to settle before Sitting 4. Whatever you pick,
   its licence has to cover commercial video (a store trailer is advertising).
2. **A date on the end card**, or none (recommended: none).
3. **The FOCUS badge**: crop it in OBS, or have it fade out after a couple of
   seconds in Focus mode (a small app change, also nicer for players).
