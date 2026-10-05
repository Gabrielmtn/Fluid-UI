# Pre-User-Test TODO — 2026-08-06

Source: wide audit of `steam-prep` (10 parallel auditors over `git diff main...steam-prep`)
plus a live two-tab multiplayer session against the real partykit relay.

**Headline: zero blockers.** The build boots clean, painting works (pixel-verified),
Glow toggles cleanly, all fresh-user defaults are correct, and live multiplayer pairing
plus splat sync work end-to-end. What follows is everything the audit *did* find.

---

## 1. Fix before the user test

### 1.1 — XSS: two unescaped Mask Editor headers · DONE ✅
- [x] `js/15-layer-masking.js:245` — `${layer.name}` now `${window.escHtml(layer.name)}`
- [x] `js/15-layer-masking.js:1642` — `${layer.title}` now `${window.escHtml(layer.title)}`

**Verified live:** served file shows 2 escaped sites / 0 unescaped; an
`<img src=x onerror=…>` payload through the exact template renders as inert text —
0 `img` nodes created, `onerror` never fired. Boot and painting clean afterward.

Both survived the 5337429 hardening pass. The same fields are already escaped in
`js/05k-layers-render.js:89`/`:175` via `window.escHtml()`, so this is a copy of an
existing pattern. Layer titles are user-editable and round-trip through saved/imported
`.fluid` projects — a script-bearing title executes when the mask editor opens, which
under Electron `nodeIntegration` is code execution.

### 1.2 — ~~Settings lock never engages on the guest~~ · RESOLVED: harness artifact, NOT a product bug
- [x] Reproduced, root-caused, and retested with distinct device identities

**What happened:** the first live test showed the host locking (button → "🎛 Unlock
settings", `settingsLockOn: true`) while the guest's `__mpSettingsLocked` stayed `false`.

**Root cause — my test setup, not the app.** `DEVICE_UID` is stored in localStorage as
`fluidDeviceId`, which is **per-origin and therefore shared across tabs of the same
browser**. The relay assigns host by uid (`party/index.ts:100-101`:
`if (!this.hostId) this.hostId = uid;` then `role = uid === this.hostId ? "host" : "guest"`),
so both of my tabs came back `role: "host"` — and `js/06-multiplayer.js:546` correctly
never gates a host. Two real participants on two devices get distinct uids and it works.

**Verified fixed-by-reality:** re-ran with `fluidDeviceId` overridden to `GUEST999` in the
second tab and a fresh room code (the server persists `hostId` in durable storage, so a
new code is required). Guest then reported `myRole: "guest"`, `__mpSettingsLocked: true`,
and the "🔒 Settings locked by host" banner rendered. **No code change needed.**

**Real but minor residue:** two tabs on the *same device* both become host, so the lock
silently no-ops. That's exactly how you'd demo it solo — worth knowing before the test,
not worth fixing for it.

**Don't repeat these two false positives:**
- `brushSize` has `max="30"`; a synthetic set-to-55 snapping to 30 is native range
  clamping, not the lock gate.
- `brushSize` is *deliberately* exempt from the lock — `js/05h-slider-bindings.js:494-496`
  says so explicitly ("Painting controls (brushSize etc.) are unaffected"). Test the gate
  with a registry-bound sim slider like `curl` instead (verified gated).

**Harness caveat:** audit tabs are hidden so rAF is paused (drive `window.update()`
manually) — websocket messages still deliver normally.

---

## 1.3 — Painter sees curl, peer sees a blob · ROOT-CAUSED · **breaks the core promise**

Gabriel observed it live in a `#PARITY` room: same settings, same resolution, yet one
client's stroke curls into filaments while the other's is a soft diffuse blob. He called
it "a distinctly different amount of force." That's exactly right, and it is **not** a
settings-sync problem — the lock can't fix it, which is why matching resolution didn't.

**Primary cause — remote velocity is divided across gap-fill dabs.**
`js/06-multiplayer.js:711-712`:

```js
const stepDx = canvasDx / (steps + 1);   // steps ≤ 8, so up to a 9× reduction
const stepDy = canvasDy / (steps + 1);
```

The local painter's dabs each carry the **full** `pointer.dx` (raw pixel delta, injected
straight into the velocity field — `js/05i-sim-stats.js:122`,
`gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0)`). The remote peer's dabs each
carry **1/(steps+1)** of it, spread along the path.

