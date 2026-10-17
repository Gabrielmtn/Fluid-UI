# Bundle sizes (F6 baseline)

Captured 2026-10-17T08:15:32.627Z at HEAD `c4796da` with Node v25.9.0 (read from disk, no app boot). Bytes are file sizes; gzip is `zlib` level 9, as a transfer-size proxy. Written by `prep/baseline/scripts/bundle.js --sizes`. Reported, not gated.

## Totals

| Group | Files | Bytes | KB | gzip KB | Note |
|---|---:|---:|---:|---:|---|
| Renderer as loaded | 118 | 5391390 | 5265.0 | 1450.9 | index.html + the stylesheets it links + the js/*.js it loads (tags and chain loader); js/vendor/ and assets/ are fetched on demand and listed separately |
| `index.html` | 1 | 132727 | 129.6 | 32.3 | 1 inline `<style>` block(s), 2861 bytes |
| CSS linked from index.html | 12 | 362597 | 354.1 | 92.0 | load order in the table below |
| CSS, every file under `css/` | 12 | 362597 | 354.1 | 92.0 | all linked |
| JS loaded (`js/*.js`, non-vendor) | 105 | 4896066 | 4781.3 | 1326.5 | script tags + the inline chain loader |
| JS, every `js/*.js` | 106 | 5004914 | 4887.6 | 1354.0 | 1 file(s) not loaded by index.html: `js/44-recipes.js` |
| `js/vendor/` | 5 | 12059075 | 11776.4 | 3028.1 | Transformers.js + ONNX runtime, fetched on demand for Magic Mask |
| `assets/` | 87 | 14568414 | 14227.0 |  | 9 gif, 1 ico, 77 png |
| Fonts shipped | 0 | 0 | 0.0 |  | none: no font files under css/, js/, assets/ or the root; no @font-face |
| Electron shell (root) | 2 | 73205 | 71.5 |  | `electron-main.js`, `electron-pen-cursor.js` (desktop build only) |

## Stylesheets

| # | File | Bytes | KB | gzip KB |
|---:|---|---:|---:|---:|
| 1 | `css/00-tokens.css` | 3582 | 3.5 | 1.4 |
| 2 | `css/01-buttons.css` | 17514 | 17.1 | 5.5 |
| 3 | `css/styles.css` | 51916 | 50.7 | 10.7 |
| 4 | `css/slider-styles.css` | 8266 | 8.1 | 2.9 |
| 5 | `css/mask-editor.css` | 17713 | 17.3 | 4.0 |
| 6 | `css/light-source.css` | 552 | 0.5 | 0.3 |
| 7 | `css/20-mixer-strip.css` | 51707 | 50.5 | 14.6 |
| 8 | `css/21-sidebar.css` | 84632 | 82.6 | 22.4 |
| 9 | `css/22-overlays.css` | 86115 | 84.1 | 18.7 |
| 10 | `css/23-colour-picker.css` | 15491 | 15.1 | 3.8 |
| 11 | `css/24-palette-from-image.css` | 4143 | 4.0 | 1.5 |
| 12 | `css/init-responsive.css` | 20966 | 20.5 | 6.2 |

Inline `<style>` blocks in `index.html`: line 249 (2861 bytes). Three more stylesheets are injected from JS at runtime (`js/00a-boot.js` boot cursor, `js/32-file-drop.js` drop outline, `js/16-sam-integration.js` SAM keyframes; see `prep/README.md`) and are counted inside those files.

## JavaScript (`js/*.js`, non-vendor)

| Load | File | Bytes | KB | gzip KB |
|---|---|---:|---:|---:|
| script tag #4 | `js/00-window-controls.js` | 5783 | 5.6 | 1.6 |
| script tag #1 | `js/00a-boot.js` | 25445 | 24.8 | 8.8 |
| script tag #3 | `js/00b-dialog-focus.js` | 13757 | 13.4 | 4.2 |
| script tag #5 | `js/01-config.js` | 82931 | 81.0 | 19.7 |
| script tag #6 | `js/01a-param-registry.js` | 40532 | 39.6 | 11.2 |
| script tag #7 | `js/02-palettes.js` | 16767 | 16.4 | 3.9 |
| script tag #8 | `js/02a-layer-xform.js` | 3696 | 3.6 | 1.4 |
| script tag #9 | `js/03-recording.js` | 109931 | 107.4 | 27.7 |
| chain loader #1 | `js/04a-canvas-gl-config.js` | 113624 | 111.0 | 31.9 |
| chain loader #2 | `js/04b-presets.js` | 16619 | 16.2 | 5.0 |
| chain loader #3 | `js/04c-anim-burst.js` | 8793 | 8.6 | 1.9 |
| chain loader #4 | `js/04d-anim-ascend-star.js` | 15244 | 14.9 | 3.9 |
| chain loader #5 | `js/04e-anim-portal.js` | 24554 | 24.0 | 4.7 |
| chain loader #6 | `js/04f-canvas-actions.js` | 31994 | 31.2 | 8.4 |
| chain loader #7 | `js/04g-hover-capture.js` | 16739 | 16.3 | 4.0 |
| chain loader #8 | `js/05a-shader-core.js` | 68224 | 66.6 | 18.9 |
| chain loader #9 | `js/05b-shader-sim.js` | 246713 | 240.9 | 68.8 |
| chain loader #10 | `js/05c-programs-framebuffers.js` | 71052 | 69.4 | 18.1 |
| chain loader #12 | `js/05d-input-replay.js` | 135386 | 132.2 | 36.8 |
| chain loader #11 | `js/05d0-brush-engine.js` | 45908 | 44.8 | 14.7 |
| chain loader #13 | `js/05e-effect-controls.js` | 27376 | 26.7 | 6.5 |
| chain loader #14 | `js/05f-kaleido-controls.js` | 15553 | 15.2 | 3.7 |
| chain loader #15 | `js/05g-arm-colors.js` | 65447 | 63.9 | 18.3 |
| chain loader #16 | `js/05h-slider-bindings.js` | 46069 | 45.0 | 10.6 |
| chain loader #17 | `js/05i-sim-stats.js` | 101523 | 99.1 | 25.3 |
| chain loader #18 | `js/05j-update-loop.js` | 190153 | 185.7 | 48.2 |
| chain loader #19 | `js/05k-layers-render.js` | 63474 | 62.0 | 14.8 |
| chain loader #20 | `js/05l-layers-transform.js` | 61848 | 60.4 | 13.6 |
| chain loader #21 | `js/05m-layer-masks.js` | 39857 | 38.9 | 9.9 |
| chain loader #22 | `js/05n-hotkeys-init.js` | 44323 | 43.3 | 11.7 |
| chain loader #23 | `js/05o-masks.js` | 20122 | 19.7 | 5.4 |
| chain loader #24 | `js/06-slider-updater.js` | 11439 | 11.2 | 3.9 |
| chain loader #25 | `js/06a-mp-core.js` | 36233 | 35.4 | 10.5 |
| chain loader #26 | `js/06b-mp-look.js` | 29711 | 29.0 | 9.7 |
| chain loader #27 | `js/06c-mp-glide.js` | 9817 | 9.6 | 3.7 |
| chain loader #28 | `js/06d-mp-paint-wire.js` | 111563 | 108.9 | 33.1 |
| chain loader #29 | `js/06e-mp-panel.js` | 46053 | 45.0 | 14.5 |
| script tag #14 | `js/08-stats-panel.js` | 8372 | 8.2 | 2.2 |
| script tag #15 | `js/08a-quality-governor.js` | 35938 | 35.1 | 10.5 |
| script tag #16 | `js/08b-jank-monitor.js` | 29124 | 28.4 | 8.4 |
| script tag #11 | `js/09-settings-manager.js` | 12167 | 11.9 | 2.9 |
| script tag #13 | `js/10-draggable.js` | 8976 | 8.8 | 2.1 |
| script tag #12 | `js/11-settings-interface.js` | 13585 | 13.3 | 2.5 |
| script tag #17 | `js/12-save-load.js` | 145697 | 142.3 | 36.1 |
| script tag #18 | `js/12b-preset-vault.js` | 27032 | 26.4 | 7.1 |
| script tag #24 | `js/13-compact-mode.js` | 5843 | 5.7 | 2.2 |
| script tag #23 | `js/13-drag-scroll.js` | 5026 | 4.9 | 1.3 |
| script tag #19 | `js/13-light-source.js` | 13836 | 13.5 | 2.8 |
| script tag #20 | `js/14-light-shift.js` | 29304 | 28.6 | 6.8 |
| script tag #25 | `js/15-layer-masking.js` | 182489 | 178.2 | 41.8 |
| module tag #26 | `js/16-sam-integration.js` | 65419 | 63.9 | 15.1 |
| script tag #21 | `js/17-hotkey-reminder.js` | 11336 | 11.1 | 3.9 |
| script tag #43 | `js/20-mixer-layout.js` | 486168 | 474.8 | 120.0 |
| script tag #28 | `js/21-focus-mode.js` | 14780 | 14.4 | 4.1 |
| script tag #29 | `js/22-audio-reactive.js` | 77891 | 76.1 | 22.5 |
| module tag #27 | `js/23-depth-collision.js` | 106997 | 104.5 | 28.3 |
| script tag #30 | `js/23-text-overlays.js` | 136044 | 132.9 | 37.9 |
| script tag #36 | `js/24-path-layers.js` | 54735 | 53.5 | 11.4 |
| script tag #32 | `js/24-video-export.js` | 98773 | 96.5 | 26.0 |
| script tag #31 | `js/24a-mp4-writer.js` | 25376 | 24.8 | 7.7 |
| script tag #33 | `js/25-mutation-engine.js` | 40002 | 39.1 | 10.9 |
| script tag #37 | `js/26-layer-transform.js` | 23101 | 22.6 | 6.5 |
| script tag #10 | `js/28-studio-drawer.js` | 5806 | 5.7 | 2.0 |
| chain loader #30 | `js/29-material-modes.js` | 16954 | 16.6 | 5.1 |
| script tag #38 | `js/30-audio-scenes.js` | 53711 | 52.5 | 15.0 |
| script tag #44 | `js/31-brush-cursor.js` | 46518 | 45.4 | 14.2 |
| script tag #45 | `js/32-file-drop.js` | 26519 | 25.9 | 8.1 |
| script tag #46 | `js/33-brush-shapes.js` | 25777 | 25.2 | 8.4 |
| script tag #47 | `js/34-mandala-mode.js` | 31187 | 30.5 | 9.7 |
| script tag #49 | `js/35-zoom-view.js` | 13923 | 13.6 | 4.6 |
| script tag #50 | `js/36-display-mode.js` | 11479 | 11.2 | 3.4 |
| script tag #52 | `js/37-nav-idle-glow.js` | 11108 | 10.8 | 4.2 |
| script tag #53 | `js/38-button-audit.js` | 6500 | 6.3 | 2.3 |
| script tag #2 | `js/39-qrcode.js` | 19038 | 18.6 | 5.6 |
| script tag #39 | `js/40-audio-timing.js` | 106885 | 104.4 | 30.3 |
| script tag #40 | `js/40b-audio-cue-editor.js` | 39910 | 39.0 | 11.7 |
| script tag #41 | `js/41-button-modes.js` | 19305 | 18.9 | 6.2 |
| script tag #54 | `js/42-perf-tiers.js` | 17059 | 16.7 | 5.8 |
| script tag #55 | `js/43-ui-visibility.js` | 35278 | 34.5 | 9.8 |
| not loaded | `js/44-recipes.js` | 108848 | 106.3 | 27.4 |
| script tag #57 | `js/45-breathing.js` | 19330 | 18.9 | 6.6 |
| script tag #56 | `js/46-strip-more.js` | 19834 | 19.4 | 6.5 |
| script tag #51 | `js/47-pen-window.js` | 97590 | 95.3 | 26.8 |
| script tag #22 | `js/48-hotkeys.js` | 39940 | 39.0 | 11.2 |
| script tag #58 | `js/49-hotkey-binds.js` | 73420 | 71.7 | 21.1 |
| script tag #63 | `js/50-look-links.js` | 59406 | 58.0 | 17.8 |
| script tag #64 | `js/51-open-in-desktop.js` | 18073 | 17.6 | 5.6 |
| script tag #65 | `js/52-demo-clock.js` | 23813 | 23.3 | 7.2 |
| script tag #66 | `js/53-idle-vram.js` | 12027 | 11.7 | 4.1 |
| script tag #67 | `js/54-phone-pads.js` | 31281 | 30.5 | 9.4 |
| script tag #68 | `js/55-phone-mouse.js` | 26603 | 26.0 | 8.1 |
| script tag #42 | `js/56-stroke-lock.js` | 37135 | 36.3 | 11.2 |
| script tag #34 | `js/57-mutation-thumbs.js` | 20241 | 19.8 | 6.5 |
| script tag #59 | `js/58-radial-menu.js` | 52626 | 51.4 | 15.4 |
| script tag #60 | `js/59-brush-type-key.js` | 5544 | 5.4 | 2.1 |
| script tag #69 | `js/60-reset-app.js` | 24040 | 23.5 | 7.1 |
| script tag #70 | `js/61-room-report.js` | 9893 | 9.7 | 3.4 |
| script tag #71 | `js/62-canvas-readout.js` | 5221 | 5.1 | 2.1 |
| script tag #48 | `js/63-kaleido-guides.js` | 19173 | 18.7 | 6.4 |
| script tag #73 | `js/64-colour-picker.js` | 51504 | 50.3 | 13.1 |
| script tag #72 | `js/64a-colour-math.js` | 7574 | 7.4 | 2.7 |
| script tag #74 | `js/65-palette-from-image.js` | 33429 | 32.6 | 9.8 |
| script tag #61 | `js/66-skip-menu.js` | 17923 | 17.5 | 5.5 |
| script tag #62 | `js/67-slider-keys.js` | 3092 | 3.0 | 1.4 |
| script tag #75 | `js/68-dither.js` | 19030 | 18.6 | 6.2 |
| script tag #35 | `js/comfyui-bridge.js` | 9103 | 8.9 | 2.8 |

## `js/vendor/`

| File | Bytes | KB | gzip KB |
|---|---:|---:|---:|
| `js/vendor/transformers/fluid-env.js` | 4769 | 4.7 | 2.1 |
| `js/vendor/transformers/LICENSE` | 11560 | 11.3 | 3.9 |
| `js/vendor/transformers/ort-wasm-simd-threaded.mjs` | 21165 | 20.7 | 8.4 |
| `js/vendor/transformers/ort-wasm-simd-threaded.wasm` | 11133407 | 10872.5 | 2796.6 |
| `js/vendor/transformers/transformers.min.js` | 888174 | 867.4 | 217.2 |

## `assets/`

### By type

| Type | Files | Bytes | KB |
|---|---:|---:|---:|
| gif | 9 | 11568053 | 11296.9 |
| ico | 1 | 19307 | 18.9 |
| png | 77 | 2981054 | 2911.2 |

### By folder

| Folder | Files | Bytes | KB |
|---|---:|---:|---:|
| `assets` | 4 | 103949 | 101.5 |
| `assets/boot-swirl` | 48 | 1327313 | 1296.2 |
| `assets/effects` | 18 | 11630514 | 11357.9 |
| `assets/og` | 1 | 692146 | 675.9 |
| `assets/presets` | 12 | 102160 | 99.8 |
| `assets/pwa` | 4 | 712332 | 695.6 |

### Largest 15

| File | Bytes | KB |
|---|---:|---:|
| `assets/effects/scatter.gif` | 2487623 | 2429.3 |
| `assets/effects/glow.gif` | 2091456 | 2042.4 |
| `assets/effects/breathing.gif` | 1426366 | 1392.9 |
| `assets/effects/shading.gif` | 1317958 | 1287.1 |
| `assets/effects/border.gif` | 1204993 | 1176.8 |
| `assets/effects/light-source.gif` | 1192189 | 1164.2 |
| `assets/effects/light-shift.gif` | 714768 | 698.0 |
| `assets/og/swirl-together-card.png` | 692146 | 675.9 |
| `assets/effects/dither.gif` | 681276 | 665.3 |
| `assets/effects/gravity.gif` | 451424 | 440.8 |
| `assets/pwa/icon-512.png` | 337545 | 329.6 |
| `assets/pwa/icon-maskable-512.png` | 257515 | 251.5 |
| `assets/pwa/icon-192.png` | 61798 | 60.3 |
| `assets/pwa/apple-touch-icon.png` | 55474 | 54.2 |
| `assets/apple-touch-icon.png` | 54753 | 53.5 |

The full per-file list is in `sizes.json` (`assets.files`).

## Fonts

- Font files (`.woff`, `.woff2`, `.ttf`, `.otf`, `.eot`) anywhere in the repo outside `node_modules/`, `.git/`, `dist/`, `public/`, `notes/`: **none**.
- `@font-face` declarations in `css/`, `index.html`, `js/*.js`: **none**.
- Google Fonts references (`fonts.googleapis.com` / `fonts.gstatic.com`): **none**.
- Font tokens in `css/00-tokens.css`: `--font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif`, `--font-mono: 'Courier New', monospace`.

| `font-family` declared (css/ + inline) | Count |
|---|---:|
| `'Courier New', monospace` | 10 |
| `inherit` | 8 |
| `monospace` | 3 |
| `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif` | 2 |
| `ui-monospace, Consolas, monospace` | 2 |
| `var(--font-ui, sans-serif)` | 2 |
| `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | 1 |
| `'Segoe UI', system-ui, sans-serif` | 1 |
| `Bahnschrift, 'DIN Alternate', var(--font-ui)` | 1 |
| `var(--font-mono)` | 1 |

So today the UI renders in system fonts only (the `-apple-system … Segoe UI` stack behind `--font-ui`, monospace stacks for readouts). CSS prep step 6 adds Michroma, Libre Franklin and Share Tech Mono as local woff2 files; they will add to the renderer total by design.
