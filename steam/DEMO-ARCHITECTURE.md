# Demo architecture — Swirl Together Demo

**Written 2026-08-23**, the day the demo app was created on Steamworks (store
item `1299084`; the demo **AppID itself is still needed** — see §9).

This supersedes NEXT-FEST-PLAN.md Workstream A and REFACTOR-AUDIT.md §9.2's
WS-A row. The fest dates in §9 still govern: demo exists ~**Sep 7** for the test
window, demo build + store page in review **Sep 21** for Press Preview.

---

## 1. What the demo is

**Decision (Gabriel, 2026-08-23): the demo ships the whole app.** Nothing is cut
from the build. Specific parts are **gated open on different days**, so every
subsystem gets exercised by real users, on real hardware, before launch.

This replaces the "lite client" the fest plan described, and it is a better fit
for three separate reasons:

- **It is a test campaign.** Staged exposure means a bug that shows up on
  Thursday is a *masks* bug. Everything-at-once produces reports nobody can
  attribute. The demo becomes the pre-launch QA pass we never scheduled.
- **It is a retention mechanic.** The fest is Oct 19–26 — seven days, one
  rotation. Fest ranking feeds on demo engagement, and "come back Thursday, the
  masks open" manufactures the repeat sessions that ranking rewards.
- **It removes the entire subtraction problem.** No build-time exclusion, no
  loader-array rewriting, no coupling analysis across 71 classic scripts, no
  risk of a missing global that stays silent until a visitor clicks the thing.
  The demo build is the studio build with a different App ID and a flag.

Everything I drafted about excluding modules and shrinking the download is void.
The 116 MB of models ships. So does the mask editor.

Also void: the solo-versus-paired question. The full app already works alone, so
the 3am visitor is served by construction. Pairing stays the hook and never
becomes the gate.

---

## 2. The gate schedule

This is the one genuinely new system, and everything else is small.

### The day index

A single integer, derived from the date in **UTC**, that selects a row from the
schedule. UTC and not local time, for two reasons: two strangers who pair across
a timezone must have the same features open or the session breaks in confusing
ways, and "today is masks day" has to be true for everyone at once for word of
mouth and streamers to work.

The rollover will therefore land mid-afternoon for some players. Accepted — a
shared world beats a tidy midnight.

### Remote, with a baked fallback

The schedule must be changeable **without shipping a Steam build**. A Steam build
update during fest week is slow, visible, and invites "what did they patch"
speculation. So:

1. On boot, fetch the schedule from a remote source.
2. On failure — offline, blocked, rate-limited — fall back to a schedule
   **baked into the build**. A Steam demo must work with no network.
3. Cache the last good fetch, so a transient failure doesn't reset a player
   mid-session.

Serve it from the **PartyKit relay** rather than a GitHub raw URL. We already
depend on the relay being up (it *is* the multiplayer), it costs one route, it
avoids a second external dependency and a second thing to CORS, and it can serve
the day index authoritatively so a clock-changed machine doesn't disagree with
its own peers. GitHub raw stays the emergency backup if the relay is down —
though if the relay is down, the demo has bigger problems.

**Clock tampering: don't build a defence.** Someone who sets their system clock
back to open the mask editor a day early is a person enjoying our app. The
relay's index wins when reachable; that's enough.

### Shape

```json
{
  "version": 1,
  "epoch": "2026-10-19",
  "rotation": [
    { "day": "Sunday",  "opens": ["layers"],      "label": "Layers" },
    { "day": "Monday",  "opens": ["masks"],       "label": "Masks & colliders" },
    { "day": "Tuesday", "opens": ["roto"],        "label": "Instant Roto" }
  ],
  "always": ["sim", "brush", "colour", "multiplayer", "presets"],
  "never":  []
}
```

`always` is the floor and must contain everything needed for the app to be worth
opening alone: the sim, the brush, colour, the look controls, and multiplayer.
**The core never closes.** A schedule that can close the brush is a schedule that
can ship a demo that does nothing.

`never` is the escape hatch — a feature we discover is broken during the fest gets
moved there remotely, in seconds, without a build.

### Closed is visible, not hidden

A gated control stays on screen, styled closed, labelled with when it opens.