Total momentum is preserved — and that was deliberate, fixing an older bug where each of
~30 gap-fill dabs got full velocity and "blew the velocity field into fp16 static." But
**vorticity is nonlinear in the velocity gradient**: the same total momentum delivered as
many weak impulses produces far less curl than a few strong ones. Hence painter = curl,
peer = blob. The peer is *always* the blobby one.

**Secondary cause — force scales with each client's canvas pixel size.** Sender
normalizes by its own canvas (`js/05d-input-replay.js:491-492`,
`pointer.dx / canvas.width`); receiver multiplies by *its* own
(`js/06-multiplayer.js:681-682`, `dx * canvas.width`). Net:
`received_force = sent_force × (receiver_width / sender_width)`. Two differently-sized
windows therefore inject different force for the identical stroke, and because `dx` uses
width while `dy` uses height, a differing aspect also **skews the force direction**.

**Tertiary cause — the stream is decimated twice.** A 33 ms throttle on the send side
(`js/05d-input-replay.js:487`) *and* again inside `broadcastSplat`
(`js/06-multiplayer.js:603`) caps peers at ~30 updates/sec, while the local BrushEngine
emits dabs at `BRUSH_SPACING` density. So the peer reconstructs a coarser stroke from
fewer samples — the textural difference on top of the force difference.

### IMPLEMENTED 2026-08-06 — broadcast the real dab train ✅

Stopped having the receiver *invent* the stroke. The painter's BrushEngine dab train is
now broadcast as-is and replayed verbatim.

- `js/06-multiplayer.js` — new `queueDab()` / `flushDabs()`. Dabs accumulate and flush on
  a 33 ms timer (**batched, never dropped** — the old path dropped everything between
  samples). Each dab carries `[x, y, dx, dy, radius]`: position normalized, **velocity
  absolute**, radius per-dab so the splat-in ramp survives too.
- `js/06-multiplayer.js` `handleRemoteSplat` — applies each dab with **its own full
  velocity**. No gap-fill, no `/(steps+1)` division.
- `js/05j-update-loop.js` — queues each dab as it is applied locally, flushes per frame.
- `js/05d-input-replay.js` — the old per-pointermove `broadcastSplat` now yields when the
  brush engine is driving (`!window.BrushEngine`), or peers would be painted twice.
  Touch path gated the same way.
- `broadcastPointerUp` force-flushes so the stroke's tail dabs aren't stranded.

**Backward compatible:** the message keeps its legacy `x/y/dx/dy` fields (final dab, old
normalized units) alongside the new `dabs` array, so a client on the previous build still
renders the stroke through its existing path rather than seeing nothing.

**Verified live**, two clients at identical 810×650, distinct device IDs, host+guest on
the real relay: sender emitted **595 real dabs batched into 8 messages** (previously ~2
sampled splats for the same stroke); guest rendered it — density 4.74, 440 839 non-black
pixels; zero console errors either side; local painting unaffected (dye 14.8M).

**Known residual — temporal concentration.** Painter velocity-field sum measured 281 vs
guest 914 on the same stroke. Momentum per dab is now correct, but the guest applies a
whole 33 ms batch within one message event while the painter spread those dabs across
frames with dissipation in between, so the peer can run slightly *hot* where it used to
run cold. The synthetic harness exaggerates this (the virtual clock lets the engine drain
far more dabs per frame than real input does), so judge it by feel first.
- [ ] Feel-test. If the peer now looks too energetic, add a receive-side drain queue so
      the guest spreads incoming dabs across frames the way the painter's engine does.
- [ ] Separately: make the force unit canvas-size independent so window size stops
      changing physics at all (see the secondary cause above — not addressed by this fix).

**Note:** the simulation grid is *also* aspect-derived (`js/05c:155-165` — long side =
base, short side scaled by aspect), so a portrait and a landscape window run different
grids (e.g. 474×512 vs 512×250 cells at the same "512" setting). That's a real second
parity gap, but it is **not** what produces curl-vs-blob.

## 1.4 — Underbar chrome removed, quality controls are ghost buttons · DONE ✅

