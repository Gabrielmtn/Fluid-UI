# Multiplayer probes

Headless WebSocket clients that speak the same wire protocol as the client (`js/06a…06e-mp-*.js`), for
measuring relay behaviour without opening eight browsers. Written for the 2026-08-23 audit
(`MP-AUDIT-2026-08-23.md` at the repo root).

Start a relay first — everything except `mp-prod-version.js` points at `127.0.0.1:1999`:

```bash
npx partykit dev --port 1999
```

| script | what it answers |
|---|---|
| `mp-load.js` | How much traffic does one client have to absorb when 8 people paint at once? Reports per-client msgs/s, KB/s, fan-out latency, peer dabs/sec, and whether an oversize message is dropped silently. |
| `mp-turns.js` | Does the 8-person rotation hold? Also fires every message type from a **non-holder** to see which ones Take Turns actually gates. |
| `mp-callreturn.js` | Does **Call and return** (stroke mode) hold? No deadline on the wire, the idle backstop passes a quiet holder after `STROKE_IDLE_MS` and a paint message pushes it out, `turn-pass` still works, and the removed settings-share messages are inert. Slow (~2.5 min): it waits out the real backstop. |
| `mp-lobby-ttl.js` | Can a waiter whose keep-alives run LATE still be found? Holds a lobby pin open with no keep-alive for `LATE_MS` (default 75 s), then sends a second seeker and expects it to be paired into the waiter's room; then closes the pin and expects a third seeker to get a fresh room. Proves the margin between the client's 40-50 s keep-alive and the lobby's `WAIT_TTL_MS`. |
| `wire-loopback.js` | **Browser console harness**, not a Node probe: does a peer see the stroke the painter painted? Paints a synthetic stroke while capturing the wire messages on a fake socket, replays them through the real receive path on the same canvas at their original timing, and compares the dye (correlation, dye ratio, roughness) plus how the drain paced the dabs. Paste into the console, then `await __lb.A()`, `await __lb.B()`, `__lb.report()`. Found the ±1 velocity clamp on 2026-09-11. |
| `mp-count.js` | Does the "N artists here" count stay truthful across joins and leaves? |
| `mp-id.js` | Does one device keep one `clientId` across a reconnect? (Everything peer-keyed depends on this.) |
| `mp-prod-version.js` | Which relay build is **live**? Two ordinary connections to a random room code on the deployed host; both close at the end. Run it after every `npm run deploy`. |

Env knobs on `mp-load.js`: `MP_HOST`, `MP_ROOM`, `MP_N`, `MP_PAINTERS`, `MP_SECONDS`.

Painting rates are pinned to the real ones — 96 dabs per message (`DAB_MAX_PER_MSG`) at ~42
flushes/sec, which is the 4000 dab/s `BRUSH_DAB_BUDGET` — so the numbers describe the product,
not the probe. If those constants change in `06d-mp-paint-wire.js` or `04a-canvas-gl-config.js`,
change them here too.
