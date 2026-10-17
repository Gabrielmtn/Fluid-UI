# Walnut & Copper — refactor starter kit

Study version 19 · docs exported 17 Oct 2026

| Path | What it is |
|---|---|
| `docs/walnut-copper-theme.md` | The theme spec: look, layout, components, motion, multiplayer, accessibility, implementation notes. |
| `prep/README.md` | The refactor prep doc. Every agent brief tells agents to read this file first. |
| `design/walnut-copper-study.html` | The full study (2.19 MB). Lines 1199–1200 are the embedded textures; never load them into an agent's context. |
| `design/study-lite.html` | The same file without those two lines (223 KB). Agents read this one. Its line numbers after 1198 are 2 lower than the map in `prep/README.md`. |
| `assets/textures/herringbone-2048.jpg` | The shipping wood: one seamless 2048 × 2048 px herringbone JPEG (860 KB), shared by the top bar and both sidebars. |
| `assets/textures/retired/parquet-diagonal.jpg` | The diagonal parquet, kept for reference only. It is retired and does not ship. |

Drop the folders into the repo root as they are. The prep doc already expects `prep/README.md`, `design/` and `assets/`.
