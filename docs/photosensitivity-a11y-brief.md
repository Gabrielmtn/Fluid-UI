# Photosensitivity UX — implementation brief (2026-10-05)

Context: Swirl Together already ships a first-frame seizure warning and a WCAG 2.3.1
display-stage limiter ("PhotoSafe"). An accessibility audit against WCAG 2.2 (2.3.1 /
2.3.2 / 2.3.3 / 1.4.4), ISO 9241-391, Ofcom flash-and-pattern guidance, the Epilepsy
Foundation consensus, Game Accessibility Guidelines and Xbox XAG 117 found the
*engine* sound and the *UX around it* the weak part. This brief lists every change,
in priority order, with file locations, exact copy, and acceptance criteria.

Hard rules that apply to every item below:

- Protection must remain ON by default and "absent → protected" everywhere. Nothing
  here may add a path that disables protection without a trusted (`isTrusted`) human
  event. Do not touch `PRESET_SKIP` / `MP_GATE_SKIP` / look-link skip lists except to
  add new safety-related ids to them.
- Never use the words "safe", "epilepsy-safe", "seizure-safe" or "safety" as a claim
  in user-facing copy. "PhotoSafe" stays an internal identifier only (ids, config
  keys, localStorage keys, code comments are fine). Describe what the feature does:
  "reduces flashing", "limits rapid brightness changes".
- The warning modal must stay static markup + synchronous inline script in
  `index.html` (first painted frame, no app globals). Keep the argv/localStorage cache
  logic in that script byte-for-byte unless an item below says otherwise.
- Do not add/remove code comments beyond what the change needs. Match the existing
  terse comment style.

---

## 1. Rewrite the warning modal copy (index.html `#photoWarn`)

Replace the current text with plain language, add symptoms and stop-advice, state
that protection reduces but does not remove risk, and drop the jargon labels.

Title (keep `⚠`, keep `id="pwTitle"`):
    PHOTOSENSITIVE SEIZURE WARNING

Description (`#pwDesc`):
    A very small number of people may have a seizure when exposed to flashing
    lights, rapid colour changes or moving repeating patterns. This app can
    produce all three. Protection that reduces flashing and limits how fast
    brightness can change is turned ON by default. It lowers the risk; it
    cannot remove it.

Checkbox label (`#pwProtect`), bold line then detail:
    Reduce flashing and rapid brightness changes (recommended)
    Rapid flashes become gentle fades, the rate of brightness change is
    capped, and fast kaleidoscope spin is limited. You can change this later
    in Display settings.

Unchecked live line (`.pw-unprotected`):
    Protection off: flashing and rapid brightness changes will not be limited.

New symptom paragraph (insert before the exit line, class `pw-symptoms`):
    Stop immediately and consult a doctor if you experience dizziness,
    altered vision, eye or muscle twitching, loss of awareness,
    disorientation, or involuntary movements.

Exit line (`.pw-exit-line`):
    If you or anyone in your family has photosensitive epilepsy or has had a
    seizure, consult a doctor before using this app, or exit now.

Buttons: `Exit App` stays. Primary button text:
    checked   → "Continue with protection on"
    unchecked → "I understand the risk, continue"

Add a "Learn more" link (see item 10) directly under the symptom paragraph.

Acceptance: modal renders identically in layout (card ≤ 430px wide, scrolls at
92vh); screen reader reads title → description → checkbox → live line → symptoms →
exit line → buttons in that order; no occurrence of the string "safe" (case-
insensitive) inside `#photoWarn` except the `fluidui.photoSafe` key in the script.

## 2. Display-section label, tooltip and other user-facing copy

- `index.html` `#photoSafeToggle` label: `Reduce flashing & rapid brightness changes`.
  Tooltip: `Photosensitivity protection — rapid flashes become fades, brightness
  change rate is capped, kaleidoscope spin is limited (WCAG 2.3.1 thresholds).
  Lowers risk; does not remove it. On by default.`
- `js/44-recipes.js` `photosafe` recipe answer: same wording, no "safe".
- `steam/TRAILER-SCRIPT.md` line ~181: replace "PhotoSafe keeps the app safe" with
  "No hard flashes faster than three a second: protection is on by default and
  reduces flashing; it does not make the app seizure-proof."
- Grep `steam/` and `docs/` for "safe mode", "epilepsy safe", "keeps the app safe"
  and fix any user-facing instance.

## 3. Confirm step when protection is turned OFF (js/05e-effect-controls.js)

On a *trusted* `change` event that moves `#photoSafeToggle` from checked → unchecked:

