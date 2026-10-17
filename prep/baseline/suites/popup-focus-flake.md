# popup-focus flake (F6)

`scripts/test/popup-focus/run.js` failed 4 of its checks on the first F6 suites capture (2026-10-17 08:18Z) and has passed every run since. This file records the runs, the failing checks and the harness exception verbatim, and what the failing step depends on, from reading the suite and the app code it drives. Nothing was fixed: the suite and the app are as at HEAD `c4796da`; the pin is in `prep/baseline/scripts/bundle.js` (retry once, baseline re-captured) and is described in `NOTES.md`.

Environment for every run below: Windows 11 (10.0.26200), Node v25.9.0, Chrome 155.0.8059.80 headless through `scripts/test/radial-menu/driver.js` (own static server, scratch profile, window 1600×900, viewport 1584×805 CSS px, DPR 1, `--ui-scale` 1), one Chrome at a time, each closed in the suite's `finally`.

## Runs

| # | When (UTC) | How | Exit | PASS | FAIL | Duration | Closing line | Log |
|---|---|---|---:|---:|---:|---:|---|---|
| 1 | 2026-10-17T08:18:46.875Z | `bundle.js --suites` first capture, spawned the moment slider-keys' process exited | **1** | **5** | **4** | 8.2 s | `5/9 passed` | `prep/baseline/suites/popup-focus.first-capture.log` |
| 2 | 2026-10-17T08:22:56.234Z | `bundle.js --check` re-run (previous attempt) | 0 | 17 | 0 | 13.0 s | `17/17 passed` | `prep/work/bundle-check/popup-focus.first-check.log` |
| 3 | 2026-10-17T12:47:58.492Z | `node scripts/test/popup-focus/run.js`, run 1 of 5, sequential, 2 s apart | 0 | 17 | 0 | 12.99 s | `17/17 passed` | `prep/work/popup-focus-flake/run-1.log` |
| 4 | 2026-10-17T12:48:13.560Z | run 2 of 5 | 0 | 17 | 0 | 13.05 s | `17/17 passed` | `prep/work/popup-focus-flake/run-2.log` |
| 5 | 2026-10-17T12:48:28.690Z | run 3 of 5 | 0 | 17 | 0 | 13.11 s | `17/17 passed` | `prep/work/popup-focus-flake/run-3.log` |
| 6 | 2026-10-17T12:48:43.893Z | run 4 of 5 | 0 | 17 | 0 | 13.05 s | `17/17 passed` | `prep/work/popup-focus-flake/run-4.log` |
| 7 | 2026-10-17T12:48:59.019Z | run 5 of 5 | 0 | 17 | 0 | 13.09 s | `17/17 passed` | `prep/work/popup-focus-flake/run-5.log` |
| 8 | 2026-10-17T13:05:32.653Z | `bundle.js --suites` re-capture (the baseline that now stands; first attempt, no retry) | 0 | 17 | 0 | 13.0 s | `17/17 passed` | `prep/baseline/suites/popup-focus.log` |

