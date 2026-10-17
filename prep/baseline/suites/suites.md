# UI suites run once (F6 baseline)

Captured 2026-10-17T13:03:03.394Z at HEAD `c4796da`, Node v25.9.0, Chrome 155.0.8059.80 (version folder beside `chrome.exe`; each suite boots its own headless Chrome and the driver window is 1600×900 at DPR 1, `--ui-scale` 1). Run sequentially by `prep/baseline/scripts/bundle.js --suites`; each log holds the suite's full stdout/stderr under a header. Nothing was fixed: a FAIL here is the state of the app on this date, recorded.

| Suite | Command | Exit | PASS | FAIL | Time | Summary line | Retried | Note |
|---|---|---:|---:|---:|---:|---|---|---|
| radial-menu | `node scripts/test/radial-menu/run.js` | 0 | 107 | 0 | 64.4 s | 53/53 passed ; 42/42 passed ; 12/12 passed |  | run.js spawns wheel.js, settings.js, regressions.js in turn (one Chrome each) |
| focus-keys | `node scripts/test/focus-keys/run.js` | 0 | 20 | 0 | 14.7 s | 20/20 passed |  |  |
| skip-menu | `node scripts/test/skip-menu/run.js` | 0 | 43 | 0 | 24.4 s | 43/43 passed |  |  |
| bar-keys | `node scripts/test/bar-keys/run.js` | 0 | 13 | 0 | 18.2 s | 13/13 passed |  |  |
| dialog-focus | `node scripts/test/dialog-focus/run.js` | 0 | 25 | 0 | 20.5 s | 25/25 passed |  |  |
| slider-keys | `node scripts/test/slider-keys/run.js` | 0 | 12 | 0 | 7.0 s | 12/12 passed |  |  |
| popup-focus | `node scripts/test/popup-focus/run.js` | 0 | 17 | 0 | 13.0 s | 17/17 passed |  |  |
| stroke-lock | `node scripts/test/stroke-lock/ring.js` | 0 | 10 | 0 | 25.3 s | 10/10 passed |  | no run.js in this folder; ring.js is its one check script (shared driver) |
| pen-window | `node scripts/test/pen-window/web-headless.js` | 0 | 53 | 0 | 19.8 s | {"ok":true,"fails":[]} |  | no run.js in this folder; web-headless.js is the headless entry, needs APP_URL (served by bundle.js) and writes three PNGs to PENWIN_OUT (set to the OS temp dir) |
| look-links | `node scripts/test/look-links/run.js` | 0 | 24 | 0 | 8.0 s | 7.9s OK  24 passed, 0 failed |  | run without MP_HOST (the live-room section is skipped by design) |

**10/10 suites exited 0; 324 PASS lines, 0 FAIL lines in all.**

## Retry policy

a suite whose outcome is not the expected one (exit 0 when capturing; the baseline counts when checking) is run a second time and the second run stands; the first attempt is kept as <name>.attempt-1.log and in attempt1. A real failure at HEAD fails twice and is recorded as such; a flake passes on the retry and is marked `flaky` with its first log kept. `--check` applies the same rule against the baseline counts, so a flake does not trip the gate and a real regression (two failing runs) does.

## How PASS / FAIL are counted

Lines matching `^\s*(\d+(\.\d+)?s\s+)?(PASS|FAIL)\b` in stdout + stderr (every suite prints one such line per check; look-links prefixes a time). The suites' own closing lines (`N/M passed`, `OK/FAILED N passed, M failed`, the pen-window JSON) are copied into the Summary column unparsed. The exit code is the gate the suites themselves define (1 on any failed check).

## Logs

- `prep/baseline/suites/radial-menu.log`
- `prep/baseline/suites/focus-keys.log`
- `prep/baseline/suites/skip-menu.log`
- `prep/baseline/suites/bar-keys.log`
- `prep/baseline/suites/dialog-focus.log`
- `prep/baseline/suites/slider-keys.log`
- `prep/baseline/suites/popup-focus.log`
- `prep/baseline/suites/stroke-lock.log`
- `prep/baseline/suites/pen-window.log`
- `prep/baseline/suites/look-links.log`
