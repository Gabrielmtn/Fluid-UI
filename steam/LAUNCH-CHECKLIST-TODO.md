# Steamworks checklist — what's left

**Updated 2026-08-21 (second pass).** Since the first version you cleared
Content Survey, Controller Support Description, Support Info **and the
Trailer**. Store Presence is green except the two Community icons.

## ⬛ THE ONLY THING BLOCKING SUBMISSION

**App Icon + Shortcut Icon.** Both files are baked and verified:

| Upload slot | File | Verified |
|---|---|---|
| **Shortcut Icon** | `steam/store-assets/shortcut_icon_512_b.png` | 512×512 PNG ✔ (Steam accepts exactly 256 or 512) |
| **App Icon** | `steam/store-assets/app_icon_184_b.jpg` | 184×184 JPG ✔ opaque, no alpha |

Leave **"Convert shortcut icon to app icon at upload time"** ticked and the
512 may fill both slots by itself — upload the JPG only if the generated one
looks wrong. The icon's ground is near-black, so the rounded corners' alpha
becoming solid black (which is what the conversion does) is invisible.

Variant `_a` is the same mark with nine fine arms if you prefer it; `_b` is
recommended because nine thin arms turn to mush at 16px.

⚠️ Adopting this mark means the **exe icon should change with it** —
`build/icon-master-1024.png` and the `.ico` electron-builder embeds — or the
store icon and installed icon diverge. That does not block submission.

---

## 🟠 Blocks RELEASE, not the Coming Soon page

| Item | Status | Note |
|---|---|---|
| **Pricing for at least one package** | [DECIDE] §12 | $9.99 vs $14.99. Does **not** block the page — leave until after approval. |
| **Published pricing** | follows the above | Same. |
| **At Least One Build Configured** | build READY, not pushed | `dist/win-unpacked` is rebuilt under the new name and verified (see below). Pushing needs steamcmd + the builder login: `npm run publish:steam -- <builder-login>`. |
| **Launch Options Defined** | Gabriel, dashboard | SteamPipe → Installation → General Installation → Executable `Swirl Together.exe`, OS Windows. |

## ⚪ Recommended, genuinely optional

| Item | Recommendation |
|---|---|
| **Cloud Saves** | Leave unchecked. §8 marks it BLOCKED until Auto-Cloud is configured (`*.fluidpreset`, non-recursive, `Documents/Swirl Together/Presets`). See the risk note below. |
| **Steam Achievements** | Post-launch. Nothing here is scored, so achievements need designing, not just wiring. |
| **Accessibility features** | Worth a pass before the demo — the photosensitivity story is already good (the strobing Ascend/Rainbow behaviour was removed) and saying so is cheap. |

---

## Windows depot — state as of 2026-08-21

`dist/win-unpacked` was **stale**: it still held `A Small Good Thing.exe` from
before the rename, which is exactly the mismatch that makes a launch option
point at an exe the depot doesn't contain. Rebuilt and checked:

- Launch exe is now **`Swirl Together.exe`** (454 MB unpacked, asar off so
  SteamPipe can delta-patch).
- The packaged build **boots and paints** — WebGL2 on, 74 sliders, PhotoSafe
  active, zero console errors, `glError 0`, a splat test rendered 168k energy.
- **Steamworks handshake works**: launched outside Steam it still reported
  `[Steam] initialized as -Red-` against app 5068940, so the App ID, the
  bundled `steam_api64.dll` and `steamworks.js` init all line up.
- Two internal documents were shipping inside the depot — the *Design system
  breakdown exploration* folder + zip, and `NEXTFEST-TRACKER.xlsx`. Now excluded
  in `package.json` `build.files`.
- `publish:steam` was a cmd-only `%CD%` one-liner with a `YOUR_STEAM_BUILDER`
  placeholder; it is now `scripts/steam-upload.js`, which blocks an upload of a
  missing or stale-named build and runs steamcmd from `steam/` so the VDFs'
  relative content root resolves.

Still needed, and only Gabriel can do them:

1. ~~Verify the depot ID~~ — **done 2026-08-21: it is 5068942**, not the
   inferred App-ID-plus-one 5068941. Both `.vdf` files updated.
2. ~~Install steamcmd~~ — **done**: SDK 165 unpacked under `Downloads`,
   `STEAMCMD` persisted to the user environment, self-update applied, login
   cached (so uploads now run without a Steam Guard prompt).

### Two upload bugs found and fixed 2026-08-21

