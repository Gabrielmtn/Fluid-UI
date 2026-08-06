# October Next Fest — Plan

**Strategy:** demo-first. The stranger client *is* the Next Fest demo, *is* the free tier,
*is* the marketing hook. Full app keeps cooking behind it. Launch lands after the fest,
into a room we spent six weeks filling.

**Tagline (locked):** *A playful painting game for two or more*

---

## The gate that reorders everything

Next Fest is **unreleased games only**, **once per game**, and requires a **playable demo
live during the fest week**. You also need the **store page approved and live** before you
can register. That inverts the current todo list: the deliverable is no longer "ship the
app," it's **demo + store page + trailer**.

### The real calendar (from Steamworks, Oct 2026 edition)

| Date | What it gates |
|---|---|
| **Aug 18**, 10–11am PDT | Live Q&A on Zoom — free info, 12 days out |
| **🔴 Aug 31**, 11:59pm PDT | **REGISTRATION DEADLINE.** Miss this and there is no October. |
| **Sep 7** | Valve extracts trailers for the official Next Fest compilation — trailer must exist by now to be considered |
| **🔴 Sep 21** | Demo build + store page due **to be in Press Preview** — the real build deadline |
| Oct 5 | All required items submitted for review (hard backstop) |
| Oct 8, 10am PDT | Press Preview opens — journalists start browsing |
| **Oct 19–26** | The festival |

**Sep 21 is the deadline that actually matters for us**, not Oct 5. Our single biggest
asset is a press-able story, and Press Preview is literally when press look. Missing
Sep 21 means launching the hook into the fest with no press runway.

That's ~6.5 weeks to a finished demo + store page. Tight, not unreasonable.

Known good: the 30-day Steam Direct release gate started 2026-07-29, clears ~Aug 28.
Not binding.

- [ ] Confirm on the dashboard that October shows as available to opt into (registration
      is per-fest; make sure nothing app-specific blocks it)

---

## Sequencing — the hidden critical path is the store page

Aug 31 is the *visible* deadline, but registration needs a **live store page**, Valve's
review takes **3–5 business days**, and **it can bounce**. A bounce inside the last week
of August means missing the fest for a reason that has nothing to do with the game. So:

**Store page submitted by ~Aug 17**, not Aug 31. That's ~11 days, and it needs the 11
rebuilt assets and the copy. That — not the demo — is the first thing that must move.

Rough order:
1. **This week:** store assets rebuilt → store page submitted. Trailer footage capture starts.
2. **Aug 18:** Valve Q&A (1h, free).
3. **By Aug 31:** registration confirmed on the dashboard.
4. **By Sep 7:** trailer exists (official compilation cutoff).
5. **Sep 7–21:** user-test the lite client, iterate, final demo + store page in for Press Preview.

## User testing — retarget it at the demo

The existing plan (`8-6-todo-pre-test.md`) was written to test the **full app**. That's now
the lower-value test. Fest visitors will touch the **lite client** and nothing else — that
is the thing 10,000 strangers form an opinion about in ninety seconds.

