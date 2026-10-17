# The local relay for the sync baseline

How `prep/baseline/scripts/sync-log.js` starts, points the clients at, and stops the relay. Nothing here touches the deployed relay (`swirltogether.com`).

| Fact | Value |
|---|---|
| Used | wrangler on `127.0.0.1:8787` |
| Command | `C:\Program Files\nodejs\node.exe Z:\New folder\Fluid-UI\node_modules\wrangler\bin\wrangler.js dev --port 8787 --ip 127.0.0.1 --persist-to C:\Users\Gabri\AppData\Local\Temp\fluid-sync-relay-state-PDIOsf` (cwd = repo root) |
| Ready after | 1024 ms (the log line `Ready on http://127.0.0.1:8787`) |
| Output | `prep\baseline\sync\relay.log` (stdout + stderr of the relay process) |
| Durable Object state | `--persist-to` a fresh `fluid-sync-relay-state-*` dir in the OS temp dir, removed in `finally` once the relay tree is gone (workerd holds the files for a moment after `taskkill`, so the removal retries for up to 5 s; `processes.after.persistDirRemoved` in log.json records it). So no room survives between runs; wrangler still writes its bundle under the repo's gitignored `.wrangler/tmp/`. The capture recorded here ran before this fix and left its dir, since removed by hand (see NOTES, Check result) |
| Environment | `WRANGLER_SEND_METRICS=false`, `CI=1`, `NO_COLOR=1` (no prompts, no colour codes in the log) |
| Stopped by | `taskkill /PID <pid> /T /F` in the script's `finally` (the tree: node running wrangler → two `workerd.exe`), then a process snapshot confirms no `workerd.exe` / relay node remains that was not there before |
| Attempts | `wrangler` OK |

## What the clients read

- The app takes its relay from `localStorage.fluidMultiplayerHost` (js/06a-mp-core.js:60-70, validated by `/^[\w.-]+(:\d+)?$/`), seeded into each scratch profile by the driver's `boot({ seed })` before the first script runs. `isPlainWsHost` (06a:86-88) makes `127.0.0.1` a `ws://` host, so the URL is `ws://127.0.0.1:8787/parties/fluid/<ROOM>?uid=<deviceId>`.
- `party/worker.ts` adapts the unchanged PartyKit classes (`party/index.ts`, `party/lobby.ts`) onto partyserver; `wrangler.jsonc` binds `fluid` → `FluidRoom` and `lobby` → `LobbyRoom`, so the paths are the production ones. `assets.directory` is `./public`, which exists in this checkout; the relay never serves it to these clients (they load from the driver's own static server).
- A bare 6-character code is a **private** room (capacity 8, host + lock, `party/shared.ts:41-45`): the first connection is elected host (`party/index.ts:156-166`), every relayed message is stamped with the sender's **connection id** and a timestamp (`index.ts:271-273`), and `ping` is never relayed (`index.ts:231`).

## Fallback

If wrangler prints no `Ready on` within 90 s (or exits), the script kills it and tries `node node_modules/partykit/dist/bin.mjs dev --port 1999` (what `npx partykit dev` runs; `partykit.json` maps the same two parties). `RELAY=host:port` skips both and uses a relay that is already running. In the capture recorded here the fallback was not needed.

## Known log noise

- `Wrangler detected this dev session is running in an AI agent.` plus the Local Explorer API routes: wrangler 4.130 prints these when it detects a non-interactive agent session; harmless.
- `✨ Parsed 9 valid header rules.`: `public/_headers`, irrelevant to the WebSocket paths.
- When a peer is refused (full / locked room) workerd logs one uncaught `Network connection lost` (`party/worker.ts:74-80`); this baseline never refuses anyone, so none is expected in `relay.log`.