**popup-focus runs: 5 (the task's sequential runs), passes 5/5; 8 runs of the suite in all on this date, 7 passed, 1 failed (run 1).** The `--check` at the end of F6 (`bundle.js --check`, 13:09:27Z, `prep/work/bundle-check/suites/popup-focus.log`) was a ninth run: exit 0, 17 PASS / 0 FAIL, 12.9 s, no retry needed; the whole check passed (`NOTES.md`, "Observed `--check` result").

Two diagnostics replayed the suite's P1–P4 and C1–C2 steps under instrumentation (same driver, same inputs and sleeps, a hit-test at the trigger centre before and at the mouse press), without reproducing the failure:

| Diagnostic | Replays | P4 | C1 | Script / data |
|---|---:|---|---|---|
| geometry sampled every 100 ms for 6 s after boot, then one replay; then reload under `Emulation.setCPUThrottlingRate` 6× and one replay at once | 2 | 2/2 pass, hit = trigger | 2/2 | `prep/work/popup-focus-flake/diag.js`, `diag.json` |
| 8 replays with a reload between, 6 busy-loop node workers on a 32-thread machine | 8 | 8/8 pass, hit at press = trigger | 8/8 | `prep/work/popup-focus-flake/diag2.js`, `diag2.json` |

## The failing run, verbatim

From `popup-focus.first-capture.log` (header: duration 8.2 s, exit code 1, PASS 5 / FAIL 4):

```
PASS P1 Presets from the keyboard: opens with focus on a preset, aria-expanded true  {"s":{"shown":true,"inside":true,"active":"BUTTON.mixer-preset-btn","frozen":false},"exp":"true"}
PASS P2 Esc closes it and focus goes back to the trigger  {"shown":false,"inside":false,"active":"mixerPresetsTrigger","frozen":false}
PASS P3 Shift+Tab back past its first control steps out and closes Presets (skip menu shut)  {"s":{"shown":false,"inside":false,"active":"SPAN.section-title","frozen":false},"skip":false}
PASS P3 ...and focus landing outside it closes it too  {"shown":false,"inside":false,"active":"resetAppBtn","frozen":false}
FAIL P4 opened with the mouse: focus not moved in, and Space still freezes  {"s":{"shown":false,"inside":false,"active":"SPAN.section-title","frozen":false},"sp":{"shown":false,"inside":false,"active":"SPAN.section-title","frozen":false}}
PASS P4 ...a click away closes it
FAIL C1 a colour well from the keyboard: the picker opens with focus inside it  {"okBg":false,"s":{"shown":false,"inside":false,"active":"BODY","frozen":false}}
FAIL C2 Esc closes it and focus goes back to the well  {"shown":false,"inside":false,"active":"SPAN.section-title","frozen":false}
FAIL harness  "Error: page exception: TypeError: Cannot read properties of null (reading 'focus')\n    at <anonymous>:1:48\n    at Object.ev (Z:\\New folder\\Fluid-UI\\scripts\\test\\radial-menu\\driver.js:81:39)\n    at async Z:\\New folder\\Fluid-UI\\scripts\\test\\popup-focus\\run.js:74:9"

5/9 passed
```

The same four checks in the passing runs (run 2, identical in runs 3–8):

```
PASS P4 opened with the mouse: focus not moved in, and Space still freezes  {"s":{"shown":true,"inside":false,"active":"mixerPresetsTrigger","frozen":false},"sp":{"shown":true,"inside":false,"active":"mixerPresetsTrigger","frozen":true}}
PASS C1 a colour well from the keyboard: the picker opens with focus inside it  {"okBg":true,"s":{"shown":true,"inside":true,"active":"INPUT.cp-hex","frozen":false}}
PASS C2 Esc closes it and focus goes back to the well  {"shown":false,"inside":false,"active":"backgroundColorPicker","frozen":false}
```

Failing check names: `P4 opened with the mouse: focus not moved in, and Space still freezes`; `C1 a colour well from the keyboard: the picker opens with focus inside it`; `C2 Esc closes it and focus goes back to the well`; `harness`. The harness exception is the suite's own `catch` (`run.js:125–126`) recording a page exception thrown by `document.querySelector('.cp-pop .cp-pop-close').focus()` at `run.js:74`: `.cp-pop .cp-pop-close` was null because the colour picker had not opened in C1. The `catch` ends the suite, so C3, C4, R1–R4, M1–M2 and `X no page exceptions` (8 checks) never ran; the suite's `5/9` is of the checks reached, and the full list has 17.

## What the failing step does

`run.js:52–58` (P4), after P3 left the Presets panel closed and focus on `#resetAppBtn`:

| Line | Step | Waits | Reads |
|---|---|---|---|
| 52 | `document.activeElement.blur()` | — | — |
| 53 | `centre('mixerPresetsTrigger')`: `getBoundingClientRect()` centre of the trigger, one `Runtime.evaluate` | — | trigger rect |
| 54 | `d.click(x, y)`: trusted `mouseMoved`, `mousePressed`, 40 ms, `mouseReleased`, 60 ms (`driver.js:111`), then `sleep(250)` | 350 ms fixed | — |
| 55 | `where('.mixer-presets-panel')`: `shown` = panel has client rects and `display !== 'none'`; `inside` = panel contains `activeElement`; `active` = id or `TAG.firstClass` of `activeElement` | — | `s` |
| 56–57 | `tap(Space)` + 200 ms, `where` again | 200 ms fixed | `sp` |
| 58 | check `s.shown && !s.inside && sp.frozen` | | |

What the app does on that click (web build, `lastInput` is `'pointer'` after the `pointerdown`, `js/00b-dialog-focus.js:41–43`): `mousePressed` focuses the `<button>`; `click` → `js/20-mixer-layout.js:2260–2263` toggles: `panel.style.display === 'none'` → `openPanel()` (`:2237–2251`: `display = 'flex'`, `trigger.classList.add('active')`, `aria-expanded`, `renderMixerUserPresets()`, `positionPanel()`, `DialogFocus.popup(panel, trigger, …)`, which with `lastInput === 'pointer'` moves no focus, `00b:208–212`). So the expected state 250 ms later is `shown: true, active: mixerPresetsTrigger` (the passing runs), then Space on a pointer-focused button freezes (05n) rather than pressing it.

The failing run read `shown: false, active: SPAN.section-title` at both reads.

## What the failure depends on

1. **The pointer did not do it.** A `.section-title` is the only element class that can print as `SPAN.section-title`, and it takes focus from a mouse only when the press lands on the span itself (`tabIndex = 0`, `js/20:9325`). Measured at boot in this viewport (`diag2.json` `facts.titles`): the right sidebar's seventeen title spans sit at x 1317 to at most 1466 ("Colors and palettes", 149 px wide) and y ≥ 70; the left sidebar's at x 12–145. The trigger centre is (1489, 17), `#mixer-strip` is `flex-wrap: nowrap`, `overflow-x: auto` with `scrollWidth === clientWidth` (no overflow, no second row), `body` is `overflow: hidden` with `scrollHeight === innerHeight` (no document scroll), and in 56 samples over the 6 s after `boot()` returned the trigger rect never moved and `elementFromPoint` at its centre was always the trigger (`diag.json`). No press at or near the measured centre can reach a title span at any time after `boot()` returns; the entrance animation (`#mixer-strip.ui-enter`, `css/init-responsive.css:198–234`) is removed together with the splash (`js/20:296–310`), 600 ms or more before `boot()` returns (`driver.js:90–96`).

2. **So focus reached the title programmatically, and the panel was closed (or never opened) by the app, between the press and the read 250 ms later.** The code that focuses a `.section-title` on its own: the accordion's `MutationObserver` in `makeSection` (`js/20:9342–9349`), which focuses a section's title when that section gains `collapsed` while `document.activeElement` is inside its body; the folded left bar's rail buttons (`keyIn(e, sec.querySelector('.section-title'))`, `js/20:2458`, not reachable here: the bar is open at this width, `js/20:2497`); the skip menu's jump to a region (`js/66-skip-menu.js:231`, only from its own options). The code that closes the Presets panel other than the suite's own inputs: the popup's `focusout` rule when focus leaves the panel for an element that is neither in it, in the trigger, in a dialog nor kept (`00b:195–206` → `closePanel`), and `js/43-ui-visibility.js:226–236` `onHidden`, which clicks `#mixerPresetsTrigger.active` when the Presets strip cell is hidden and adds `collapsed` to a hidden open section (both in one `apply()`, `:164–186`). The failing state is therefore a section-state or visibility change by the app, not a result of the suite's own input, landing inside the suite's fixed waits. Which caller fired could not be observed after the fact: the suite records `activeElement` only, and the failure did not recur in 16 instrumented or plain runs.

3. **Timing: the suite waits fixed times, not for state.** `sleep(250)` after the click (`run.js:54`), 200 ms after every key (`run.js:21`), `sleep(900)` after `openSidebarSection` (`run.js:65`, `:88`). P4 happens about 2.2–2.6 s after `boot()` returns (five taps at 290 ms plus eight evaluations). The app has work of its own on the clock in that window that the driver's seed does not switch off for this suite: the Reset-app one-time note (`js/60-reset-app.js:400–415`, `swirlResetHint.v1` unset in the driver's seed, shown after a 1 s poll plus 3 s quiet, observed at page t = 7.8 s with `boot()` back at 3.4 s, so about 4.4 s after boot in a quiet run, earlier relative to the suite's steps when they run slowly), the startup-fork waiver (`js/43:589–608`, `__skipUIFork` → `chooseLayout(null)` → `EVT_CHOSEN` listeners), and LookWatchdog's resolution step-up at about 3.8 s page time (console, `diag.json`). The failing run was the only one spawned with no gap after another suite's Chrome had just been killed (`bundle.js` starts the next suite as soon as the previous process exits; the driver's `close()` waits 300 ms after `chrome.kill()`, `driver.js:118`), and the only one with a visibly shorter wall time per step (8.2 s for 9 checks against 13.0 s for 17). A slower step sequence moves P4 later into the app's own timeline, towards that work; the diagnostics' 6× CPU throttle and six busy-loop workers did not reproduce it.