- Do NOT apply yet. Revert the checkbox to checked, then show a small inline confirm
  directly under the checkbox row (not a `window.confirm`; a div with
  `role="alertdialog"`, `aria-labelledby`, `aria-describedby`, focus moved into it,
  Esc = cancel). Text:
      Turn off flashing protection?
      Flashing, rapid brightness changes and fast patterns will not be limited.
      This can trigger seizures in people with photosensitive epilepsy.
      [Keep protection on]  [Turn off]
  "Keep protection on" is the default-focused button.
- Only a trusted click on "Turn off" applies the existing OFF path (config, body
  class, localStorage write). Synthetic change events keep today's behaviour
  (session-only, never persisted) — do not show the confirm for them, do not block
  them (tests rely on this; see `scripts/test/inventory/features.json` photoSafe).
- While protection is off, show a persistent, low-contrast, non-animated pill in the
  top bar near the Transport cell: `Flash protection off` — click opens Display and
  focuses the toggle. Hidden when on. Add its id to the preset/MP/look-link skip
  lists if anything would otherwise serialize it.

Acceptance: unchecking via mouse shows the confirm; "Keep" leaves everything
unchanged and `localStorage.fluidui.photoSafe` is untouched; "Turn off" results in
`config.PHOTOSAFE === false`, `localStorage.fluidui.photoSafe === '0'`, body class
removed, pill visible. `features.json` deactivate snippet still works unchanged.

## 4. Re-showable warning

- Refactor the inline `#photoWarn` script so the show/wire logic is a function
  `window.__showPhotoWarn(opts)` that (a) un-hides the modal, (b) re-installs the
  key/focus guards, (c) seeds the checkbox from the current `localStorage` value,
  and (d) on Continue runs the same trusted-persist path. Boot calls it when
  `!acked`; nothing else about boot timing changes. Keep the early-return path for
  acked installs as fast as it is now (no extra DOM work before the return).
- Add a button in Display under the toggle: `Show photosensitivity warning` →
  `window.__showPhotoWarn()`. Add a matching step/tag ("warning", "advisory") to the
  `photosafe` recipe.
- `Exit App` behaviour unchanged.

## 5. Modal technical accessibility fixes (index.html)

- Live region: `.pw-unprotected` must stay in the accessibility tree. Replace the
  `display:none` toggle with: element always rendered, text content set to the
  warning string when unchecked and to an empty string when checked, keep
  `aria-live="polite"`. Visual result identical.
- Key guard: stop swallowing browser zoom. In `keyGuard`, let through any event with
  `ctrlKey || metaKey` whose key is `=`, `+`, `-`, `0`, or `NumpadAdd/Subtract`, and
  do not `preventDefault` on `wheel` (we never did — just do not add it). Everything
  else in the guard stays.
- Viewport meta: remove `maximum-scale=1, user-scalable=no` (WCAG 1.4.4). Check that
  `13-mobile-mode.js` / touch handlers do not depend on it; if a pinch-zoom issue on
  the canvas appears, fix it with `touch-action: none` on the canvas element instead.
- Backdrop: `#photoWarn { background: #06080c; }` (fully opaque).
- Minimum text size in the modal 14px (`p`, `.pw-check span`, `.pw-exit-line`,
  `.pw-unprotected`); title 16px. Re-check card still fits at 92vh on a 720px-tall
  window with the new copy (scrolls if not — that is acceptable).
- Give the h1 an `aria-label` without the emoji glyph if a screen reader reads
  "warning sign" awkwardly; otherwise leave.

## 6. prefers-reduced-motion

- CSS: add one global rule, in `css/00-tokens.css` (first stylesheet):
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
        body.photosafe-on #canvas-wrapper, body.photosafe-on #canvas-area,
        body.photosafe-on canvas { transition-duration: 0.4s !important; }
      }
  The second block is mandatory: the 0.4s PhotoSafe DOM guard in `styles.css` must
  survive the global override. Remove the now-redundant per-rule block in
  `01-buttons.css` only if the global rule covers it exactly; otherwise leave it.
- JS (`js/04f-canvas-actions.js` `setupReducedMotion`): when the media query matches
  AND `localStorage.fluidui.photoSafe === '0'`, call `window.__showPhotoWarn()` once
  per session (sessionStorage flag) so an OS-level "reduce motion" user who once
  opted out gets the choice again. Do not flip the stored value automatically.

## 7. Limiter fallback drift + documentation

- `js/05i-sim-stats.js`: uniform fallbacks must equal the config defaults in
  `js/04a-canvas-gl-config.js`: `areaFrac` fallback `0.02` (currently `0.10`),
  `pairWindow` fallback `0.18` (currently `0.35`). Verify every other fallback
  matches (`slew 0.5`, `flashDelta 0.10`, `darkFloor 0.80`, `redDelta 0.20`,
  `releaseTau 1.2`, `rateAllow 5.0`).
