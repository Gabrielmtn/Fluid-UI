# Multiplayer probes

Headless WebSocket clients that speak the same wire protocol as `js/06-multiplayer.js`, for
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
| `mp-share.js` | Do settings shares behave? Opens circles, joins and leaves them, and checks a look delta reaches **only** that circle — plus multi-circle switching, dissolution on the last member leaving, forged rosters, Take Turns superseding shares, and a stranger pair (where neither person is a real host). |
| `mp-count.js` | Does the "N artists here" count stay truthful across joins and leaves? |
| `mp-id.js` | Does one device keep one `clientId` across a reconnect? (Everything peer-keyed depends on this.) |
| `mp-prod-version.js` | Which relay build is **live**? Two ordinary connections to a random room code on the deployed host; both close at the end. Run it after every `npm run deploy`. |

Env knobs on `mp-load.js`: `MP_HOST`, `MP_ROOM`, `MP_N`, `MP_PAINTERS`, `MP_SECONDS`.

Painting rates are pinned to the real ones — 96 dabs per message (`DAB_MAX_PER_MSG`) at ~42
flushes/sec, which is the 4000 dab/s `BRUSH_DAB_BUDGET` — so the numbers describe the product,
not the probe. If those constants change in `06-multiplayer.js` or `04a-canvas-gl-config.js`,
change them here too.