This is the whole conversion mechanic and the whole tender mechanic at once. A
hidden feature teaches a visitor the app is small. A closed one teaches them it
is large, and gives them a reason to come back — which is the fest-ranking
behaviour we want anyway. It also means the gate needs no new UI surface: it is a
state on controls that already exist.

---

## 3. The capability layer

`js/00b-edition.js`, loaded **before** `js/00a-boot.js` (index.html:143), because
the boot path already branches on desktop-vs-web and will need edition too.

```js
window.Edition = { name: 'studio' | 'demo' | 'web', is: fn };
window.Gate = {
    open:  function (feature) {},   // is it open right now
    opensOn: function (feature) {}, // for the label on a closed control
    today: function () {}           // the row, for the "today" banner
};
```

In the **studio** build `Gate.open()` returns `true` unconditionally and no
schedule is fetched. That is the property that keeps this safe: the paid app
takes no behavioural dependency on a remote file, and the absent-flag path — the
one that must never regress — is a constant function.

Call sites read `Gate.open('masks')`, never `Edition.name === 'demo'`. Feature
names, not build names, or this smears back into the global sprawl §1.5 already
flags as a refactor target.

`<body class="edition-demo gate-closed-masks">` carries it to CSS, alongside the
existing `electron-mode` / `web-mode` tagging in
[00-window-controls.js:13](../js/00-window-controls.js:13) — same pattern
extended, not a second mechanism.

---

## 4. What the paid boundary is now

Worth deciding deliberately, because "everything ships" removes the old answer.

**Proposal: the demo lets you touch everything and keep nothing.** Play with the
whole app, on rotation; the paid app is where work becomes permanent — video
export, `.fluid` save, the preset vault in `Documents/`, image export.

That line is honest, easy to explain in one sentence on the store page, needs no
feature to be withheld, and matches what people actually buy creative tools for.
It also means the demo's own gate list stays purely about *testing cadence*
rather than doing double duty as a paywall, which keeps both stories clean.

**Not decided — Gabriel's call.** If export should rotate open too, say so and
the schedule handles it; the mechanism doesn't care.

---

## 5. Build pipeline

Now nearly trivial, which is the point.

**Desktop:** `electron-builder.demo.json` overriding `productName`
(`Swirl Together Demo` → `Swirl Together Demo.exe`) and `appId`, plus
`extraMetadata` carrying the edition. Same `files`, same everything else.
`npm run dist:demo`.

**Web:** `scripts/build-web.js --edition=web|demo` injects `window.__EDITION` in
the same post-copy index.html rewrite that already handles cache-busting
([build-web.js:71-78](../scripts/build-web.js:71)). PartyKit serves one static
path (`"serve.path": "public"`), so hosting a gated web build *and* the current
one needs a second project or path routing. Not blocking; noting it early.

**Steam:** `steam/app_build_demo.vdf` + `steam/depot_build_demo.vdf` for the demo
appid/depot. `scripts/steam-upload.js` takes a target argument and everything it
already solved carries over — the space-free junction for steamcmd, the
stale-exe-name guard, running from `steam/` so relative content roots resolve.

One trap the checklist already caught: **`depot_build_demo.vdf` must not declare
its own `contentroot`.** SteamPipe resolves it relative to the app build's, and
declaring both produces `dist\dist\…`.

**Cheap win, unrelated:** `locales/` is 45 MB of Chromium translations for an
English-only app. `electronLanguages: ["en-US"]`. Applies to the studio build too.

---

## 6. Steam wiring

`STEAM_APP_ID` is hardcoded to `5068940` at
[electron-main.js:206](../electron-main.js:206) and must become edition-derived.
A demo shipping the parent's App ID is the classic "demo won't launch outside
Steam / reports the wrong app" failure.

The upsell has a native answer worth using:

```js
steamClient.overlay.activateToStore(5068940, StoreFlag.None);
```

`overlay.activateToStore` opens the **full game's store page in the Steam overlay
without leaving the demo** — wishlist button right there, canvas not lost. Strictly
better than shelling to a browser, and it pairs naturally with a closed control's
"opens Thursday — or open it now" affordance.

Catch: the overlay needs `in-process-gpu`, flagged as risky over our GL surface at
[electron-main.js:226](../electron-main.js:226). **Verify in week one.** Fallback
is `shell.openExternal('steam://store/5068940')`, which does drop them out of the
app.

---

## 7. Cross-edition play