- **steamcmd splits its `+run_app_build` path on spaces**, however it is quoted.
  This repo lives under `Z:\New folder\Fluid-UI`, so steamcmd only ever saw
  `folder\Fluid-UI\steam\app_build.vdf`. A path relative to the working
  directory does not help — steamcmd resolves relative paths against *its own*
  directory — and 8.3 short names are disabled on this volume. `steam-upload.js`
  now creates a throwaway directory junction in a space-free location and routes
  steamcmd through it. Nothing inside the VDFs needs changing: SteamPipe resolves
  the depot config and content root relative to the app build file.
- **`depot_build.vdf` declared its own `contentroot`.** SteamPipe resolves a
  depot's content root *relative to the app build's*, so `..\dist\win-unpacked`
  applied twice and produced `dist\dist\win-unpacked`. Removed — the app build's
  content root governs. This was latent and would have failed on any path.

A third failure followed, and it was Steamworks-side rather than local:
`ERROR! Failed to initialize build on server (Access Denied)`. Cause was that
depot 5068942 existed only in the unpublished working copy — SteamPipe checks
the *published* app config. Publishing the config from the app's Publish tab
cleared it. (Publishing app config is not the same action as submitting the
store page for review, and does not release an unplayable app.)

**UPLOADED 2026-08-21 12:24 — BuildID 24866341**, 454 MB scanned and sent in
~27s. The build is on Steam and NOT live: `"setlive" ""` means it sits unset on
the Builds page until someone puts it on a branch.
3. ~~Push the build~~ — **done: BuildID 24866341**.
4. ~~Set build 24866341 live~~ — **done**. Verified in Steam's published
   config, not the UI: `"branches" { "public" { "buildid" "24866341" } }` and
   depot 5068942 carries manifest `8775967866369673465` (474,742,393 bytes).
   `public` is Steam's internal name for the `default` branch.
5. ~~Define the launch option~~ — **done and published**:
   `"launch" { "1" { "executable" "Swirl Together.exe", "oslist" "windows",
   "osarch" "64" } }`.

### Packages pointed at a dead depot — FIXED

The three packages were created when **5068941** was the app's default depot.
That depot no longer exists, but the packages still referenced it, and Steam
said so on the package landing page: *"5068941 — Unknown Depot (This depot is
not associated with any apps in this package.)"*. That single mismatch was what
failed **both** "Package Includes Windows Depot" and "Store And Devcomp
Packages Match" — not a missing depot to add, a stale one to repoint.

Repointed to 5068942 and published. Verified server-side on Developer Comp:

    "appids"   { "0" "5068940" }
    "depotids" { "0" "5068942" }      (change number 37808725 -> 38225830)

The Store and Beta packages can't be read back with steamcmd — the account
holds no license for them, so they return `change number : 0/0`. Dashboard
only for those two.

**Where the control lives**, since it took a while to find: package landing
page → *Depots Included* → **Add/Remove Depots**. The URL pattern is
`partner.steamgames.com/store/packagelanding/<packageid>` — there is no
`/packages/edit/<id>` route. Store packages are in the top table of App Admin →
Associated Packages & DLC; Developer Comp and Beta Testing are much further
down under *"Promotional or special-use packages"*.

## Windows depot: DONE 2026-08-21

Every row verified from Steam's published config rather than the dashboard
checkboxes (`steamcmd +login <user> +app_info_update 1 +app_info_print 5068940`):

| Item | Evidence |
|---|---|
| Depot configured | `"depots" { "5068942" { "oslist" "windows" "osarch" "64" } }` |
| Build uploaded | BuildID 24866341, 454 MB |
| Build live | `"branches" { "public" { "buildid" "24866341" } }` — `public` is Steam's internal name for `default` |
| Manifest attached | gid `8775967866369673465`, 474,742,393 bytes |
| Launch option | `"launch" { "1" { "executable" "Swirl Together.exe", "oslist" "windows", "osarch" "64" } }` |
| Packages | devcomp 1756885 → depot 5068942 |

Next worthwhile step is not a checkbox: install Swirl Together through the
Steam client on the Developer Comp license and confirm it actually launches.
That exercises depot, manifest and launch option the way a customer will.

## Two things this list does not say out loud

- **The last-safe submit date is ~Aug 24** for the 🔴 Aug 31 registration
  deadline. Two file uploads are all that stand between here and submitting.
- **Cloud Saves is entangled with a real data-loss risk.** Measured this
  session: Chromium flushes localStorage asynchronously, so a crash or hard
  kill drops recent settings writes while older ones survive — which is the
  exact shape of the unexplained July preset loss. Presets live in that same
  storage. Worth resolving *before* wiring Cloud Saves, or Cloud will
  faithfully sync a store that can lose the last thing you made.
  (Details: `scripts/test/GUIDANCE.md` §2b.)
