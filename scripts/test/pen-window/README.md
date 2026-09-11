# Pen Input Window probes

Two CDP drivers for `js/47-pen-window.js` (Display → Pen Input Window).
Neither ships (electron-builder drops `scripts/`).

- `node scripts/test/pen-window/web-headless.js` — headless Chrome against a
  server on `http://127.0.0.1:3000/` (`APP_URL=` to override). Opens the app,
  clicks the button with a user gesture, attaches to the popup target and
  drives pen / right-button / wheel / hotkeys INTO THE POPUP, checking that
  the main page painted, replayed, resized, mirrored, and closed cleanly.
- `node scripts/test/pen-window/electron-probe.js` — the desktop build via the
  throwaway `throwaway-main.js` beside it (hidden main window, own userData,
  no single-instance lock, the REAL window-open handler lifted verbatim from
  electron-main.js). Checks the pen BrowserWindow lands fullscreen on another
  display, strokes reach 05d, Fullscreen and Screen ▸ work through remote,
  and Close destroys it. Runs while the real app is open.

- `node scripts/test/pen-window/scatter-replay.js` — Scatter's Brush light source
  stays with the HAND while a replay runs: paints a stroke, holds Replay in a
  corner, sweeps the mouse along the top with the button held and checks that
  `window.__scatterOrigin` tracks the mouse while `pointer` (the stroke state)
  stays frozen and the replay repaints the stroke where it was recorded.

Screenshots go to `%TEMP%` (or `PENWIN_OUT=<dir>`).
