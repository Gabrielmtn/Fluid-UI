# Swirl Together — Steam store page fill-in pack

App ID 5068940 · store item 1276064 · target: submit for review by **Mon Aug 24**
(Next Fest registration closes 🔴 Aug 31 11:59pm PDT and requires a *published,
public* page — see REFACTOR-AUDIT.md §9.)

Everything below is ready to paste. Items marked **[DECIDE]** need Gabriel.
Items marked **[BLOCKED]** can't be filled yet.

---

## 0. Before you touch the store page (dashboard actions)

1. **Rename the app** (5068940) *and* store item (1276064) to **Swirl Together**.
   Valve re-screens names — do it before submitting, not after.
2. **Set the launch executable** to `Swirl Together.exe` (productName changed;
   a stale launch config ships an app that cannot start).
3. Confirm the **October Next Fest opt-in** appears on the dashboard.

---

## 1. Basic Info

| Field | Value |
|---|---|
| Name | `Swirl Together` |
| App type | Game |
| Developer | `Gabriel Martin` (must match the Steamworks legal entity) |
| Publisher | `Gabriel Martin` |
| Franchise | *(leave blank)* |
| Website | **[DECIDE]** — the PartyKit web build is the obvious one |
| Early Access | **No** |
| Release date | Coming Soon · estimate **November 2026** — must be after Oct 26 (Next Fest is unreleased-games-only) |

---

## 2. Supported Languages

English — **Interface** ✔, **Full Audio** ✖ (no voice), **Subtitles** ✖.

Nothing else. The UI is not localized, and claiming a language you haven't
shipped is a review bounce.

---

## 3. Supported Platforms

**Windows only.** Do not check macOS or Linux.

- `package.json` `build.win.target` is Windows-`dir` only; there is no mac or
  linux target configured.
- `steamworks.js` ships `win64/steam_api64.dll` via `extraFiles` — Windows-specific.
- A macOS build cannot be produced on this machine (needs a Mac or macOS CI —
  RELEASE.md).
- A checked box is a promise: Valve expects a working depot per platform, and
  the badge appears on the store page.

Linux/Proton note: Windows-only titles still run for Steam Deck / Proton users;
Deck Verified is a separate later submission, not a platform checkbox.

---

## 4. System Requirements (Windows)

### Minimum
- **OS:** Windows 10 64-bit (version 1809 or later)
- **Processor:** 64-bit dual-core, 2.0 GHz
- **Memory:** 4 GB RAM
- **Graphics:** GPU with WebGL 2.0 / OpenGL ES 3.0 support and 1 GB VRAM (Intel UHD 620 or better)
- **DirectX:** Version 11
- **Network:** Broadband Internet connection
- **Storage:** 1 GB available space
- **Additional Notes:** Painting together requires an internet connection. Painting on your own works offline.

### Recommended
- **OS:** Windows 11 64-bit
- **Processor:** 64-bit quad-core, 3.0 GHz
- **Memory:** 8 GB RAM
- **Graphics:** Dedicated GPU with 4 GB VRAM (NVIDIA GTX 1060 / AMD RX 580 or better)
- **DirectX:** Version 11
- **Network:** Broadband Internet connection
- **Storage:** 1 GB available space
- **Additional Notes:** On laptops and desktops with both integrated and dedicated graphics, set Swirl Together to "High performance" in Windows Graphics Settings — the simulation runs much smoother on the dedicated GPU.

*(Sizing basis: `dist/win-unpacked` is 454 MB; Electron 39 requires Windows 10+.
The graphics note is from a real, reproduced case — a machine with a 4090 was
rendering on its Intel UHD 770 iGPU until the app was pinned.)*

---

## 5. Short Description (200-300 characters)

```
A mesmerizing cooperative exploration for two to eight people, or a sandbox for one. Explore the colors and motion dynamics, save presets of your favorites to enjoy later and swap with others, and share a canvas with a friend, or a stranger, and make something neither of you could have made alone.
```
*(298 characters. Steam enforces a 200 minimum as well as the 300 cap, and
asks for plain sentences — no bullets, no line breaks, no BBCode; the field is
reused in search results and sale pages.)*

---

## 6. About This Game

**The final text lives in [about/ABOUT-COPY.md](about/ABOUT-COPY.md)** — one
file, so the two cannot drift. Paste the fenced block from there; the inline
`[img]` tags need the eight files from `about/images/` uploaded through the
description editor first (mechanics in `about/README.md`).

Shape, since Aug 21: the Overvoid layout Gabriel picked — a one-line statement
of what the game is, three short paragraphs, one counted feature list, then
images with a line of context under each. Every count in that list is checked
against the code; the table of claim → source is in ABOUT-COPY.md, as are the
three superseded drafts (none were ever committed, so git cannot return them).

### [DECIDE] resolved — communal-ledger / wishlist line

**Recommendation: leave it out of About This Game.** §9.3 allows it, but this
field is read as a description of the *game*, and a reviewer skimming it can
read a wishlist-linked mechanic as a feature-removal threat — the exact failure
§9.3 warns about. It also spends the most valuable paragraph on a marketing
mechanic rather than on what the thing is. Better homes for it: a Steam
announcement post, or the demo's own UI where it can be shown rather than
promised. Say the word if you want it added back and I will write the softer
phrasing.