Gabriel: the canvas border sometimes appeared to run *behind* the quality underbar.
Root of the visual conflict was simply that the bar painted a solid plate in front of the
border. Rather than fight the z-order, the plate is gone.

`css/20-mixer-strip.css`:
- `#quality-underbar` — dropped `background` (was a `linear-gradient(180deg,#2c2f34,#1b1e23)`),
  `border-top`, `border-right`, and `box-shadow`. Nothing to occlude the border any more.
- Added `pointer-events: none` on the bar with `pointer-events: auto` on its children, so
  the now-invisible bar can't swallow clicks meant for the canvas underneath it.
- `.qub-dd-btn` — ghost style: transparent fill, transparent border, plus a text-shadow
  so the label stays legible over light *and* dark artwork now that there's no plate
  behind it. It materialises into a real control背 background + visible border) only
  on `:hover`, while `.open`, and on `:focus-visible` for keyboard users (solid
  background + visible border at that point).

**Verified live** (computed styles + interaction): bar `background-image: none`,
`background-color: rgba(0,0,0,0)`, `border-top-width: 0px`, `box-shadow: none`; button
`background: rgba(0,0,0,0)`, `border-color: rgba(0,0,0,0)`, text-shadow applied. Both
dropdowns ("Visual Quality" / "Physics Detail") still open, list renders 6 options, and
selecting one still drives the hidden native `<select>` and `config.DYE_RESOLUTION`.
`elementFromPoint` over the bar's empty area now returns `canvas-area`, confirming clicks
pass through. Screenshot unavailable in this environment (Browser pane not compositing),
so this was verified by computed style and behaviour rather than by eye — worth a glance.

## 1.5 — "Paint with a stranger" strands lone waiters · ROOT-CAUSED + FIXED ⚠️ NEEDS DEPLOY

Gabriel: "Play with a stranger doesn't appear to be working nicely." Reproduced and
root-caused live against the deployed relay. **Two distinct server bugs.**

**Bug A — the 60-second stranding.** `party/lobby.ts` holds ONE `waitingRoomId` pointer,
and `onAlarm` drops it once `WAIT_TTL_MS` (60 s) elapses. But the waiter is still sitting
in that room — the client closed its lobby socket the moment it got `matched`
(`js/06-multiplayer.js`, `closeMatchmaking()` runs immediately). So after 60 s the lobby
has forgotten a room that still has a live person in it. The next seeker finds no waiting
pointer, mints a **different** room, and waits too. **Both people now sit alone in
separate rooms showing "Waiting for a stranger…" and can never be paired.** For a user
test where people click this minutes apart, that is the common case, not the edge case.

**Bug B — self-pairing.** The lobby never recorded *who* was waiting. A second matchmake
from the **same device** inside the TTL was handed its own waiting room with
`waiting:false` — "matched!" with itself, alone. The 3 s throttle only hides the
double-click case.

**Verified working (not bugs):** pairing itself is correct — two seekers landed in the
same `pub-` room, roles host/guest, 2 clients. The status text already distinguishes
"🎲 Waiting for a stranger…" from "🎨 Painting with a stranger". And the vacate path
works: when a waiter leaves cleanly, the next seeker correctly gets a fresh room rather
than the dead one, so `INTERNAL_SECRET` server-to-server is wired up right.

### Fix
`party/lobby.ts` — track `waitingUid` (persisted alongside the pointer, rehydrated in
`onStart`, cleared in `onAlarm`/`vacate`). The pairing critical section now has three
branches: same-uid → **refresh** the TTL and return the same room (keep-alive, never
self-pair); different uid → pair as before; no live pointer → mint.

`js/06-multiplayer.js` — a 45 s keep-alive (inside the 60 s TTL) that re-announces to the
lobby while alone in a stranger room, so the slot never expires. It starts from
`updateConnectedView` when alone, stops the moment a partner arrives, on any non-stranger
room, and in `disconnectMultiplayer`. If the lobby hands back a *different* room, someone
else was already waiting and we join them. Also cleared `_dabQueue` in
`disconnectMultiplayer` so one room's dabs can't leak into the next.