- [ ] Test the lite client, not the studio
- [ ] ⚠️ **Practical wrinkle: a two-player game needs testers in pairs.** Solo testers can't
      exercise the core loop. Either recruit pairs, or be the second painter yourself
      (which biases the session — you'll paint helpfully). Worth solving early; it's a
      scheduling problem, not a build problem.
- [ ] The 90-second question to answer: does a stranger understand what's happening, and
      does the presence of another person land as *tender* rather than confusing?

## Workstream A — The demo / "lite" client  *(mine, biggest new build)*

No scaffolding exists today. Net new. But it's mostly **subtraction**, which is why it's
tractable: the guest UI simply doesn't render the controls the host owns.

- [ ] Build-flag a lite mode (same codebase — `scripts/build-web.js` + a separate Steam
      depot; do NOT fork)
- [ ] Lite UI: join/paint only. No sidebar, no layers, no masks, no export, no presets.
- [ ] Guest permanently adopts host settings (the settings lock, but structural)
- [ ] Daily canvas: the cold-start answer when two strangers match and neither brought a world
- [ ] "Someone is here" presence label (replaces `Artist-83`)

**This kills a pile of open work.** The settings-lock coverage gap (2.1 — 6 checkboxes +
`materialMode` bypassing the lock) mostly evaporates: you can't bypass a control that
isn't rendered. Same for layers/branding not mirroring — the lite client has no layers.
Subtraction beats gating.

## Workstream B — The communal ledger  *(mine)*

The hook. Must be visible **in the demo**, because that's where the story lands.

**Hard constraint: Steam has no real-time purchase or wishlist webhook.** Sales and
wishlist numbers come from partner reports on a delay. So the counter is **updated by
hand**. That is not a compromise — per the WinRAR logic, a hand-kept tab is *more* tender
than an API. "Updated most mornings."

**Pre-launch the ledger counts wishlists, not purchases.** During the fest nobody can buy,
so there'd be nothing to count — and this converts the tender mechanic into the exact
metric Next Fest exists to generate. Wishlisting becomes an act of generosity rather than
self-interest. Same inversion as the purchase version.
- [ ] ⚠️ Sanity-check Valve's rules on wishlist-linked promises before building the copy on it

- [ ] Durable counter (partykit — same shape as the lobby's waiting pointer, genuinely small)
- [ ] Coverage language, never a countdown: "covered through Thursday", "running on goodwill today"
- [ ] Never show zero. The gate never actually closes.
- [ ] The buyer's receipt — "your copy opened the canvas for everyone for X days." Prioritize
      this over the visitor-side modal; it's the screenshot moment.
- [ ] The visitor's note — one dorky, honest box. Write it once, never A/B test it.
- [ ] **Don't build ownership verification.** The failure mode of a faked claim is "the
      canvas stays open," which is the goal anyway.

**Held back deliberately** (each is a post-launch press beat, not v1): dedications/pinned
dates, ambient "weather" as the bank runs low, featured creator canvases.

## Workstream C — Store page  *(assets mine, trailer + copy Gabriel's)*

- [ ] **Redo all 11 store assets.** Current set says "Fluid Simulation / Creative Simulation
      Engine" — wrong name *and* wrong register. Rebuild under "A Small Good Thing" +
      the new tagline. Precedent exists (the icon generator in scratchpad).
- [ ] Store description leading with the communal hook, not the feature list
- [ ] **🔴 TRAILER — Gabriel, long pole, hard date Sep 7.** Valve pulls trailers on Sep 7
      for the official Next Fest compilation — that's free placement in front of the whole
      fest audience, and it's gone if the trailer doesn't exist by then. Needs footage of
      two people painting together. **Start this week**, not after the demo is done.
- [ ] Submit store page for review (Valve takes ~3-5 business days and can bounce)

## Workstream D — Backlog, triaged hard against this strategy

**Still matters:**
- [ ] ⚠️ **Deploy the stranger-matchmaking fix** (`party/lobby.ts` + client keep-alive).
      In a demo-first strategy "join a stranger" *is* the product; the 60s stranding bug
      would be fatal during the fest. Client and server must ship together.
- [ ] Feel-test the dab-train parity fix (peer may run slightly hot)

**Deprioritized by the demo strategy:** settings-lock coverage gap, layer/mask parity,
canvas-size force dependence (matters less when the demo controls its own window).

**Done:** XSS fixes, dead-ID cleanup, localStorage guard, rebrand, underbar ghost buttons,
brush-colour lock mirroring.

---

## Open decisions (Gabriel)

1. **Price.** The mechanic argues *upward*: the demo is the funnel, so the paid tier is
   post-conversion, and a higher price makes each purchase more visibly generous.
   $14.99 is plausible ceiling; $9.99 is safe.
2. **Daily budget = the honest number, or a symbolic one?** If it's the real figure
   (~$93/day for $2,800/mo net), the ledger becomes genuinely moving and true —
   "nine people kept it open today" — but it publishes that this is someone's rent.
   Transparent is on-brand and vulnerable. Your call.
3. **Launch date** relative to the fest, against the ~13-week runway.
4. **Week-7 checkpoint** on the calendar (see runway conversation).
