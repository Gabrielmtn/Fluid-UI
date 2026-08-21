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