- In the `photoSafeLumaFrag` comment block, add two lines noting the red test
  (`lin.r - 0.5*(lin.g+lin.b) >= redDelta`) is a conservative approximation of the
  ISO 9241-391 / WCAG 2.2 definition (R/(R+G+B) >= 0.8 and Δu′v′ > 0.2) and that
  `c*c` approximates sRGB linearisation.
- Update `scripts/test/inventory/params.json` and `shaders.json` entries if their
  recorded defaults mention the old fallbacks.

## 8. Limiter regression test (scripts/test/photosafe/)

Follow the structure of an existing harness (e.g. `scripts/test/mp/*-e2e.js` or
`scripts/test/audio/run.js`) — same launcher, same first-run-modal waiver, same
report format. Use `config.PHOTOSAFE_DT_OVERRIDE = 1/60` and `window.__getPhotoSafe()`
(documented in `features.json`). Build the strobe AND read state inside ONE page
evaluation (the rAF loop releases the envelope between tool calls).

Cases (all with protection ON, full-canvas area):
  a. Square-wave luminance strobe black↔white at 3, 6, 10, 20 Hz, 2 s each.
     Measure the presented canvas (readPixels after present) mean luminance per
     frame; assert no opposing pair ≥ 0.10 within any 1 s window after the first
     1 s of engagement, and `safeStats` texel0.R (envelope) ≥ 0.9 by 1 s for ≥6 Hz.
  b. Saturated red strobe (#ff0000 ↔ #000000) at 6 Hz: same assertions using the
     red channel delta ≥ 0.20 as the pair criterion.
  c. Slow ramp/sine at 2.5 Hz full amplitude: assert presented peak-to-peak
     luminance ≤ 0.10 (slew clamp covers it).
  d. Paint-only control: a monotonic single stroke on a static scene; assert the
     presented frame is bit-identical to the pre-limiter `safeFrame` (envelope stays
     0, exposure == 1).
  e. Protection OFF: case (a) at 6 Hz must show pairs ≥ 0.10 (proves the test can
     fail).
Produce a short markdown report with the measured max pair delta per case. Add the
test to whatever aggregate runner/README lists the suites.

## 9. Kaleidoscope spatial-pattern mitigation

Ofcom / Epilepsy Foundation: > 5 moving or > 8 static high-contrast stripe pairs
(radial included) over 25% / 40% of the screen are a trigger independent of flashing.
Under protection (`config.PHOTOSAFE`):
- Cap effective kaleidoscope segments so the radial pattern never exceeds 8 light/dark
  pairs across the field when static and 5 when spinning (spin > 0). Clamp at the
  animator/uniform level the way `PHOTOSAFE_SPIN_CAP` is applied
  (`05j-update-loop.js` ~286, `22-audio-reactive.js` ~1001, `40-audio-timing.js`
  ~1223); add `PHOTOSAFE_SEGMENT_CAP_STATIC: 16` and `PHOTOSAFE_SEGMENT_CAP_MOVING: 10`
  to `04a` config next to `PHOTOSAFE_SPIN_CAP` with a comment citing the rule.
- Leave the slider's stored value untouched (clamp at apply time, like spin), so
  turning protection off restores the user's value.
- Mention "moving repeating patterns" in the modal copy (already in item 1).

## 10. "Learn more" link

In the modal (under symptoms) and in Display under the toggle:
    Learn more about photosensitivity (Epilepsy Foundation)
    → https://www.epilepsy.com/what-is-epilepsy/seizure-triggers/photosensitivity
Opens in the system browser in Electron (`shell.openExternal` via the existing
external-link path) and `target="_blank" rel="noopener"` on the web. The modal's
key/focus guard must not block activating this link with Enter; add it to the Tab
cycle list `f` in `keyGuard`.

---

## Verification (whole brief)

- Fresh profile (clear `fluidui.photoWarn.ack.v1`, `fluidui.photoSafe`): warning
  shows first frame, all copy per item 1, Tab cycles checkbox → link → Exit →
  Continue, Ctrl+= zooms, screen reader announces the live line when unchecking.
- Acked profile: boot time unchanged (no extra work before the early return).
- `features.json` photoSafe activate/deactivate snippets still behave as documented.
- Run the new `scripts/test/photosafe` suite plus `mp-look-parity-e2e.js` and
  `mp-panel-e2e.js` (they waive the modal — confirm the waiver still works after
  the `__showPhotoWarn` refactor).
- Grep user-facing strings for `safe` and confirm only internal identifiers remain.
