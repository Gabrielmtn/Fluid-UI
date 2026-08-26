# Recording ⇄ Animations — action list

*2026-08-24. Companion to [ANIMATION-RECORDER-PROMPT.md](ANIMATION-RECORDER-PROMPT.md),
which holds the reasoning. This file is the checklist. Strike anything you don't want.*

Size tags: **S** = small contained diff · **M** = one focused session · **L** = a real
feature slice. `→` marks what a thing is blocked on.

---

## A. Decisions I need from you (everything below waits on some of these)

Quick ones — a word each is enough:

- [ ] **A1.** Is the recorder a *user-stroke* source or a *programmatic* one? (Gates R10.
      Not reversible per-recording — it changes how every existing recording looks.)
- [ ] **A2.** Dragged path point: recompute velocity from the new tangent, or keep the
      recorded impulse? (Gates R8. Two different animations.)
- [ ] **A3.** Recorder masks — wire them up, or drop them from the layer model? (Currently
      100% inert; a quota bomb if serialised. Gates B8, R1's schema.)
- [ ] **A4.** Does an Animation capture **look + motion** as one Scene, or motion only?
      (Research says look+motion; I originally said motion-only and was wrong. Gates R1's
      schema, so it needs answering before any save work.)
- [ ] **A5.** Which built-ins survive, and do the cut ones get deleted or moved to a
      collapsed "Classic" group? (Gates R7. I'll propose from the generator set if you
      want a starting point.)
- [ ] **A6.** Does the recorder stop being off-by-default? (Gates R15 — and R15 is the
      only thing that makes your "first-timer saves a swirl without a tutorial" test
      reachable at all.)

Bigger, can wait until we're closer:

- [ ] **A7.** Should peers see an Animation fire? (Today: purely local. Cheapest shippable
      form is built-ins-by-id, ~30 lines, no relay change.)
- [ ] **A8.** Is the default output a PNG/clip, with the re-playable Scene as the quieter
      third option?
- [ ] **A9.** Does this feature appear in the Next Fest demo at all, or is saving a
      full-version feature?
- [ ] **A10.** Aspect: letterbox an Animation's frame to its recording aspect, or accept
      the stretch?

---

## B. Bug fixes — no decisions needed, shippable now

These stand regardless of what you decide about scope. Three are live data-loss paths.
**This is where I'd start.**

- [ ] **B1. Dead per-layer buttons.** Move the input guard below the `[data-action]`
      lookup in [03:680](js/03-recording.js:680). Six controls come back to life. **S**
      → do B8 first or this exposes the mask editor against a layer it can't find.
- [ ] **B2. Clear button eats every saved recording.** Add the recording key to
      `clearExceptPresets`'s preserve list ([09:271](js/09-settings-manager.js:271)) — its
      dialog already promises "Your presets are kept." **S**
- [ ] **B3. Check `brush.shapes` and `palettes.*` against that same prefix** — they look
      like they fail it too. **S**
- [ ] **B4. Quota failures report success.** `recSaveActiveLayerAsPreset` ignores
      `sm.set()`'s return. Copy `BrushShapes.add()`'s "Saved only for this session"
      pattern. **S**
- [ ] **B5. Record-twice corrupts the take.** Unsorted timestamps pushed onto a
      binary-searched array; F9-then-Shift+F9 double-arms. Establish the sorted invariant,
      cancel the countdown on every arm path. **M**
- [ ] **B6. Peer paint is recorded into your layer.** Tag origin at `multiSplat`'s entry;
      `recRecordInteraction` accepts `input` only ([05d:521](js/05d-input-replay.js:521)).
      Also fixes "an Animation fired mid-recording bakes itself into the take". **M**
      → must land before anything touches the capture surface.
- [ ] **B7. Animations bypass the Take Turns paint gate.** A blocked watcher can fire
      Smash right now and desync their canvas permanently. **S**
- [ ] **B8. Decide + act on masks** (A3). If dropping, remove the three mask buttons from
      the card markup in the same change. **S–M**
- [ ] **B9. Velocity stored in raw canvas pixels** while position is normalised — so
      recordings aren't resolution-portable. Normalise at capture, denormalise at replay,
      version the schema, store `cw,ch` on the envelope. **M**
      → do before B10/D2, or you migrate broken data.
- [ ] **B10. Delete `recThrottledRefreshUI`** — 35 lines with zero callers and
      authoritative-looking PERF comments that describe behaviour the app doesn't have. **S**
- [ ] **B11. Countdown shows a literal `⏱ ...`** on canvas
      ([styles.css:1157](css/styles.css:1157)). Write the digit into a CSS var. **S**

---

## C. Foundation — build once, three features depend on it

- [ ] **C1. Offscreen scratch sim.** Replay a recording from a blank state into an FBO
      nobody is looking at. Unlocks auto-thumbnails, safe preview, and hover-audition —
      all three previously thought impossible. **M** → nothing; do it early.
- [ ] **C2. Measure the dye+velocity FBO snapshot cost** at the current render cap. That
      number decides whether one-level undo (D7) ships at all. **S**
- [ ] **C3. Measure replay reproducibility** across sim resolution / render cap / frame dt
      using `scripts/test`'s virtual-clock harness. If a recording doesn't reproduce on
      the user's own machine, the honest artifact is video + a look preset, and that
      changes A4/A8. **M**

---

## D. Feature slices, in build order

- [ ] **D1. Collapse the layer card to ≤72px**, settings behind one per-row expander. **M**
      *This alone may satisfy R5 — it's the cheap half, testable in isolation, and it's
      what makes two rows fit in the existing 38vh.*
- [ ] **D2. Recording is non-destructive** — Record always adds a layer; "Re-record" and
      "Add to this layer" move into the row's ⋯ menu; one-deep ↺ per row. **M** → B5
- [ ] **D3. Transport + empty state.** One state-labelled control, loop-length chips,
      a real empty state instead of a hollow "0 interactions" card. Pointer events on the
      timeline and resize handle. **M** → D1
- [ ] **D4. Fire surface vs edit surface.** Panel becomes the grid (tile body always
      fires); name strip selects into the drawer; drawer loses its play button; 2–4
      emitter slots; Stop All that's safe to mash. **L** → A4
- [ ] **D5. Save / rename / delete / update Animations** + the versioned upcast migration
      + collapse the four save forks into one serialiser. **L** → A4, B2, B4, B9
      *One slice — the store's shape is only open once.*
- [ ] **D6. Path overlay.** All layers' paths at once, numbered badges, dark-cased
      dual-stroke, one "Show paths" toggle, static opacity. New overlay on the
      mandala-mode pattern — not an adaptation of the broken one. **L**
      *Needs a measured frame-time delta with 4 layers on a non-dev GPU.*
- [ ] **D7. Recorder undo provider** + one-level "Put it back" after a fire. **M** → C2
      *R8 must not ship before this — a bound-but-wrong Ctrl+Z is worse than none.*
- [ ] **D8. Path selection + point editing.** All new code; reuse `perpendicularDistance`
      and 26-layer-transform's drag lifecycle. Shift+Arrow, not bare arrows. **L**
      → A2, D6, D7
- [ ] **D9. Row thumbnails** rendered through C1, plus the vector sparkline overlay. Fix
      the duration-owner mismatch between the two strips while there. **M** → C1
- [ ] **D10. Promote the four existing generators** to real Animations; bake any survivor
      that lacks one, at `multiSplat`'s entry, behind an explicit bake mode. **M** → A5, B6
- [ ] **D11. Right-click alternate** as a split control with a persistent second segment
      (right-click alone isn't reachable on Deck or touch), plus detach. **M** → D5
- [ ] **D12. Custom brush on replay** — pin `__brushTipOn`/BRUSH_TIP/BRUSH_SHAPE_ID around
      the recorder's call. **Do not flip `exactColor`.** **M** → A1
- [ ] **D13. Loop behaviour** — One-shot / Loop-N with a count. Flash floor on the
      user-edit paths only. **S–M**
- [ ] **D14. Import made non-destructive + validated.** Currently wipes your working set
      before validating anything, and D5 turns it into user-to-user sharing. **M** → D5
- [ ] **D15. Error surfaces** that don't depend on the drawer being open. **M**
- [ ] **D16. Discovery / retroactive capture** — "Keep the last 10 seconds of painting".
      **L** → A6, B6
- [ ] **D17. Multi-cell filmstrip** — the thing you originally asked for. Deliberately
      last: judge it after D9, since D6 may already answer "which path am I tweaking". **L**

---

## E. Cheap wins that aren't really this project

Surfaced by the research; noting them so they don't get lost.

- [ ] **E1. Attract mode.** After N seconds idle on a near-empty canvas, one animation
      plays itself; any input takes over instantly. Free trailer footage, free streamer
      footage, a no-tutorial teacher — and it needs no timeline, no save UI, no
      reversibility. Probably the highest value-per-hour item in this whole document. **M**
- [ ] **E2. Stills gallery** — thumbnails of past high-res exports, restorable as a look. **M**
- [ ] **E3. Great still export** (high-res, optional transparent background, UI hidden).
      On Steam, let Steam Game Recording handle motion; ship GIF/MP4 on web only. **M**

---

## Suggested first move

**B1–B4, B7, B10, B11** are seven small, independent, decision-free fixes — including two
that are silently destroying user data. That's a clean first commit while you work through
section A.