---

## 7. Legal / copyright notice

```
© 2024-2026 Gabriel Martin. All rights reserved. Swirl Together includes
third-party open-source components; see THIRD-PARTY-NOTICES.txt in the
installation folder.
```

---

## 8. Genres, tags, categories

**Genres:** Casual (primary), Indie, Simulation.

**Tags (order matters — the first tags weigh most):**
Relaxing · Painting · Online Co-Op · Co-op · Multiplayer · Creative · Cozy ·
Casual · Colorful · Artistic · Sandbox · Physics · Simulation · Indie · Chill ·
Experimental · 2D · Family Friendly · Music · Singleplayer

**Player features / categories:**
- Single-player ✔
- Online Co-op ✔ — **2–8 players** (stranger matchmaking pairs exactly 2;
  private code rooms cap at 8 — verified in `party/shared.ts` / `party/index.ts`)
- Cross-Platform Multiplayer ✔ — the desktop and browser clients share one relay
- Steam Cloud — **[BLOCKED]** don't check it until Auto-Cloud is configured
  (Phase 6: `*.fluidpreset`, non-recursive, on `Documents/Swirl Together/Presets`)
- Full controller support ✖ · Shared/Split Screen ✖ · Achievements ✖ (post-launch)

---

## 9. Mature content / content survey

- Violence, sexual content, adult themes: **none**.
- **User-generated content: YES** — players paint on a shared canvas in real
  time and can import their own images. Disclose it, and say plainly how it is
  handled: sessions are ephemeral (nothing is stored or published server-side),
  there is no chat, and a player can leave a session at any time.
- Photosensitivity: the strobing Ascend/Rainbow behaviour was removed. Consider
  a one-line note in the description anyway.

---

## 10. AI disclosure

Required, and it applies here — the app ships local ONNX models.

- **Pre-Generated content: No.** No art, audio, code or text in the game was
  AI-generated for shipping.
- **Live-Generated content: Yes.** Suggested wording:

```
Swirl Together bundles two small open-source machine-learning models
(SlimSAM for segmentation and Depth-Anything-Small for depth estimation, both
Apache-2.0). They run entirely on the player's own machine, offline, and only on
images the player chooses to import — they turn a picture into a cut-out mask or
a depth-based collider for the paint to flow around. No player data is sent
anywhere, and no text, art or audio is generated.
```

Guardrails statement: the models are local-only and read strictly from
user-supplied images; the app makes no network calls for inference (verified —
zero network requests in the packaged build).

---

## 11. Assets

| Slot | Size | Status |
|---|---|---|
| Header capsule | 920×430 | ✔ re-baked under the new name |
| Small capsule | 462×174 | ✔ |
| Main capsule | 1232×706 | ✔ |
| Vertical capsule | 748×896 | ✔ |
| Library capsule | 600×900 | ✔ |
| Library header | 920×430 | ✔ |
| Library hero | 3840×1240 | ✔ |
| Library logo | 1280×457 | ✔ trimmed to the wordmark's own bounds; Steam scales the whole asset, so transparent padding would shrink the visible logo |
| Community icon | 184×184 | ✔ |
| Client icon | .ico | ✔ |
| **Screenshots** | **min 5** | ✔ exactly 5 in `steam/screenshots/` (01 group · 02 music · 03 styles · 04 record · 05 colliders) — upload all 5, no spares |
| Trailer | — | **[BLOCKED]** capture session; Valve's compilation pull is Sep 7 |

Reminder: capsules may carry artwork + name/subtitle only. No ledger copy, no
review quotes, no fake Steam UI.

---

## 12. Pricing

**[DECIDE]** $9.99 vs $14.99 — but this does **not** block the Coming Soon page
or Next Fest registration. Leave it until after the page is approved.

---

## 13. Support Info  *(checklist item — was missing from this pack)*

| Field | Value |
|---|---|
| Support URL | **[DECIDE]** — `https://swirltogether.com` once it points somewhere, otherwise the itch page |
| Support email | **[DECIDE]** — a dedicated address is better than a personal one; it is shown publicly on the store page |

Steam requires at least one of URL or email. It is a hard blocker for the page,
and it is public, so do not use an address you would not publish.

## 14. Controller Support Description  *(checklist item)*

Support level: **None** — the game is pointer-driven (mouse, pen, touch) and has
no controller bindings today. Leave the box unticked rather than claiming partial
support; a mismatch between the tick and the build is a review-bounce risk, and
Steam surfaces controller support as a filter that would set a false expectation.

If it is ever added, "Partial Controller Support" is the honest tier unless menus
are fully navigable on a pad.

## 15. Community assets  *(App Icon / Shortcut Icon)*

Both already exist — these are uploads, not work:

| Checklist item | File | Notes |
|---|---|---|
| App Icon | `steam/store-assets/community_icon_184x184.jpg` | 184×184, the shipped vortex mark |
| Shortcut Icon | `steam/store-assets/client_icon.ico` | 7 embedded sizes, 16→256 |

They deliberately reuse `build/icon-master-1024.png`, the same art
electron-builder embeds in the exe, so the Steam icon and the installed app's
icon match. A store icon that differs from the installed icon is a branding bug
however nice it looks.