4. **Why one flaked check cost eight more.** C1 (`run.js:64–69`) opens the Display section, waits 900 ms, focuses `#backgroundColorPicker` and presses Enter. In the failing run `okBg` was false and `active` was `BODY`, so the `<input type="color">` could not take focus (its section body was `visibility: hidden`, `css/21-sidebar.css:133–139`, or hidden otherwise) and nothing opened. C2's Esc then left focus on a `SPAN.section-title` again (the state of point 2 was still being produced). `run.js:74` then dereferences `document.querySelector('.cp-pop .cp-pop-close')` without a null check, the page exception becomes a harness FAIL, and the suite's `catch` ends the run before R1–R4, M1–M2 and X. The same unguarded line is at `run.js:79`.

5. **One more state source the driver allows.** `driver.js:48–49` names the scratch profile `fluid-radial-e2e-<port>` after a random port in 9400–9799 and `:68–70` seeds localStorage only for keys that are unset, so a profile left behind by a killed run (the `finally` never ran) is inherited by a later run that draws the same port, with its saved sections, hint and preset state. Two leftovers exist in `%TEMP%` (`fluid-radial-e2e-9416`, 2026-10-17 04:26, empty; `fluid-radial-e2e-9620`, 2026-10-16 01:31, brush settings, no section or hint keys). Odds 2 in 400 per boot. Not touched; whether run 1 drew a stale profile is unknowable (the profile it used was deleted by its own `close()`).

In short: P4 depends on no asynchronous app work changing section state or focus during a fixed 250 ms after a trusted click some 2–3 s after boot, and on the preceding Chrome being fully gone; the C-block depends on the picker having opened. The suite is not changed here (outside prep); the baseline is pinned by recording the common case and retrying a suite once in `--check`.

## Not covered

- The failure was not reproduced, so the caller that folded a section or moved focus in run 1 is inferred from code, not observed. A reproduction would need the suite (or a copy of it) to log `document.activeElement`, the `collapsed` class of every section and the panel's `display` at the moment of the press, and to run many times straight after another suite's Chrome exit.
- Only the web build in headless Chrome; the Electron build is not run by this suite.
- The suite's R and M blocks were not analysed beyond noting they never ran in the failing run.