**Demo and studio players share rooms.** A demo player pairing with an owner is
the funnel, and splitting the pools halves the population during the one week it
needs to be dense.

The gate adds a time dimension to a problem that already existed:

1. **An `edition` and open-feature set in the client hello.** A studio host's
   settings-lock and turn-look snapshots must be filtered against what the
   receiver actually has open, or a host silently drives a control the demo has
   closed today. The sanitizer already exists (`sanitizeLockSnapshot`,
   [06-multiplayer.js:569](../js/06-multiplayer.js:569)) and gains a capability
   filter.
2. **The settings-lock relay forgery gate** (§9.4 item 6, ~6 lines in
   `party/index.ts` + ~3 client). The relay forwards `settings-lock` from any
   sender. This lands in the demo's single relay deploy, along with the schedule
   route and the ledger counter.

Good news from reading the relay: it holds no canvas state, so a demo client
joining a studio host needs no snapshot machinery. Both painters start blank
together, which is the nicer story anyway.

**Open question:** when a demo player has masks closed and their partner doesn't,
what should the demo player see? Options are see-but-can't-touch, or the host's
masks simply don't render for them. See-but-can't-touch is more tender and more
likely to sell; it's also the harder render path. Flagged, not decided.

---

## 8. Making it an actual test

"So we can test everything pre-launch" only pays off if failures come back to us.
Today `window.__reportError` shows the player a card (index.html:100) and tells
us nothing.

Minimum worth building: an **error beacon to the relay** carrying the error, the
GPU adapter string, the open-feature set, and the build ID — no canvas content,
no identifiers beyond the existing device UID. That turns each fest day into a
report about one subsystem, which is the entire premise of doing it this way.

Two constraints: it must be **disclosed and declinable** (Steam requires a privacy
disclosure for data collection, and a demo about tenderness should not be quietly
phoning home), and it must be **rate-limited and fail-silent** — a beacon that
errors inside an error handler is a boot loop.

The GPU-adapter field earns its place on its own: the iGPU-versus-discrete split
that cost days on Gabriel's own 4090 machine is invisible today and would be one
column in a report.

---

## 9. Open items

**Gabriel, dashboard:**

1. **The demo AppID and its depot ID.** The creation dialog shows store item
   `1299084` and three packages; the AppID is on the demo app's landing page.
   Nothing in §5 or §6 can be wired without it.
2. **Associate the demo with the parent app** so the "Download Demo" button
   appears on `5068940`'s store page.
3. **Launch option** for the demo build once its depot exists — same trap as the
   parent, where a stale exe name shipped an app that could not start.
4. **Publish the demo's app config** before the first SteamPipe upload. The
   parent hit `Access Denied` for exactly this: SteamPipe checks the *published*
   config, so a depot that exists only in the working copy is invisible to it.
5. **Privacy disclosure** on the demo's store page if the beacon ships (§8).

**Design, still open:**

6. **The rotation itself** — which features on which of the seven fest days, and
   what the pre-fest (Sep 7–Oct 19) schedule is during the actual test window.
7. **The paid boundary** (§4) — is "touch everything, keep nothing" the line?
8. **Mixed-gate sessions** (§7) — see-but-can't-touch, or don't render?
9. **Fixed canvas aspect** in the demo (old open decision #6) — cheapest fix for
   force-direction skew across arbitrary monitors.
10. **The leave-a-bad-match affordance** (old open decision #7). Still the largest
    unmitigated risk for a demo whose pitch is "a stranger is here."

---

## 10. Order of work

1. `js/00b-edition.js` — edition flag, `Gate` with a **baked** schedule only, body
   class. Studio path returns `true` unconditionally and is verified unchanged.
   *Foundation; nothing else starts without it.*
2. Gate a single feature end to end (masks is the best first subject — big,
   self-contained, obviously closed when closed). Prove closed-not-hidden reads
   right before gating anything else.
3. `electron-builder.demo.json` + the demo vdf pair + upload target. Boot the
   demo build clean, launched from Steam, before going further.
4. Steam wiring: edition-derived App ID, overlay upsell, verify the overlay
   composites over GL.
5. Remote schedule route on the relay + fetch/fallback/cache in the client.
6. Relay deploy, once: schedule route + forgery gate + edition hello + ledger
   counter.
7. Error beacon and its disclosure.