- [ ] ⚠️ **These must ship together — the client change needs the server change.** Against
      the OLD deployed lobby, the keep-alive's second matchmake self-pairs (Bug B), which
      silently surrenders the waiting slot and makes the client hop rooms every 45 s.
      `npm run deploy` (partykit) is required for the fix to take effect on web. I have
      NOT deployed — that's outward-facing and your call.
- [ ] Re-verify after deploy: two devices clicking "Paint with a stranger" >60 s apart
      should still pair. `party/lobby.ts` type-checks clean (`tsc --noEmit`, exit 0).

## 1.6 — Brush colour didn't mirror during a lock · ROOT-CAUSED + FIXED ✅

Gabriel: "the main brush isn't updating for the brush colors in multiplayer during lock."
Reproduced, traced, fixed, verified.

**The data was arriving fine.** Instrumenting the guest's `applyPresetSnapshot` showed it
*received* exactly the right thing — `colors.brush: "#00ff88"`, `armColors[0].mode:
"fixed"`, `checkboxes.stepPalette: false` — and then clobbered it, ending on picker
`#2c5f2d`, `arm0.mode: "step"`, `stepPalette: true`. So neither the snapshot, the
sanitizer, nor the wire was at fault.

**Root cause: an ordering bug inside `applyPresetSnapshot`.** The colour/arm restore runs
early (`js/12-save-load.js` ~897-926) and releases the `__brushColorRestoring` guard right
after. The **palette** restore runs later (~943). `applyPalette`
(`js/01-config.js:251-263`) is written for the user-initiated flow, where picking a
palette should auto-enable "Step through palette" and load the palette's first colour —
so it force-set `stepPalette` and rewrote the picker. That `change` event reached
`mirrorCheckboxToArm0` (`js/05g-arm-colors.js:244`), which flipped `arm0.mode` to `step`.
Net effect: the palette restore silently overwrote the brush colour that had just been
mirrored from the host. Stack traces confirmed the exact sequence.

**Fix (two lines of intent, both minimal):**
- `js/12-save-load.js` — hold `__brushColorRestoring` *through* the palette restore and
  release it (plus the single `syncBrushColorUI()`) immediately after, so the snapshot's
  brush state stays authoritative.
- `js/01-config.js:256` — `applyPalette` skips the picker rewrite and the step-mode
  auto-enable while `__brushColorRestoring` is set. Manual palette picking is untouched.

**Verified live** (host green `#00ff88`/step-off/palette 1, guest red `#ff0000`/palette 2
so the palette restore genuinely runs): after lock the guest matches on all five —
picker `#00ff88`, `arm0.mode` `fixed`, `arm0.color` `#00ff88`, `stepPalette` false,
palette 1 — and `pointer.color` is `[0, 1, 0.533]`. **No regression:** picking a palette
by hand still auto-enables step mode and loads the palette colour exactly as before;
preset apply and settings save still work; zero console errors on either client.

**Related, still open:** the guest can immediately undo any of this — the colour picker,
palette swatches and `stepPalette` are among the controls that bypass the lock (see 2.1).

## 2. Fix before Steam launch

### 2.0 — Does locking give 100% visual parity? · MEASURED

**Verdict: yes at the moment of locking, for everything the snapshot covers — but it
doesn't stay that way.** Setting aside layers/masks/branding (which never mirror by
design), the look mirror is effectively complete. The real problem is durability, not
coverage: see 2.1.

Tested end to end: host given a non-default look (Glow on, micro-detail on, Color Gate
on, Curl 40, density 0.97, palette 3), guest joined at its own defaults, host locked,
then diffed all 63 `config` scalars.

**The mirror itself works well — 62/63 matched**, including palette index. The
`captureLookSnapshot` rework (`06-multiplayer.js:171-210`) does its job. But parity is
not 100%, for five separate reasons:

1. **Layers, masks, and branding never mirror at all.** The snapshot is taken with
   `{lookOnly: true}`, which by design "skips layer/mask/branding/recording
   serialization" (`06-multiplayer.js:174-176`) because they need GPU readbacks and
   dataURL encodes. A host with raster layers, an active mask, or a branding overlay
   looks materially different from the locked guest. **This is the biggest gap.**
