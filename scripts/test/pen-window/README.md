# Pen Input Window probes

Two CDP drivers for `js/47-pen-window.js` (Display → Pen Input Window).
Neither ships (electron-builder drops `scripts/`).

- `node scripts/test/pen-window/web-headless.js` — headless Chrome against a
  server on `http://127.0.0.1:3000/` (`APP_URL=` to override). Opens the app,
  clicks the button with a user gesture, attaches to the popup target and
  drives pen / right-button / wheel / hotkeys INTO THE POPUP, checking that
  the main page painted, replayed, resized, mirrored, and closed cleanly.
- `node scripts/test/pen-window/device-switch.js` — same setup: switching
  between pen and mouse can never leave a stroke stuck down (a forwarded
  release lost to the stray-mouse filter, a chorded tip-up-barrel-last
  release, a stale pen id, the mouse turning up in the app, 40 rounds of
  rapid alternation, and the same chord on the main canvas with no pen
  window), plus the mirror: wiped paint leaves the tablet too, the
  Background Color shows under it, the first input after idle redraws at
  once. 14 of its 15 checks fail on the code before 2026-09-14.
- `node scripts/test/pen-window/electron-probe.js` — the desktop build via the
  throwaway `throwaway-main.js` beside it (hidden main window, own userData,
  no single-instance lock, the REAL window-open handler lifted verbatim from
  electron-main.js). Checks the pen BrowserWindow lands fullscreen on another
  display, strokes reach 05d, Fullscreen and Screen ▸ work through remote,
  and Close destroys it. Runs while the real app is open.

- `node scripts/test/pen-window/cursor-return-unit.js` — "Mouse Picks Up Where
  It Left Off", main-process half (`electron-pen-cursor.js`) in plain Node
  with a fake cursor and fake monitors: home sampling, arm/return, the
  deliberate trip onto the tablet, same-screen, unplugged screens, self-stop.
  Touches nothing real.
- `node scripts/test/pen-window/cursor-return.js` — the same feature end to
  end in the desktop build, on the REAL cursor: pen events into the popup
  over CDP, "Windows moved the arrow" as a real SetCursorPos through a
  test-only hook in `throwaway-main.js`, verdicts read the cursor back.
  MOVES YOUR CURSOR for ~5 s (restored after) — it will not start while the
  mouse is moving, and a hand on the mouse mid-run stops it as INTERFERENCE
  (exit 2), never as a failure. Needs a second screen.

- `node scripts/test/pen-window/scatter-replay.js` — Scatter's Brush light source
  stays with the HAND while a replay runs: paints a stroke, holds Replay in a
  corner, sweeps the mouse along the top with the button held and checks that
  `window.__scatterOrigin` tracks the mouse while `pointer` (the stroke state)
  stays frozen and the replay repaints the stroke where it was recorded.

Screenshots go to `%TEMP%` (or `PENWIN_OUT=<dir>`).
