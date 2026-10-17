# W6: the top bar, and the bar in a small window

Read `prep/briefs/00-shared.md` first.

**You own** `css/33-theme-topbar.css`, except two rules other workstreams are editing at the same time: the dial hub (yin-yang) rules, which W1 is changing to spin, and the Material type slider's head row (`.fader-scale` and `.ch-value` in the `[data-ui-key="Fluid"]` cell), which W2 is aligning. Don't edit those two. You may edit `js/70-theme-telegraphs.js` only for the face drawing (W1 owns the lever's spring there; keep your hunks away from it). If the compact window needs a presentation hook in `js/13-compact-mode.js`, keep it tiny.

## 1. The bar in a small window (a real bug Gabriel hit)

In a small desktop window (`js/13-compact-mode.js`: 768 px wide or less, or 500 px tall or less and up to 1200 px wide) the app adds `body.compact-ui` and moves `#mixer-strip` into the right sidebar (`#sidebar-right > #mixer-strip`, styled in `css/21-sidebar.css` ~770-870). The theme's top-bar rules in `css/33` assume the bar is across the top (76 px dials, 112 px telegraph cells, fixed pane widths, the wrap above 1201 px), so in a small window the cells overflow and stack over the left sidebar. Gabriel saw this in a small Electron window.

Reproduce it headless at several small sizes (for example 760 x 700, 1000 x 480, 1200 x 500), then make the strip read well inside the sidebar in the theme: scope the top-bar-only rules so they don't apply in the compact layout, and give the compact strip a sidebar treatment that uses the same components (dials smaller, telegraphs fitted, the cluster's panes in rows that fit the column, nothing overlapping or clipped). Also check the 1201 to 1366 px band, where js/46 parks cells into the More panel: nothing may overlap there either. Behaviour (what moves where, what folds) stays exactly as js/13 and js/46 do it.

## 2. The top bar against the study

Compare `prep/compare/1920/topbar-pair.png` and `prep/compare/1440/topbar-pair.png` (in the main checkout, `Z:\New folder\Fluid-UI\prep\compare\`; app on top, study below), then reshoot them yourself. The study draws its bar's glass in WebGL; that pass is not in scope. Within CSS, close what you can:

- The bar's framing: the study's darker edges, the smoked-glass feel over the wood and the top and bottom rails (study-lite 36-110 and 475-574). A CSS stand-in only: gradients and shadows on existing elements, no new layers that cover the canvas, no animation.
- Dial faces: the study's face mesh, dot size and lit-dot halos (84 and the knob rules).
- Telegraph faces (js/70): check the needle's rest angle for each value against the study (the Laminar / Blend face at 0.00 looks different), the sector highlight, curved labels and nixies.
- The right cluster: pane brightness and mesh against the study's smoked glass; Clear's danger tint (the study's is subtle); the colour lamp; Presets.
- Labels and values: aligned as the study's, every cell.

## Check

Shots at 1920, 1440, 1366 and the small sizes, next to the study's where it has one. All suites (radial-menu, bar-keys and pen-window drive the bar).