2. **Resolution and FPS are deliberately local** — `MP_PERF_LOCAL_KEYS`
   (`06-multiplayer.js:166-169`) excludes `visualResolution`, `physicsResolution`,
   `fpsCap`. Different dye/sim resolution = visibly different fluid detail. Intentional
   (perf tiering), but it *is* a visual difference. My test only matched here because
   both happened to sit at 2048/512.
3. **The guest can diverge freely after locking** via the 9 controls in 2.1 below.
4. **The 16 KB palette shed is NOT a realistic risk — measured.** `broadcastSettingsLock`
   drops `userPalettes`/`savedColors`/`lightShiftPath` past 14000 bytes. Live numbers:
   snapshot is **2008 bytes** with **11992 bytes of headroom**, and a palette costs
   **142 bytes** — so it takes roughly **85 custom palettes** to trip. No action needed
   unless someone is a palette hoarder.
5. **Host UI/config drift propagates — but it's negligible here.** The one mismatch was
   `PRESSURE_DISSIPATION` (host `0.95`, guest `0.944`). Root cause is *not* the lock: the
   host's own `pressureDissipation` slider read `0.944` while its `config` held `0.95`.
   The snapshot captures **UI values**, so the host sent what its slider said. The guest
   applied it correctly — the host is the one whose config disagrees with its own UI.
   Any such drift shows up as a host↔guest difference.

- [ ] Decide whether "locked" is meant to imply layer/mask parity (1) — if yes that's a
      much larger piece of work than 2.1, since it needs layer data on the wire.
- [ ] Decide whether resolution should ride the lock after all (2).
- [x] Shed behaviour measured (4) — ~85 palettes to trip, no action needed.
- [ ] Low priority: host-side slider/config drift on `pressureDissipation` (5).

**Bottom line: the mirror is good. 2.1 is what stops it being the guarantee you want.**

### 2.1 — Settings-lock coverage gap · CONFIRMED LIVE · ~2 h · needs a design call first

`__mpSettingsLocked` is checked at exactly three choke points:
`js/05h-slider-bindings.js:497` (slider input), `js/04b-presets.js:44` (preset click),
`js/12-save-load.js:825` (`applyPresetSnapshot`). Everything else bypasses it, so a
locked guest's look diverges and stays diverged — the host's 2 s mirror poll only
re-broadcasts when the *host's* own look changes.

**Confirmed by live sweep** on a genuinely locked guest (flipped every checkbox and
select, diffed `window.config` before/after). 22 controls were inert; these 9 wrote
straight through the lock:

| Control | Config it moved |
|---|---|
| `colorGate` | `COLOR_GATE`, `BLOOM_CEILING` |
| `macCormackToggle` | `MACCORMACK` |
| `multigridToggle` | `MULTIGRID` |
| `microDetailToggle` | `CLARITY`, `VIBRANCE` |
| `glowToggle` | `GLOW` |
| `ascendToggle` | `DENSITY_DISSIPATION`, `VELOCITY_DISSIPATION`, `SPLAT_RADIUS` |
| `visualResolution` | `DYE_RESOLUTION` 2048 → 4096 |
| `physicsResolution` | `SIM_RESOLUTION` 512 → 2048 |
| `materialMode` | `VELOCITY_DISSIPATION`, `PRESSURE_*`, `CURL` |

**Correction:** the two resolution selects are *deliberately* local — `MP_PERF_LOCAL_KEYS`
(`06-multiplayer.js:166-169`) excludes them from the lock snapshot on purpose, with the
governor's look-preserving ladder cited as precedent. So they are working as designed,
not bugs, and they only need revisiting if you decide resolution should ride the lock
(see 2.0 item 2). That leaves **7 genuine bypasses**: the 6 checkboxes plus `materialMode`
— all of which *are* in the snapshot, so the host mirrors them and the guest can then
silently undo them.

- [ ] **Design call (Gabriel):** which controls stay exempt? Painting controls are
      deliberately exempt today (`05h:494-496`). Getting the exempt list wrong would
      lock a guest out of their own brush — worse than the bug.
- [ ] Implement. Note the handlers are bound individually (no central site), so either
      ~9 scattered guards or — cleaner — one capture-phase `change`/`input` swallow
      installed in `setSettingsLockedByHost`, with an explicit exempt allowlist. The
      capture-phase approach reuses the `stopImmediatePropagation` technique already at
      `05h:497` and won't drift as controls are added.
