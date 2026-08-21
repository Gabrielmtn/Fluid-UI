# Steamworks checklist — what's left

From the dashboard checklist (screenshot, 2026-08-21). Everything green there
is done; this is only the unchecked items, sorted by **what actually blocks
the Coming Soon page**, since that is what Next Fest registration needs.

The good news first: **most of these are already answered** in
[STORE-PAGE-COPY.md](STORE-PAGE-COPY.md) — they need pasting or a decision
from you, not work. Two of them are files that already exist on disk.

---

## 🔴 Blocks the page — needs YOU (decisions only, ~15 minutes)

| Item | Status | What's needed |
|---|---|---|
| **Support Info** | Copy ready, §13 | Steam requires a URL **or** an email, and it is shown publicly. Pick one: a dedicated address (better) or the itch page. This is a hard blocker. |
| **Content Survey** | Answers written, §9 | Answers are drafted: no violence/sex/adult themes; **user-generated content = YES** (players paint together and import images) with the handling note — sessions ephemeral, no chat, leave any time. Just needs entering. |
| **Controller Support Description** | Decided, §14 | Support level **None** — pointer-driven, no bindings. Leave the box unticked; the checklist item clears once the field is filled in. |

## 🟡 Blocks the page — needs UPLOADING (files exist, ~5 minutes)

| Item | Status | Where |
|---|---|---|
| **App Icon** (Community) | ✅ file exists | `steam/store-assets/community_icon_184x184.jpg` |
| **Shortcut Icon** (Community) | ✅ file exists | `steam/store-assets/client_icon.ico` (7 sizes, 16→256) |

Both deliberately reuse `build/icon-master-1024.png`, the same art the exe
embeds, so the store icon and the installed icon match.

## 🟠 Blocks RELEASE, not the Coming Soon page

| Item | Status | Note |
|---|---|---|
| **Pricing for at least one package** | [DECIDE] §12 | $9.99 vs $14.99. Does **not** block the page — leave until after approval. |
| **Published pricing** | follows the above | Same. |
| **Trailer Uploaded** | 🔴 blocked | Needs a capture session. **Valve's Next Fest trailer compilation pull is Sep 7** — this is the real deadline hiding in this list. |
| **At Least One Build Configured** | not done | A depot is configured; a *build* has not been pushed. |
| **Launch Options Defined** | not done | Must point at `Swirl Together.exe` — productName changed, and a stale launch config ships an app that cannot start (§0). |

## ⚪ Recommended, genuinely optional

| Item | Recommendation |
|---|---|
| **Cloud Saves** | Leave unchecked. §8 marks it BLOCKED until Auto-Cloud is configured (`*.fluidpreset`, non-recursive, `Documents/Swirl Together/Presets`). See the risk note below. |
| **Steam Achievements** | Post-launch. Nothing here is scored, so achievements need designing, not just wiring. |
| **Accessibility features** | Worth a pass before the demo — the photosensitivity story is already good (the strobing Ascend/Rainbow behaviour was removed) and saying so is cheap. |

---

## Ordered plan

1. **Support Info** — decide the address. Hard blocker, one line.
2. **Content Survey** — paste from §9.
3. **Controller Support Description** — paste from §14.
4. **Upload both community icons** — files are ready.
5. *(page can now go up for review)*
6. **Launch options + a build** — needed before anyone can actually run it.
7. **Trailer** — start the capture session; Sep 7 is the binding date.
8. Pricing after approval.

## Two things this list does not say out loud

- **The last-safe submit date is ~Aug 24** for the 🔴 Aug 31 registration
  deadline, and items 1-4 above are all that stand between here and
  submitting. That is a ~20-minute path, mostly decisions.
- **Cloud Saves is entangled with a real data-loss risk.** Measured this
  session: Chromium flushes localStorage asynchronously, so a crash or hard
  kill drops recent settings writes while older ones survive — which is the
  exact shape of the unexplained July preset loss. Presets live in that same
  storage. Worth resolving *before* wiring Cloud Saves, or Cloud will
  faithfully sync a store that can lose the last thing you made.
  (Details: `scripts/test/GUIDANCE.md` §2b.)
