# Sync log (F5) — notes

Two headless Chromes in one room on a local relay, a fixed sequence of changes on client A, every WebSocket message B received (and A sent) logged and normalised. This is the "identical message log" gate for the Walnut & Copper prep: a CSS step that changes what a control sends, or what reaches the other player, changes this log. Written by `prep/baseline/scripts/sync-log.js`. Captured 2026-10-17 at HEAD `c4796da`, Chrome 155.0.8059.80 headless, viewport 1584×805 CSS px, DPR 1, `--ui-scale` 1, wrangler 4.130.0 relay on `127.0.0.1:8787`.

## Files

| File | What |
|---|---|
| `log.json` | The record: `env` (both clients, Chrome, HEAD, relay host as the app resolved it, device ids, state before the room / after the join), `relay`, `processes` (before/after, own pids), `sequence`, `steps` (each action's return value), **`compared`** (what `--check` diffs: `bRecv`, `aSent`, `aRecv`, `bSent` normalised and attributed to steps, `personalAbsent`, `landed`, `stepResults`), `timing` (page-clock `t` per message and the step marks, not compared), `personal`, `counts`, `raw` (the unnormalised messages with real ids and timestamps), `problems` |
| `log.md` | Human copy: environment, counts, **step → what B received** (type, keys, the values that landed), the personal controls confirmed absent, what landed on each side, the join phase in order, the full welcome look |
| `relay.md` | How the relay was started, pointed at, and stopped; what the clients read; the fallback; known log noise |
| `relay.log` | stdout + stderr of the relay process for the capture (two `101 Switching Protocols` lines for the room, nothing else) |
| `NOTES.md` | This file |

## How to run

```bash
node prep/baseline/scripts/sync-log.js            # capture -> prep/baseline/sync/ (about 25 s)
node prep/baseline/scripts/sync-log.js --check    # re-capture into prep/work/sync-check/ and diff `compared`; exit 1 on any difference
```

No dev server, no Electron, no `npm install`, nothing on port 9333. The script starts its own relay (`node node_modules/wrangler/bin/wrangler.js dev --port 8787 --ip 127.0.0.1 --persist-to <fresh OS-temp dir>`, i.e. what `npx wrangler dev` runs; `partykit dev` on 1999 is the fallback, `RELAY=host:port` uses one already running), boots two Chromes through `scripts/test/radial-menu/driver.js` (`boot()`: own static server on the repo root, scratch profile, trusted input over CDP), and closes both plus the relay's whole process tree in `finally`. `CHROME=` overrides the browser, `RELAY_PORT=` the wrangler port.

## What it does, in order

1. Snapshots processes (`chrome.exe`, `workerd.exe`, `node.exe` with command lines). Other agents' driver Chromes (same `fluid-radial-e2e-` profile prefix) are counted and never touched.
2. Starts the relay and waits for its `Ready on` line (1.0–1.5 s in every run so far). Durable Object state goes to a fresh `--persist-to` dir in the OS temp dir, removed in `finally` once the relay tree is gone (see step 9), so no room, host or member list survives between runs. (Wrangler still writes its bundle under the repo's gitignored `.wrangler/tmp/`.)
3. Boots A, then B, each with `boot({ seed: { fluidMultiplayerHost: '127.0.0.1:8787', fluidDeviceId: 'BASELINE<A|B>', 'swirlResetHint.v1': '1' }, args })`. `fluidMultiplayerHost` is the key the app reads for its relay (js/06a-mp-core.js:60-70); `fluidDeviceId` is the device id the app would otherwise mint at random (06a:44; it travels only in the WS URL); the hint seed is F0's. Each Chrome also gets a unique switch Chrome ignores (`--fluid-sync-marker=<run>-<A|B>`) so its browser process, and through `--user-data-dir` its children, can be told apart from any other agent's Chrome. A guard aborts if the two CDP sessions turn out to be one page (the driver picks a random debug port in 9400–9799; a collision would silently attach both sessions to the first Chrome).
4. Installs the page-side kit (`window.__sync`, `window.__syncLog`) on both and **pins `#fpsCap` to `0` (Uncapped) on both through the real select's `change` event** (see nondeterminism). Records the environment and each client's state.
5. A: `createRoom()` (06a:115) and, in the same `Runtime.evaluate`, `__syncHook()` wraps the socket that call just created: an added `message` listener (the app's own handler was added first, so it runs first) and `partySocket.send` replaced on the instance. The app exposes no send hook for `room-look` (`window.__roomTrace`, js/61, notes dabs and cursors only), so the wrap is the send log. Waits for `currentRoom && partySocket.readyState === 1`.
6. B: `joinRoom(code)` (06a:122) + the same hook. Waits for `connectedClients >= 2` on both, for the host's full `room-look` welcome to reach B (06b `scheduleRoomLookWelcome`, 500 ms after the `client-count`), then 1.5 s more for the glide (06c, τ 140 ms) and the 1 s poll to settle.
7. The sequence, one action every 250 ms, each on A by the real control's own events (never an app setter): a mark on B then A, the action, 250 ms.
8. 3 s after the last action: pulls both logs, the landed state on both sides, normalises, attributes each message to the last mark at or before its `t` (step 0 = the join), and writes the files.
9. `finally`: `close()` both clients, `taskkill /PID <relay> /T /F`, then polls (≤ 8 s) until no process carries one of **its own** profile dirs or the relay pid; any that remains is killed by pid. Then the relay's `--persist-to` dir is removed (retried for up to 5 s: workerd keeps its SQLite files open for a moment after the kill, so an `rmSync` issued right after `taskkill` fails silently; the first four runs each left a ~480 KB `fluid-sync-relay-state-*` dir in `%TEMP%`, removed by hand on 2026-10-17 and the script fixed). `processes.after.persistDirRemoved` in log.json records the outcome. The report says how many driver Chromes of other agents were present and left alone.

## The sequence (A acts; what B received)

| Step | Control | How | Shared? | B received |
|---|---|---|---|---|
| 1–4 | `#curl` 10, 20, 30, 40 (the Simulation slider behind the strip's Fluid fader; `category: "simulation"`) | `value` + `input` + `change` | yes | one `room-look` delta each: `sliders.curl` |
| 5 | `#glowToggle` (Effects → Glow) | `checked` flip + `change` | yes | `checkboxes.glowToggle` = true |
| 6 | `#breathPattern` → `box` (Effects → Breathing) | `value` + `change` | yes | `selects.breathPattern` = "box" |
| 7 | palette: the `.cp-pal-select` in the brush colour popover (js/64 `brushPaletteStrip`), opened with `ColourPicker.openFor(#colorPicker)`, next palette (1 → 2, "Ross' Sunset"), popover closed | `value` + `change` | yes | `paletteIndex`, `paletteName`, `savedColors` |
| 8 | preset: `.mixer-preset-btn[data-preset="opal"]` (Liquid opal; its inline `onclick="applyPreset('opal')"` is the handler) | `.click()` | yes | one delta of 25 keys: 16 sliders, 2 checkboxes, 1 select, `colors.background`, `paletteIndex`/`paletteName`/`savedColors` (the built-in resets the palette to the baseline's) |
| 9 | `#brushSize` → 7 | `input` + `change` | **no** (`category: "brush"`) | nothing |
| 10 | `#multiplier` → 3 (Multi-Brush arms) | `input` + `change` | **no** (`category: "brush"`) | nothing |
| 11 | `#randomColor` toggle (Brush section) | `change` | **no** (`ROOM_LOOK_PERSONAL.checkboxes`) | nothing |
| 12 | gravity: `#pressureConstant` on via `change`, then a pointer tap (`pointerdown`/`pointerup`/`click`) at 50 % / 90 % of `#pressurePad` → (0, +0.8) | pointer events on the pad | yes | `gravity` = {on: true, x: 0, y: 0.8} |
| 13 | Clear: `button[onclick*="clearCanvas"]` in the strip's `.mixer-stack` | `.click()` | yes | `clear` (B runs `clearCanvas()` for the peer, no echo) |

Join phase (step 0): A sent `ping` and the full `room-look` welcome (85 keys: 47 sliders, 15 checkboxes, 12 selects, `colors.background`, `gravity`, `lightPos`, `lightShiftPath`, `material`, `paletteIndex`, `paletteName`, `resolution`, `savedColors`, `ssOrigin`; `baseline` 8); A received `connected` (role host, capacity 8, private room), `client-count` 1 and 2; B sent `ping`; B received `connected` (role guest, totalClients 2), `client-count` 2, the welcome. Totals: **B received 13 (10 `room-look`, 1 `connected`, 1 `client-count`, 1 `clear`), A sent 12, A received 3, B sent 1.**

Every shared step produced exactly one message, 3–76 ms after its mark (the preset's 25-key delta was the slow one); the 250 ms spacing leaves room. The 100 ms send cadence in 06b (`ROOM_LOOK_SEND_MS`) means a real drag coalesces into ~10 messages/s; this sequence spaces single changes so each is its own message. **The log is a per-change contract, not a drag-throughput measurement.**

## Normalisation (what `compared` holds)

Per message: `dir`, `type`, `keys` (the fields other than `type`/`timestamp`/`clientId`; for `room-look`: `full=<bool>` plus the look's flattened keys `sliders.curl`, `gravity`, …), `payload` (the whole message with `timestamp` → 0, `clientId`/`hostId`/`peer-left.id` → `<A>` / `<B>` / `<peer:xxxx>` by each client's own `connected`, the room code → `<ROOM>` wherever it might appear (it did not), every non-integer number rounded to 6 dp, object keys sorted), `step` and `stepLabel`. The page-clock `t` is kept in `timing` and `raw` but not compared. `personalAbsent`, `landed` (both sides' `#curl`, `#glowToggle`, `#breathPattern`, palette index, gravity, `#brushSize`, `#multiplier`, `#randomColor`, `#fpsCap`, material, role) and `stepResults` (without the pad rect) are compared too.

## Nondeterminism found and how it was pinned

| What moved, or would have | Cause | Pin |
|---|---|---|
| `selects.fpsCap` in the welcome (`72` on one client, `60` on the other, option lists `28.8 fps…Native (144 Hz)` vs `30 fps…Native (120 Hz)`) | The FPS Limit select builds its options and value from the display Hz the app measures at boot (js/05d-input-replay.js:724, js/05i-sim-stats.js:1231–1249); in one run the two headless Chromes measured **144 Hz and 120 Hz** (`env.A.displayHz`, `env.B.displayHz`), the same volatility F0 saw across runs. `fpsCap` is a registry select not on the personal list, so it rides the host's welcome. | Both clients set `#fpsCap` to `0` ("Uncapped", present at every Hz) through the real select's `change` event before the room exists. Recorded per client as `env.<A|B>.fpsCapPinned`. |
| Room code | `generateRoomCode()` is random | Appears only in the WS URL; normalised to `<ROOM>` anyway |
| Connection ids (`clientId`, `peer-left.id`, `host-changed.hostId`) | Minted by the relay per connection | Tokens by each side's own `connected` |
| `timestamp` on every message | Relay and client clocks | → 0 |
| Device ids (`?uid=` in the WS URL, the relay's host election key) | `DEVICE_UID` is random per profile (06a:44) | Seeded `fluidDeviceId` = `BASELINEA` / `BASELINEB` |
| Relay state between runs | A room's host / members / lock persist in Durable Object storage until the room empties | Fresh `--persist-to` dir per run, removed in `finally` once the relay tree is gone (the removal right after `taskkill` used to fail silently; fixed 2026-10-17, `persistDirRemoved: true` in the check runs since) |
| Gravity change up to 1 s late and unordered against the next action | A pad drag fires no `input`/`change`; 06b picks it up on its 1 s poll unless a `click` reaches `document` (06b:421-427) | The tap dispatches the `click` a real tap produces; the change went out 27 ms after the mark |
| Message → step attribution | Messages are attributed by B's page clock to the last mark before them | 250 ms spacing vs 3–76 ms observed latency; a step's slow action (preset) still landed well inside its window |
| One-time Reset-app note (`#resetAppHint`, js/60) | Appears ~4 s after a quiet boot | Seeded `swirlResetHint.v1 = '1'` (F0's pin); it would not have changed the wire anyway |
| Orphaned Chrome children after `close()` | The driver's `chrome.kill()` ends the browser process; gpu/utility/renderer children exit on their own a moment later | Polled by own profile dir; in both runs nothing of ours remained at the first poll |

Not pinned, by design: the page-clock `t` values (informational), the raw ids and timestamps (kept in `raw`), `.wrangler/tmp/` (gitignored, written by wrangler in the repo).

## Check result

Three `--check` runs against the baseline on disk (`prep/baseline/sync/log.json`, captured 2026-10-17 08:23 UTC at `c4796da`), all `CHECK PASS: B received 13 messages (10 room-look), A sent 12, personal keys absent, landed state identical to the baseline`, exit 0, `diff.json` = `[]`:

| Run | When (UTC) | Who | Relay ready | Room | Display Hz A / B | B latency per shared step (ms, from the step mark) | Own processes left | Artifacts |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-17 08:24 | the capture agent, right after the capture | 1.0 s | — | 120 / 120 | — | 0 (persist dir left behind, see below) | `prep/work/sync-check/prev-0424/` |
| 2 | 2026-10-17 12:48 | this verification pass (another agent's 14 driver Chromes were running alongside and were left alone) | 1.5 s | `2KKVSM` | 120 / 120 | 4 4 3 3 6 4 16 33 · 79 3 | 0 (persist dir left behind) | `prep/work/sync-check/run1-1248/` |
| 3 | 2026-10-17 12:50 | this verification pass, after the persist-dir fix | 1.0 s | `YM8D7Z` | 120 / 120 | 5 3 4 3 6 5 14 43 · 79 2 | 0, `persistDirRemoved: true` | `prep/work/sync-check/` (`check-run.log`, `check-console.log`, `diff.json`, `log.json`, `log.md`, `relay.log`) |

Verified after runs 2 and 3 with `Get-CimInstance Win32_Process` and `tasklist`: no `workerd.exe`; no `node.exe` running wrangler or partykit; no `chrome.exe` carrying this run's profile dirs (`fluid-radial-e2e-9507/9598`, then `9550/9752`) or the `--fluid-sync-marker`; the relay pids (`39644`+`12700`, then `5720`+`46544`) and browser pids (`45424`/`39688`, then `36100`/`41676`) all gone; no listener on 8787 or 1999; after run 3 no `fluid-sync-relay-state-*` dir in `%TEMP%`. Gabriel's own Chrome and his `npm run electron` window were running throughout and were never touched (the script only kills by its own marker, profile dirs and relay pid).

What this verification pass changed (all under `prep/`, nothing compared by `--check`):

- `sync-log.js`: the `--persist-to` dir is now removed in `finally` after the relay tree is confirmed gone, with retries (`removePersistDir`), and the outcome is recorded (`processes.after.persistDirRemoved`, the console line, the Processes row in log.md and the relay.md row). The four dirs the earlier runs left in `%TEMP%` (04:19, 04:23, 04:23:58, 12:48; 27 files / 484 KB each) were deleted by hand.
- A wrong citation in the rendered log.md (and the baseline `log.md`): `brushSize` / `multiplier` are at `js/01a-param-registry.js:110-111` (not 84-85); `ROOM_LOOK_PERSONAL` is 06b:55-67 (`sliderCategories` 56, `checkboxes` 57), `isPersonalSlider` 06b:70-75, `dropPersonal` 06b:80-94, the `colors.brush` cut 06b:90-93.
- Checked against source: `fluidMultiplayerHost` (06a:60-70), `fluidDeviceId` (06a:44), `createRoom` (06a:115), `joinRoom` (06a:122), `boot({ seed, args })` and `{ ev, send, url, close }` in `scripts/test/radial-menu/driver.js:47-107`.

The capture's console output is `prep/work/sync-check/capture-run.log` (copied to `prev-0424/`).

A first capture earlier the same day produced the identical 13/12 message log but had a cleanup bug: it treated every driver Chrome process not present at its start as its own and killed 21 of them with `taskkill /T`. By the process counts those were most likely this script's own just-closed children (two Chromes ≈ 20 processes), but another agent's Chrome booted in that window could not have been told apart. The script now identifies its Chromes by marker and profile dir and never touches anything else; the baseline on disk is from the fixed script.

## Observations worth knowing (not failures)

- **Curl boots at 0** on a scratch profile (`index.html:793` `value="0"`; the registry default is 25) — the shipped look, so steps 1–4 move it 0 → 10 → 20 → 30 → 40; the preset then puts it at 14.
- **The built-in preset switched Random colour off on A** (step 11's toggle returned `checked: true`, so it was `false` after step 8; before the preset it was `true`). `applyPreset` goes through `applyPresetSnapshotFull` with `brushState` from `baselineLookSnapshot()` (js/04b-presets.js:132-134), which lands the baseline's colour mode. Personal, so nothing travelled; listed under Open questions.
- **Step 12's `aria-expanded` read `"false"` synchronously after the title click** although the click reaches the header's `toggleSection` (js/20:9309-9315): the attribute is derived from the `.collapsed` class after the fact (comment at 9339-9341), and a collapsed `.section-body` is `visibility: hidden`, not `display: none` (css/21-sidebar.css:133-139), so the pad had its 250×250 box either way and the aim landed exactly. Relevant to CSS prep step 4 (styling through `[aria-expanded]` lags the class by a tick).
- **The welcome lists 47 sliders**, including the kaleidoscope numbers (`kAngle`, `kSpinSpeed`, …) although the `kaleido` *section* is personal: 06b drops the runtime section, not the registry sliders. Expected; recorded so a later diff is not read as a leak.
- `connectedClients` reached 2 on both within ~100 ms of B's join; the welcome landed 500 ms later; the glide settled before the sequence began (`env.B.afterJoin.curl` = 0 = A's).

## Caveats

- **Web build in headless Chrome, not Electron**; one host, one guest, both on the same machine and relay process. Latency is local-loopback; nothing here measures the deployed relay or a real network.
- **No painting.** Dabs (`splat`), cursors, `pointer-up`, `stroke`/`stroke-chunk`, `brush-shape`, the collider and text wires, `pad-hello`, `artist-name` and `peer-left` are not exercised; the sequence is settings only. Capture a stroke baseline separately if the theme work touches the canvas input path.
- **Guest → host direction** is only `ping`: B never changed anything. The symmetric case (a guest's change reaching the host) is the same code path (06b sends from whoever changed) but is not in this log.
- The sequence dispatches synthetic events on the **canonical inputs** (`#curl` behind the strip's proxy fader, the hidden `#randomColor` behind its proxy), not trusted pointer drags on the proxies. A drag on a proxy fader also goes through the canonical input's `input` event, so the wire is the same, but proxy-level behaviour (snap, wheel) is not covered here (F2 drags the proxy).
- Scratch profile = app defaults (full layout, autoload on, nothing hidden). A user's profile with a material mode active would send `#curl` as the material macro (`material` key) instead of `sliders.curl` (06b:349-352); `env.A.afterJoin.materialActive` records `false` for this baseline.
- The pad tap position is computed from the pad's box at 1584×805; the box is layout-dependent but deterministic at the driver's window size. `stepResults` excludes the rect so a layout-only change does not fail the gate; the landed gravity value does.
- `--check` compares the normalised `compared` object by deep equality: a changed relay version that adds a field to `connected`, or a new registry slider, fails the gate by design (it is a change in what travels), and the diff names the path.