- [ ] Live two-tab retest **with distinct `fluidDeviceId` values** (see 1.2).

### 2.2 — Public-facing rebrand leftovers · DONE ✅
- [x] `README.md:1` — now `# A Small Good Thing`, with the "a painting game for two" line
- [x] `comfyui-node/pyproject.toml` — DisplayName + description
- [x] `comfyui-node/__init__.py`, `nodes.py`, `web/fluid_ui_autoqueue.js` — node display
      name, `LOG` prefix, docstrings, browser console prefix
- [x] `server-relay.js` — HTTP banner, file docstring, startup log

`grep -rn "Fluid UI" comfyui-node/` now returns nothing. **Deliberately kept:** the
`Repository` URL in `pyproject.toml` (real repo URL, not a display name) and internal
identifiers — `FluidUIImageLoader` class key, `fluid_ui_autoqueue.js` filename,
localStorage namespaces, `.fluid` format id. Renaming those breaks compat for no
user-visible gain. Python and JS files pass syntax checks.

None of this ships in the Steam build; it's what someone sees landing on the repo.
Core in-app rebrand was already verified complete.

---

## 3. Cleanup · DONE ✅

- [x] `js/12-save-load.js:59-60` — deleted dead `sunraysWeight` / `sunraysToggle`, plus
      `brushRefreshRate` (removed Splat Rate, same dead-entry class) from
      `FALLBACK_SLIDER_IDS` / `FALLBACK_CHECKBOX_IDS`. Served file confirms 0 remaining.
- [x] `js/01-config.js:272` — `localStorage.setItem('curatedPaletteIndex', …)` now
      try/caught. **Verified live** by stubbing `localStorage.setItem` to always throw:
      `cyclePalette()` no longer throws uncaught, the palette still advances, the step
      indicator still runs, and normal persistence recovers afterward.
- [ ] Decide whether the web build should bundle model weights instead of streaming from
      Hugging Face (`js/vendor/transformers/fluid-env.js:27-32`;
      `scripts/build-web.js:20` never copies `models/`). Currently by design — but web
      SAM/depth needs internet at runtime.

---

## 4. Deliberately deferred

**Collider knee divergence** — `js/23-depth-collision.js:1280`. The CPU knee normalizes
by `__obsStrengthMax` across layers, so with two collider layers at different strengths
the weaker one gets silently amplified toward the stronger. The GPU path (`05b`) applies
the knee to coverage *before* the per-source strength multiply, so the two paths diverge.

Single-layer (the common case) is unaffected, and fixing it changes collision behavior —
this wants a feel-test, not a quick patch before a user test.

---

## Verified clean (no action)

Old presets and settings snapshots apply safely (registry-routed; removed keys warn and
skip). Sunrays removal is complete outside the two dead fallback entries. Glow blend
state, FBO resize, and defaults are all correct, and it's off by default. No
backtick-in-GLSL regressions — every `js/*.js` parses. All 35 static + 26 dynamic scripts
in `index.html` exist, load order sane. Pen-pressure removal is total (zero refs). The
render-cap rollback held (`setRenderCap` / `RENDER_MAX_LONG_SIDE` absent). Multiplayer
echo loops are fixed and unknown/removed param keys from old clients are dropped safely.
Steam packaging is solid — App ID 5068940, VDFs, icon, model bundling, guarded
steamworks init. Fresh-user defaults all correct: wetness influence 0, DEBAND 0,
SPLAT_SCISSOR on, SHADE_RELIEF 1.0 / SHADE_GLOSS 0.35, Glow off.

---

## Status — 2026-08-06

**Done and verified live (UNCOMMITTED on `steam-prep`):** 1.1 and all of section 3.
Four files touched: `js/15-layer-masking.js`, `js/12-save-load.js`, `js/01-config.js`
(+ this file). All three pass `node --check`; app boots clean, paints (106k dye energy,
0 GL errors, 0 JS errors).

**Resolved without code:** 1.2 was a harness artifact — see above.

**Remaining, in order:**
1. **2.1** — needs Gabriel's design call on the exempt list before implementing
2. **2.2** — rebrand leftovers, can ride along with any commit
3. Section 3's third bullet (web model bundling) — a decision, not a fix
4. Section 4 — deferred by choice
