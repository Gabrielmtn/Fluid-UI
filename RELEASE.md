# Release & Distribution

Swirl Together ships in three forms, all from one codebase:

| Target | What it is | How it's published |
|---|---|---|
| **Web** | the static app + multiplayer relay | `npm run deploy` → PartyKit (`*.partykit.dev`) |
| **itch.io** | the desktop app (auto-updating) | `butler push` the unpacked folder |
| **Steam** | the desktop app (auto-updating) | SteamPipe depot from the unpacked folder |

itch and Steam **both update by diffing the same unpacked app folder** — there's no custom updater. You build one folder; their tooling computes the delta and pushes it to players.

---

## 1. Build the desktop app (Windows)

```
npm run dist:win
```

Produces, in `dist/` (gitignored):
- **`dist/win-unpacked/`** — the unpacked app (asar disabled — SteamPipe's 1 MB-chunk delta patching needs loose files; one edited JS inside an asar would force a full redownload). **This is the folder both itch and Steam upload.** Its launch exe is `Swirl Together.exe`.

The `portable` target was dropped for Steam prep (self-extracting exes unpack to `%TEMP%`, which AV heuristics flag, and Steam never uses them). For a one-off portable build: `npx electron-builder --win portable`.

Bump `"version"` in `package.json` before each release so builds are traceable — the version now shows in-app (F1 modal footer and splash corner).

---

## 2. Publish to itch.io

**One-time setup**
1. Create the game page on itch.io — note the slug, e.g. `gabrielmtn/fluid-ui`.
2. Install **butler** (the itch CLI) and log in: `butler login` (opens a browser).
3. In `package.json`, set the `publish:itch` script's `YOUR_ITCH_USER/YOUR_GAME` to your slug.

**Each release**
```
npm run dist:win
npm run publish:itch        # = butler push "dist/win-unpacked" YOUR_USER/YOUR_GAME:windows
```
butler uploads only changed bytes; the itch app auto-updates players on the `windows` channel.

---

## 3. Publish to Steam

App **5068940**, depot **5068942** — already filled into `steam/app_build.vdf`
and `steam/depot_build.vdf`.

**One-time setup**
1. Install **steamcmd** — it comes with the Steamworks SDK at
   `sdk/tools/ContentBuilder/builder/steamcmd.exe`. Either put it on `PATH` or
   point the `STEAMCMD` env var at the exe.
2. Depot **5068942** (confirmed on the partner site 2026-08-21 — the earlier
   5068941 was an inference from App ID + 1 and was wrong).
3. Under **SteamPipe → Installation → General Installation**, add a launch
   option: Executable `Swirl Together.exe`, OS Windows. Without it the depot
   installs but nothing runs — and the exe name changed with the rename, so a
   launch option left over from an earlier name ships an app that cannot start.

**Each release**
```
npm run dist:win
npm run publish:steam -- <builder-login>
```
`publish:steam` runs `scripts/steam-upload.js`, which refuses to upload a
`dist/win-unpacked` that is missing or still carries a stale exe name, then
launches steamcmd from `steam/` so the VDFs' relative `..\dist\win-unpacked`
resolves. steamcmd prompts for the password and Steam Guard code itself — the
script never handles credentials. The builder login is a **Steamworks builder
account**, not a personal Steam login; `STEAM_BUILDER` works instead of the
argument.

The build lands unset (`"setlive" ""`) — go to the Steamworks **Builds** page
and set it live on a branch (e.g. `default`). To push straight to a branch, set
`"setlive"` in `app_build.vdf`.

---

## Polish before a public launch (not blockers)
- **App icon** — ✅ DONE: `build/icon.ico` (multi-res, wired via `build.win.icon`), `assets/icon.png` (window icon + web favicon), `build/icon-master-1024.png` (master for Steam capsule art).
- **Code signing** — unsigned Windows builds trigger SmartScreen for direct downloads (Steam's own launch path bypasses SmartScreen; signing still helps against AV false positives — see the Steam plan, decision D8: Azure Trusted Signing).
- **Mac / Linux** — the Mac build needs a real Mac or a macOS CI runner (can't be produced on Windows); add a GitHub Actions workflow when you want those channels.

## Web launch: traffic headroom (measured 2026-09-09)

The web build and the multiplayer relay both live on hosted PartyKit
(Cloudflare Workers + Durable Objects) at
`fluid-ui-multiplayer.gabrielmtn.partykit.dev`. Nothing else is in the request
path; SAM weights come from Hugging Face only when that feature is opened.

- Boot payload: 61 files, ~620 KB compressed JS+CSS plus a ~108 KB HTML page.
  The 12 MB transformers vendor bundle and the effect preview GIFs are lazy.
- No socket opens on page load. The lobby / room sockets connect only when a
  visitor clicks into Swirl Together.
- Lobby (one Durable Object, `/parties/lobby/main`): 120 seekers fired at once
  from one machine paired in <1 s, matchmake->matched p50 ~130-180 ms, zero
  errors. Cloudflare's soft ceiling per object is ~1,000 req/s.
- Play rooms are one Durable Object each (2 or 8 people), so room load never
  concentrates anywhere.
- Static: 300 concurrent page fetches -> 300x HTTP 200. Warm single fetch of the
  biggest chunk ~120 ms.

Cache TTLs in `partykit.json` are SECONDS (the PartyKit docs example is
misleading): `browserTTL: 300`, `edgeTTL: 3600`. JS/CSS are safe to cache
because build-web stamps a fresh `?v=` per deploy. The cost is that a returning
visitor can hold a stale `index.html` for up to 5 minutes after a deploy.

The one unknown is the hosted PartyKit fair-use ceiling: that deploy runs in
PartyKit's Cloudflare account, with no dashboard or plan on our side. The fix
is our own Cloudflare account, and hosted PartyKit's own `deploy --domain`
CANNOT do it any more (its backend still creates key-value-backed Durable
Objects, which new Cloudflare accounts refuse). So the swirltogether.com deploy
goes through Wrangler + partyserver instead:

- `wrangler.jsonc` is the deploy config (account id, SQLite Durable Objects,
  custom domain, static assets from `public/` with `public/_headers` for the
  per-path cache policy that build-web writes).
- `party/worker.ts` adapts the UNCHANGED relay classes onto partyserver; the
  URL scheme is preserved, so the browser client and shipped desktop builds
  need nothing.
- Workers Paid ($5/mo) covers Durable Objects; static asset requests are free.

```bash
npx wrangler secret put INTERNAL_SECRET     # once per account, before the first deploy
$env:CLOUDFLARE_API_TOKEN='<token>'; npm run deploy:cf   # build public/ + wrangler deploy
npm run party:cf                            # local relay + bundle on http://localhost:8787
```

Token shape (My Profile > API Tokens): Account Workers Scripts:Edit, Account
Settings:Read; Zone (swirltogether.com only) Workers Routes:Edit, DNS:Edit;
User Details:Read, Memberships:Read. Give it a TTL.

Client host selection: `PARTYKIT_HOST` in `js/06a-mp-core.js` uses the
page's own origin for any real web host (partykit.dev or swirltogether.com)
and falls back to swirltogether.com for the desktop app; already-shipped
desktop builds can be migrated without a patch via
`localStorage.fluidMultiplayerHost = 'swirltogether.com'`.
