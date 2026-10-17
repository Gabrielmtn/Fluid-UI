# UI suites (F6) — notes

The ten existing UI suites run once each, sequentially, by `prep/baseline/scripts/bundle.js --suites` (HEAD `c4796da`, Node v25.9.0, Chrome 155.0.8059.80 headless). First captured 2026-10-17 08:16Z; **re-captured 2026-10-17 13:03Z** after the one failing suite of the first capture (popup-focus) turned out to be a flake, so the recorded counts are the common case. The full notes for this capture, the sizes and the button audit are in `prep/baseline/bundle/NOTES.md`; this file only carries what is specific to the suite logs.

| File | What |
|---|---|
| `<suite>.log` | Full stdout + stderr of one suite under a header: command, start time, duration, exit code, PASS/FAIL count, the suite's closing line, HEAD, node, Chrome |
| `<suite>.attempt-1.log` | Only when a suite was run twice (retry policy below): the first attempt, kept beside the run that stands. None in this capture |
| `popup-focus.first-capture.log` | The first capture's failing popup-focus run (2026-10-17 08:18Z, exit 1, 5 PASS / 4 FAIL), kept when the baseline was re-captured |
| `popup-focus-flake.md` | That failure characterised: five sequential re-runs, the failing checks and the harness exception, what the failure depends on |
| `suites.json` | Machine copy: per suite `exitCode`, `pass`, `fail`, `summaryLines`, `failLines`, `durationMs`, `note`, and `retried` / `attempt1` / `flaky` when a second run was needed; `retryPolicy` |
| `suites.md` | The table (with a Retried column), FAIL lines verbatim, the retry policy, how PASS/FAIL are counted |

## Result

**10/10 suites exited 0; 324 PASS lines, 0 FAIL lines; no suite needed a second run.** radial-menu 107, focus-keys 20, skip-menu 43, bar-keys 13, dialog-focus 25, slider-keys 12, popup-focus 17, stroke-lock 10, pen-window 53, look-links 24.

The first capture (08:16Z) had popup-focus at exit 1 with 5 PASS / 4 FAIL: its P4 (Presets opened with the mouse) found the panel not shown and focus on a `SPAN.section-title`, C1/C2 (colour well from the keyboard) followed, and a harness exception at `scripts/test/popup-focus/run.js:74` aborted the remaining checks. The same suite passed 17/17 on the `--check` re-run four minutes later and on every run since (17 runs: 1 fail). It is a flake, not a regression at HEAD; see `popup-focus-flake.md`. Nothing in the suite or the app was changed.

## Retry policy

`bundle.js` runs a suite a second time when its outcome is not the expected one: exit 0 when capturing, the baseline's exit code and PASS/FAIL counts when checking. The second run stands; the first is kept as `<suite>.attempt-1.log` and under `attempt1` in `suites.json`, and the suite is marked `retried` (plus `flaky` when the two runs differ, which is a PROBLEM line, not a gate failure). So in `--check` a flake that passes on the retry does not trip the gate, and a real regression (two failing runs) does; both runs are recorded under `prep/work/bundle-check/suites/`. The policy is in `bundle.js` (`attemptSuite`, `captureSuites`, comment block "Retry policy").

## Suite-only caveats

- `stroke-lock` and `pen-window` have no `run.js`; `ring.js` and `web-headless.js` are run instead (see the main notes). pen-window needs the app served at `APP_URL`; `bundle.js` serves the repo on an ephemeral port for it and sends its three PNGs to `%TEMP%\fluid-f6-penwin`.
- look-links runs without `MP_HOST`, so its live-room section prints `skip …` and is not counted.
- radial-menu's `run.js` spawns three sub-scripts in turn; their PASS lines are all in `radial-menu.log` and the count (107) is the sum (53 + 42 + 12).
- `--check` compares exit code and PASS/FAIL counts per suite, not check names; the logs hold the names. A suite that changes its check list (more or fewer checks) fails the gate even when every check passes, and needs a re-baseline.
- Each suite boots its own headless Chrome; `bundle.js` never runs two at once. Run the whole thing alone, never beside F2's trace. A retried suite adds its own duration once more (popup-focus: 13 s).
- The driver (`scripts/test/radial-menu/driver.js`) names its scratch profile after a random debug port (9400–9799) and seeds localStorage only for keys that are unset, so a profile left behind by a killed run is inherited by a later run that draws the same port. Two such leftovers were found in `%TEMP%` (`fluid-radial-e2e-9416`, empty, from this morning's interrupted run; `fluid-radial-e2e-9620`, 2026-10-16, with brush settings but no section or hint state). Not touched; reported in `popup-focus-flake.md` and the open items.
