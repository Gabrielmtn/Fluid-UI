# Swirl Together — architecture map (relay + client)

Written 2026-09-10 as groundwork for the call / return play modes; **revised
2026-09-11** after the cut that followed: settings-share circles are gone,
"One swirl each" became **Call and return** with a relay-side backstop, the
turn-length picker became a slider, and the 3,650-line client was split into
five files. Line numbers are against the working tree of 2026-09-11; the code
is the truth when they drift.

Companion docs: `MP-AUDIT-2026-08-23.md` (the 8-user audit; several of its
findings are closed now, noted below), `RELEASE.md` (deploy), probes under
`scripts/test/mp/` (`mp-callreturn.js` is the one for the stroke rhythm).

---

## 0. TL;DR

- The relay is a **dumb-ish broadcast** with a small set of **managed** rules:
  host, lock, capacity, the take-turns holder gate. Room state persists to
  Durable Object storage and re-hydrates on wake.
- Local paint reaches the wire as a **dab train** (one `splat` per ~33 ms
  carrying up to 96 quantised dabs); peer paint is applied **from a per-frame
  budgeted queue**, not in the socket handler.
- Two look modes, one precedence rule: **turns > lock**. Turns has two
  rhythms on one machinery: **Take turns** (a clock, 30 s–5 min) and **Call
  and return** (one swirl each; the painter's client passes the brush when
  the swirl settles; the relay's idle backstop passes it if they go quiet).
- The client is five classic scripts sharing one global scope
  (`js/06a…06e-mp-*.js`); only load order matters.
- What still bites: `clientId` regenerating on reconnect, the 16 KB silent
  drop, no canvas sync for a late joiner, and the inbound queue dropping from
  the front under load.

## 1. Rooms, transport, lifecycle

**Client files** (loaded in this order by the async chain in `index.html`):

| file | owns |
|---|---|
| `js/06a-mp-core.js` | state globals, device id + relay host, room codes, stranger matchmaking + keep-alive, socket lifecycle, heartbeat, `onMultiplayerMessage` (the dispatch switch) |
| `js/06b-mp-look.js` | 13.5 settings lock, look snapshot capture / fit / sanitize / apply, the look mirror |
| `js/06c-mp-turns.js` | rotation state + gates, countdown, chip, queue, the two rhythm buttons + length slider, stranger invites, the call-and-return auto-pass |
| `js/06d-mp-paint-wire.js` | brush shapes + colliders over the wire, the dab train, inbound queue + `handleRemoteSplat`, replay strokes |
| `js/06e-mp-panel.js` | remote cursors, connected / disconnected views, Code / QR / Hide, copy, control listeners, `window.*` exposes, init (runs last) |

**Transport.** One WebSocket per room at
`wss://<host>/parties/fluid/<roomId>?uid=<DEVICE_UID>`, plus a lobby socket
`/parties/lobby/main?uid=…` for matchmaking. `DEVICE_UID` (`06a:55`) is an
opaque localStorage id: the lock re-admission key, never broadcast.
`PARTYKIT_HOST` (`06a:71`) is the page's own origin on any real web host,
`swirltogether.com` on the desktop build, overridable with
`localStorage.fluidMultiplayerHost` (how a local relay is tested). On
swirltogether.com the relay runs under partyserver via `party/worker.ts` with
`hibernate: false`; eviction is still possible, hence `ensureLoaded()` at
the top of every handler that reads durable state.

**Room kinds** (`party/shared.ts`):

| id shape | kind | cap | host / lock / turns |
|---|---|---|---|
| `pub-XXXXXX` | stranger pair, minted by the lobby, never typed, kept out of the URL hash | 2 | no meaningful host; either member may drive turns |
| bare 6-char code | private invite room, deep-links via `#CODE` | 8 | host by storage compare-and-set; reversible lock |
| `sys-*` | pure passthrough for sub-apps | none | none (`managed` is false) |

**Close codes** the client treats as terminal (`06a:741` onward): **4001**
locked, **4002** full. **4003** (65 s heartbeat reap, `index.ts:23`) stays
retryable.

**Lifecycle** (`06a`): `connectToRoom` (345) resets role / lock / turn state
→ `doConnect` closes any existing socket, 8 s connect timeout →
`onMultiplayerOpen` resets published shapes and colliders, republishes walls
after 1.2 s, starts the 20 s ping → `onMultiplayerClose` (741) reconnects
with full-jitter backoff, five tries, then `giveUpConnection` (779) keeps
`lastRoom` for the Reconnect button. `disconnectMultiplayer` (423) is the
full teardown. A stranger pair ends when either person leaves
(`strangerPartnerLeft`, 328); a lone waiter keeps its lobby slot alive
(`startStrangerKeepAlive`, 267).

## 2. Message catalog

### Client → relay (play room)

| type | payload | who may send | relay does |
|---|---|---|---|
| `ping` | `{}` | anyone | swallowed; stamps `lastSeen` for the reaper |
| `splat` | `{data:{x,y,dx,dy,color,mult,radius,sym,down?,dabs?:[[x,y,dx,dy,r]…]} + brush fields}` | **holder only while turns run** | broadcast; in stroke mode also pushes the idle backstop out |
| `cursor` | `{data:{x,y}}` | anyone, incl. watchers | broadcast, client throttles to 50 ms |
| `pointer-up` | `{}` | anyone | broadcast |
| `clear` / `preset` | `{}` / `{data:{preset}}` | holder only | broadcast |
| `stroke`, `stroke-chunk` | `{data:{events}}` ≤80 events / `{sid,seq,total,events}` | holder only | broadcast; both count as paint for the backstop |
| `brush-shape` | `{id,rev,name,seq,total,part}` 11 000-char parts, ≤32 | anyone — deliberately ungated | broadcast |
| `collider-add` / `collider-remove` | geometry + PNG coverage parts / `{lid}` | holder only | broadcast |
| `lock` | `{locked}` | host only | `lock-state` to all |
| `settings-lock` | `{locked, snapshot?}` | host only; refused while turns run | broadcast |
| `turn-look` | `{snapshot}` | holder only; dropped when turns are off | broadcast |
| `turns` | `{on, seconds, mode}` — `seconds` 30–300 from the slider, `mode` `'timer'` or `'stroke'` | host; in a pair either member may turn OFF, nobody may turn ON directly | `turn-state` |
| `turn-invite` / `turn-invite-response` | `{seconds, mode}` / `{accept}` | public rooms only; only the person asked may answer | routed offer, then `turn-state` or `turn-invite-result` |
| `turn-pass` | `{}` | holder or host | `turn-state` |

Lobby: `matchmake {uid, holding?}` → `matched {roomId, waiting}` or
`matchmake-error`, 3 s per-uid throttle. A waiter keeps its lobby socket
open as a pin and re-announces every 40–50 s; the lobby's pointer TTL
(`WAIT_TTL_MS`, `shared.ts`) was raised from 60 s to **150 s** on
2026-09-11 because a backgrounded tab's throttled timers can run one
keep-alive late, and one late refresh against a 60 s TTL stranded the waiter
(the next seeker minted a fresh room; reproduced by
`scripts/test/mp/mp-lobby-ttl.js`). The pin's close and the play room's
vacate call still clear the slot at once, so the TTL only bounds how long a
waiter that died without a close frame can strand seekers. The `share-*` family was removed on
2026-09-11; an old client sending it gets nothing back.

### Relay → client (SERVER_AUTHORED; forged copies are dropped)

`connected` (carries `clientId, role, locked, capacity, roomKind`),
`client-count`, `lock-state`, `host-changed`, `turn-state`,
`turn-invite-offer`, `turn-invite-result`, `turn-invite-sent`. The client
double-checks `turn-state` with `if (data.clientId) break;` because an older
relay forwards anything.

### Gates, in one place

- **Size cap** 16 KB, silent drop (`shared.ts:11`). Only the look-snapshot
  path (`fitLookSnapshot`, `06b:190`) handles it.
- **Take-turns gate** `TURN_HOLDER_ONLY` (`index.ts:36`): splat, stroke,
  stroke-chunk, clear, preset, turn-look, collider-add, collider-remove.
  `cursor` / `pointer-up` stay open so watchers keep a cursor.
- **Host gates**: `lock`, `settings-lock`, `turns` on.
- **Default relay** force-stamps `data.clientId = sender.id` — load-bearing:
  every client-side reassembly keys on it.
- **Client-side throttles**: `broadcastSplat` 33 ms, `DAB_FLUSH_MS` 33,
  cursor 50 ms, look mirror 400 ms debounce + 2 s diff poll.

## 3. The two look modes

`mirrorActive()` (`06b:239`): **turn** (only if it is my turn) beats
**lock**. `syncLookMirror` (`06b:283`) installs or removes the capture-phase
input/change listener and the poll.

| mode | scope | enter | exit | what it gates on the client |
|---|---|---|---|---|
| Settings lock (13.5) | room-wide, host → guests | host toggles (`toggleSettingsLock`, `06b:287`), sends a filtered look snapshot | host toggles off; turns switching on supersedes it | `window.__mpSettingsLocked` read at `05h:504`, `04b:61`, `12:998`, `20:1019`, `44:78` |
| Take turns / Call and return | room-wide rotation | `turns {on:true}` or an accepted invite; `applyTurnState` (`06c:53`) clears the lock | `turns {on:false}`; room empties | `__mpTurnBlocked` (pointerdown `05d:842`, touch `05d:1347`, clear `04f:51`, Breathing `45:164`, collider publish) and `__mpSettingsLocked` for non-holders |

Mutual exclusion is enforced in two places that must keep agreeing:
`mirrorActive()` and the relay's refusal of `settings-lock` while `turnsOn`.

## 4. Paint over the wire

**Outbound** (`06d`). `05j:539` calls `window.queueDab(x/w, y/h, dx, dy,
radius)` per BrushEngine dab; `queueDab` (509) quantises and force-flushes at
`DAB_MAX_PER_MSG` 96; `flushDabs` (527) emits one `splat` carrying `dabs`
plus per-message `color/mult/sym` and `brushWireFields()` (78). Positions
ride **normalised**, velocities **absolute**. The legacy single-`splat` press
stamp still fires from `05d:953/1389` and `05g:406` with `down:true`.

**Wire shape of a dab (2026-09-11):** `[x, y, dx, dy, r, share, k, t]` —
normalized position, ABSOLUTE velocity (pointer px × 10, injected verbatim),
ramped radius, the dye share the dab was painted with (Flow × splat-in ×
density share through `normalizePaintFlow`), the density share alone (for
the swirl push's velocity), and ms since the message's first dab. The message
also carries `base`, the unbaked colour, beside the baked last-dab `color` an
old receiver reads. Elements 5..7 and `base` are additive.

**Inbound** (`06d`). `'splat'` → `enqueueRemoteSplat`, **not** applied in the
handler. Queue cap `INBOUND_QUEUE_MAX_DABS` 2000, dropping from the front;
`window.__mpDrainInbound(budget)` runs once per frame from `05j` with the
same dab budget as the local brush. Since 2026-09-11 the drain is **paced**:
each message's dabs play at their recorded offsets behind a 50 ms jitter
buffer (`DAB_PACE_JITTER_MS`), a run of due dabs per frame, with the
sender's brush pinned per run (`handleRemoteSplat(data, from, to)`); a
message without offsets plays whole, as before. Every numeric is clamped;
dab velocities against `DAB_VEL_ABS_MAX` (30000, an fp16 guard) — **the
previous ±1 clamp, copied from the legacy normalized fields on 2026-08-26,
cut every peer dab's momentum to ~1/500**, so watchers got the dye of a
stroke and none of its push: dots that never smeared or curled. Measured
with the loopback harness (`scripts/test/mp/wire-loopback.js`, local stroke
vs the same messages replayed through the receive path): before, dye 43% and
correlation 0.53 against the painter's own stroke; after, additive 89% /
0.87 and Gate 103% / 0.97, with runs every ~18 ms instead of 33 ms batches.
Closes audit §1.1 and the 2026-09-11 "spotty, staggered, inaccurate" report.

**Peripherals.** Cursors (`06e:21` → `51`). Brush shapes chunked on pick
(`33:252` → `06d:44`), reassembled by `clientId|id|rev` (113). Colliders as
coverage PNG + normalised geometry + content-hash `rev` (`06d:286-360`).
Replay strokes normalised at `05d:411` → `broadcastReplayStroke` (`06d:985`)
→ chunks of 80 events by `sid/seq` → `handleStrokeChunk` (1045) →
`scheduleStrokeReplay` (`05d:734`).

**Not synced, by decision:** the canvas itself (a late joiner starts blank);
layers, masks, recordings; per-arm push flags; recording/stats/autoload and
the sketch-workflow toggles (`MP_PERF_LOCAL_KEYS`, `06b`); PhotoSafe (a
snapshot can never switch protection off); peer asset cleanup on a peer's
departure. **Resolution and the fps cap DO ride the mirror since 2026-09-11**:
measured with every other control mirrored, they were the only keys left
differing between painter and watcher, and this sim is resolution- and
step-size-dependent, so the watcher moved differently with an identical
sidebar. The numeric resolution travels in its own `resolution` section (so a
Custom value carries), the watcher applies it the way an explicit pick does
(config + framebuffer re-init + `QualityGovernor.pinResolution()`), and its
governor remains the safety valve that can step DOWN by measured fps.
Residual: two machines whose displays deliver different frame rates still
step the sim at different dt (the fps cap is a ceiling, not a clock); exact
motion parity would need a fixed-timestep accumulator in `05j`.

## 5. Turns: two rhythms, one machinery

**Server state** (`party/index.ts`): `turnsOn, turnQueue[uid], turnHolder,
turnMs, turnDeadline, turnMode` persisted; `turnIdleAt` in memory only.
Wire shape: `{type:'turn-state', on, holder:<connId|null>, order:[connId…],
turnMs, mode, deadline, timestamp}` — uids are mapped to connection ids so
the lock key never leaves the server.

**Rotation.** `enableTurns(starterUid, seconds, mode)` puts the starter
first, appends every other connected uid, clamps `turnMs` to 10–600 s or
pins it to 0 in stroke mode, then `armStrokeIdle()`. `advanceTurn` walks
forward, skipping uids with no live connection. Joiners append without
changing the holder.

**Take turns (timer).** `onAlarm` sweeps zombies, then advances if
`Date.now() >= turnDeadline - 250`, re-arms, persists, broadcasts. Clients
only *render* the clock, skew-corrected from the message timestamp. The
length comes from the `#turnLength` slider (30–300 s, `turnTimerSeconds`,
`06c:459`); a host moving it mid-round restarts the current turn's clock.

**Call and return (stroke).** `turnMode:'stroke'`, `turnMs = 0`, no deadline
on the wire (no clock for the player). The painter's client fires the pass:
`broadcastPointerUp` → `scheduleOneSwirlPass` (`06c:642`) sets
`_oneSwirlSpent` at once and polls `swirlFullySettled()` (629) every 100 ms
with a 4 s cap, then sends `turn-pass`. **Backstop (new 2026-09-11):** the
relay keeps `turnIdleAt = now + STROKE_IDLE_MS` (45 s, `index.ts:31`),
pushed out by every paint message from the holder (`PAINT_TYPES`,
`index.ts:65`) and re-armed at every hand-over (`armStrokeIdle`); `onAlarm`
passes the brush when it expires. The alarm is not re-armed per dab: it
fires at the old time, sees the deadline moved, and re-arms then. A wake
starts a fresh grace period. Verified by `scripts/test/mp/mp-callreturn.js`
(13 checks) and by a real two-tab session: a host that painted once and
then sat idle lost the brush without anyone pressing anything.

**Invites** (public rooms only): the relay always answers the asker —
`turn-invite-result {accepted:false, reason:'alone'|'same-device'}` when no
partner with a different uid exists; otherwise a routed `turn-invite-offer`
plus `turn-invite-sent` back. Crossing invites auto-accept. TTL 30 s. The
invite carries `mode`, so "Ask for call and return" and "Ask to take turns"
are the same flow (`sendTurnInvite`, `06c:498`; prompt at 538).

**Holder disconnect:** the uid leaves the queue only if it has no other live
connection; if it was the holder the brush goes to whoever was next, the
deadline restarts, the backstop re-arms. Empty room → full reset.

**UI** (`06c`). `updateTurnUI` (364) renders the two rhythm buttons
(`#turnsBtn`, `#callReturnBtn`) — only the running rhythm's button shows,
as "Stop …" — the length slider row (timer rhythm only, host while running),
and Pass. `renderTurnWheel` (295) labels rows **Call / Return / 3rd…** in
stroke mode and **Now / Next / 2nd…** in timer mode (`turnPosLabel`, 242).
The chip (`updateTurnChip`, 162) and status line say "Your call" /
"Artist-XX’s call".

## 6. Call / return: what shipped, what is left

Shipped as the stroke rhythm renamed and backstopped (above). Left, in the
order they earn their keep:

1. **Echo** — the return is generated: when the call ends, the responder's
   client replays it transformed (mirrored, rotated, hue-shifted, slowed).
   Reuses the recorder → `stroke-chunk` → `scheduleStrokeReplay` round-trip
   (`05d:26,371,734`; `06d:985,1045`). New: recording the *live* call as an
   event list beside the dab train, a transform picker, an "echo is playing"
   gate. Send the call as one `stroke-chunk` sequence, not the dab train —
   the inbound queue drops from the front under load.
2. **A volley count** in `turn-state` if the pair wants a score to talk
   about. Additive field, persisted with the rest.
3. **Duet windows** (timed call, timed return) only if Volley wants a clock.

Constraints that still apply to any of them: persist before you announce
(`await this.persist()` precedes every state broadcast); `ensureLoaded()`
first; new server-authored types into `SERVER_AUTHORED`, paint-shaped ones
into `TURN_HOLDER_ONLY` and `PAINT_TYPES`; relay and client deploy together
(`npm run deploy:cf`); 4001/4002 terminal, 4003 retryable.

**What will still bite:** `clientId` regenerates on reconnect (every
peer-keyed map re-keys; key anything durable on `uid` server-side, as
`turnQueue` does); the 16 KB silent drop (chunk like `stroke-chunk`); no
canvas sync for a late joiner (say so in the UI rather than solve it now).

## 7. Housekeeping noticed, not fixed

- Canvas ASPECT is not shared: the sim grid takes the canvas element's
  aspect, positions ride normalized per axis, so two windows of different
  shape stretch each other's strokes. A room-level "shape" (the host's, set
  at join) is the fix; not built — a decision for Gabriel, since a resize
  re-inits framebuffers.
- `updateRemoteCursors` (`06e:51`) calls `clearRemoteCursors()` before its
  reuse branch, so every cursor element is recreated on every message.
  Audit §1.3 still open.
- `layer.__peerOwner` is set "for cleanup when they leave" but only ever read
  as a publish filter; nothing cleans peer assets up on departure. Audit
  §1.6 still open.
- `onClose` broadcasts `client-count` before the careful `remaining` filter.
- `scripts/test/inventory/determinism.json` still names
  `js/06-multiplayer.js` with line numbers; the file is gone.
- The `.claude/worktrees/sleepy-perlman-0d842a` worktree still holds the
  UNCOMMITTED fixed-arm dye-share fix (9 files). Its three hunks in the old
  multiplayer file (dab train, `handleRemoteSplat`, `broadcastReplayStroke`)
  all land in `06d-mp-paint-wire.js` now, so that fix re-applies against one
  file.
