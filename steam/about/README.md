# steam/about — the About This Game section

Copy and pictures for the one field on the store page that is allowed to be
long. Everything here is source material; nothing ships in the build.

| File | What it is |
|---|---|
| `ABOUT-COPY.md` | The BBCode block, paste-ready, with `[img]` tags in place |
| `SHOT-PLAN.md` | One brief per image — what it shows, and why that device |
| `images/` | The baked PNGs, produced by `scripts/bake-about-shots.js` |

## Sizing

The description column renders about **616 px** wide and caps anything wider at
100%, so the shots bake at **1232×693** — 2× a 616×347 16:9 frame. They land at
the column's full width and stay crisp on a high-DPI display, and nothing is
cropped by Steam.

Steam scales down, never up: a 616-wide upload looks soft on the same monitors
where the 1232 looks right.

## How these differ from the five store screenshots

`steam/screenshots/` fills Valve's screenshot slots, which have to be
**gameplay, no marketing overlay**, at 1920×1080. These About images sit inside
prose that already says what the feature is, so they are free to be quieter and
more specific — a single mechanic per frame, sized for a narrow column, read at
a glance while scrolling.

Both sets bake from the real solver at pinned top quality. Neither composites
text.

## Upload

The description editor has an image button; images added through it are stored
against the app and referenced as `{STEAM_APP_IMAGE}/extras/<filename>`. Upload
each file from `images/` under exactly the name used in `ABOUT-COPY.md` — the
tag is a literal path, so a rename breaks the picture silently and the page
still saves.

## Baking

The same CDP harness as every other baker in `scripts/`:

```bash
node_modules/electron/dist/electron.exe . --remote-debugging-port=9333
```

then, in a second shell:

```bash
node tmp-cdp-driver.js @scripts/shot-helpers.js && node tmp-cdp-driver.js @scripts/bake-about-shots.js
```

`shot-helpers.js` must go first — it installs `window.__shot`, and the About
baker is written against that kit rather than re-deriving stroke geometry.

**Bake from a fresh app boot, one run per boot.** BASE is captured from live
app state, and the material layer's fluid-restore stash drifts through every
snapshot round-trip — a second bake in the same session inherits the first
bake's residue (measured: a third-round bake started from thick-paint physics
that the materials shot had leaked two rounds earlier). Kill and relaunch the
Electron process between runs.
