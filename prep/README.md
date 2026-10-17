# Walnut & Copper Refactor Prep

Oct 17, 2026 · @Gabriel (exported from the planning doc; Claude's session notes are at the end)

## Purpose and ground rules

This doc gets the codebase and your agents ready for the Walnut & Copper reskin. It covers what each agent loads into its context, what it inventories, and how the CSS is restructured so the theme can land later as a style-only change. The look itself is specified in the Walnut & Copper Theme doc; this doc does not restate it. Where the two differ, the theme doc wins on appearance and this doc wins on process.

This phase is a warm-up, and it is read-only. Agents load the local codebase, the current black UI, into their context, learn it, and write reports into `prep/`. They change no code and commit nothing outside `prep/`. The study is not final either: a few more UX and interaction tweaks are coming, on the same general set of features. So anything taken from the study is direction, not spec, and its line numbers will move. The CSS steps further down are the plan agents will carry out later; in this phase they only annotate it against the codebase.

Rules every agent works under:

- **Behaviour is frozen.** No change to what any control does, its value range, step, default, keyboard handling, event order or timing. Telegraphs, dials and drawers in the study are presentation for existing controls, not new behaviour.
- **Sync is frozen.** No change to what syncs over PartyKit, message shapes, throttling or merge rules. The left brush sidebar stays personal; everything else stays shared, exactly as today.
- **Performance is frozen.** The simulation's frame budget is the ceiling. Plan to make the best and most performant choices to achieve the aesthetic with no new per-frame layout reads that might cause slowdowns, no new WebGL contexts, no new animation loops. The console glass pass, when it comes, runs inside the simulation's existing context.
- **Selectors JavaScript depends on do not move.** Any class, id or data attribute that script queries or toggles keeps its name and meaning. Styling hooks are added beside them, never in place of them.
- **Accessibility only goes up.** Roles, names, states, focus order and live-region behaviour stay at least as good as the baseline captured in prep.
- **Report, don't decide.** If a task finds something that would need a behaviour change to style cleanly, it goes on the open items list for Gabriel, not into code.

## Map of the study file

The reference implementation is the Walnut & Copper study, a single HTML file of about 2.2 MB and 3,290 lines (version 18). Save a copy into the repo as `design/walnut-copper-study.html` so every agent reads the same version. Line numbers below are for version 18; if the study is republished, regenerate this map before handing out tasks.

**Never load lines 1183 and 1184.** They are the herringbone and parquet textures as base64 data URIs, 1.1 MB and 0.8 MB on single lines. One accidental read fills an agent's context with noise. Have agents read the file by range, or strip those two lines first:

```bash
awk 'length($0) < 20000' design/walnut-copper-study.html > design/study-lite.html
```

The stripped copy loses its textures but keeps every rule, element and line of script, which is all an agent needs.

| Lines | What it holds | Load for |
|---|---|---|
| 6–35 | Tokens on `:root`: copper, lit and unlit cathode, VFD teal, engrave, room, focus, player colours, fonts | Tokens |
| 36–106 | Console base: `.console`, labels, cathode panes (`.cap`), readout, dials, tubes, chips | Top bar |
| 107–159 | The dock (rules and tuning panel; study-only, not shipped) | Skip |
| 160–413 | Sidebar components: panes, indicators, fields, keycaps, bargraph sliders, brush screen, multi-brush, gates, CRT, lamps, text fields, layers, timing, gravity scope | Sidebar components |
| 414–470 | Cabinet and drawers, room drawer, nixies | Sidebar shell |
| 471–560 | Final top bar: field selects, dial groups, telegraphs, action rows, full-bleed layout, lit-label halo, idle easter egg | Top bar |
| 563–625 | Top bar markup | Top bar |
| 626–1092 | Sidebar markup: left cabinet (Brush, Multi-brush, Input) at 636, right cabinet (Swirl Together to Settings) at 798 | Sidebar |
| 1093–1180 | Dock markup | Skip |
| 1185–1232 | Springs, cathode timing, atoms | Motion |
| 1233–1369 | Parameters, element registry, pane width rule, state sync, change targets | Top bar wiring |
| 1370–1464 | Change notifications (now hidden; kept for reference) | Multiplayer |
| 1465–1667 | Input wiring for panes and dials; telegraphs and the order flag | Top bar wiring |
| 1668–1727 | Simulated remote players and tuning (study-only) | Skip |
| 1728–2231 | Sidebar wiring: brush screen, radios, checkboxes, sliders, keycaps, comboboxes, swatches, press surge, sharing split, player tints | Sidebar wiring |
| 2232–2676 | Gates, light shift CRT, layers, timing, gravity scope | Sidebar wiring |
| 2677–2805 | Drawers, idle easter egg, closed-drawer lamp, room drawer | Sidebar shell |
| 2806–2864 | Filigree ornaments as small SVGs | Ornament |
| 2865–3288 | WebGL console glass: shaders, uniforms, draw and frame loop | Console glass |

Two things in the study are scaffolding, not spec: the dock (rules, tuning sliders, pattern switch) and the simulated remote players. Agents should not port either.

One correction to the token row: the copper tokens (`--cu`, `--cu-hi`, `--cu-lo`) and the hex mesh data URI (`--mesh-dim`) are declared at lines 131–132, inside the dock block. Load those two lines with the token range.

## Agent workstreams

Six workstreams, written as Claude Code agent briefs (`prep/briefs/<id>.md`). A to D can run in parallel; E needs A and B; F runs any time before visual work starts. Every agent writes only into `prep/` unless its brief says otherwise, and every report is Markdown so the next agent can load it cheaply.

Shared preamble for every brief:

> You are preparing the Swirl Together codebase for a style-only reskin. Read `prep/README.md` first. Do not change behaviour, sync, performance, or any selector that JavaScript queries. Read the study only through `design/study-lite.html` and only the line ranges your brief names. When unsure, write the question into your report under Open questions and move on.

**A — App UI inventory.** Load: the app's renderer entry, every stylesheet, and the components or templates for the top bar and both sidebars. Not the simulation or shader code. Do: list every UI surface in the order the user meets it: the top bar controls left to right, then each sidebar section top to bottom. For each control record its id or class, the element and role, its state attributes, the setting key it reads and writes, and whether it syncs. Output: `prep/inventory.md`, one table per surface.

**B — Selector contract.** Load: all renderer JavaScript or TypeScript, plus `prep/inventory.md` once it exists. Do: find every selector, id, class and data attribute that script touches: querySelector, getElementById, classList, dataset, matches, closest, and string-built selectors. Mark each one read (script queries it) or write (script toggles it). Output: `prep/selector-contract.md`. This is the do-not-rename list for the whole refactor.

**C — CSS audit.** Load: every stylesheet and inline style block in the app. Do: report file sizes; every hard-coded colour, font, radius, shadow and transition with its count; `!important` use; specificity hot spots (ids in selectors, deep descendant chains); rules nothing matches; and the media queries in use. Output: `prep/css-audit.md` and `prep/css-values.csv` (value, property, file, line).

**D — Study survey.** Load: `design/study-lite.html`, reading the CSS (lines 8–26, 131–132, 36–106 and 160–560) and the markup, plus the theme doc. Do: catalogue the study's component patterns: what each one is, which states it shows, which ARIA pattern it uses, and which runtime properties it reads (`--i`, `--ga`, `--gc`, `--pc`). Don't extract or rewrite CSS yet; the study is still changing. Skip anything that exists only for the study page: the intro, the dock, the tuning panel and the simulated players. Output: `prep/study-survey.md`.

**E — Mapping.** Load: `prep/inventory.md`, `prep/selector-contract.md`, `prep/study-survey.md`, and the mapping table in this doc. Do: pair each app control with its study component and the hook it will be styled through, and flag any control with no match. Output: `prep/mapping.md`.

**F — Baselines.** Load: the app's run and build scripts and test setup. Do: capture the baselines listed under Baselines and guardrails below, using the app as it is today. Output: `prep/baseline/`, holding screenshots, traces, the axe report and the sync log.

## CSS prep

This is the plan for later, once the study settles. The end state is a stylesheet where the theme arrives as one new layer of tokens and component rules, without touching markup that script depends on.

In the warm-up, agents don't apply these steps. They annotate them: for each step, which files and rules in the local codebase it would touch, roughly how big the change is, and anything that would block it. The output is `prep/css-plan.md`. When the steps do run, each one must render pixel-identical to the baseline and be committed on its own.

### 1. Cascade layers

Declare the layer order once, at the top of the first stylesheet the app loads:

```css
@layer reset, tokens, legacy, theme, overrides;
```

Move all existing app CSS into `@layer legacy` unchanged. Unlayered CSS beats every layer, so check for third-party or injected styles that were relying on losing to app CSS. List any you find in the audit rather than fixing them silently. The theme lands in `@layer theme` later and wins over legacy without specificity fights. `overrides` stays empty for now; it is for forced-colours and reduced-motion rules that must win over everything.

### 2. Semantic tokens with today's values

Replace hard-coded values in legacy with custom properties named by role, holding today's values, so nothing changes on screen. Use `prep/css-values.csv` from the audit as the worklist. Name by role, not by colour, because the theme swaps the values:

| Token | Role |
|---|---|
| `--ui-surface`, `--ui-surface-raised` | Bar and sidebar backgrounds |
| `--ui-text`, `--ui-text-muted`, `--ui-label` | Body, secondary and engraved label text |
| `--ui-accent`, `--ui-accent-strong` | Active state; today's orange, tomorrow's copper and lit cathode |
| `--ui-info` | Values and readouts; tomorrow's VFD teal |
| `--ui-danger` | Clear and destructive actions |
| `--ui-focus` | Focus ring |
| `--ui-radius-sm`, `--ui-radius-md` | Corners |
| `--ui-control-h` | Control height: 40 px in the bar, 48 px elsewhere in the study |
| `--ui-font-display`, `--ui-font-body`, `--ui-font-mono` | The three families |
| `--ui-ease-local`, `--ui-ease-remote` | Your own changes versus another player's |

Player colours already exist in the app as data. Expose them as `--player-c` on whatever element shows a player's change, so the theme can tint without new script.

### 3. A theme switch for lighter or darker theme

Put `data-theme="classic"` on `<html>`. Scope all theme rules to `[data-theme="walnut-copper"]`. That way a theme switch can ship to allow users to pick and compare stain/unstained wood theme side by side, and be rolled back by changing one attribute. With skeuomorphism we can't assume dark mode is best; people may like a rich dark font on lighter wood. Tones of wood and typography are variable light/dark.

### 4. Styling hooks separate from script hooks

The selector contract from workstream B is the list of hooks script owns. Style through two other kinds of hook instead:

- **ARIA state for state:** `[aria-pressed="true"]`, `[aria-checked="true"]`, `[aria-expanded="true"]`, `[aria-disabled="true"]`. Where today's CSS styles a state through a class that script toggles, keep the class working and add the ARIA-based rule beside it.
- **`data-ui` for component identity:** `data-ui="dial"`, `"telegraph"`, `"pane"`, `"field"`, `"keycap"`, `"tube"`, `"lamp"`, `"drawer"`. Adding an attribute to markup is allowed in prep, because no script reads it.

### 5. Runtime custom properties

The theme's cathodes read four properties per control: `--i` (brightness, 0 to 1), `--ga` (another player's glow, 0 to 1), `--gc` (glow colour as r g b) and `--pc` (player colour). Prep does not write them. Instead, workstream A notes for each control the existing code path that already runs when its state changes, so the theme can set these properties there. No new loops and no per-frame writes for controls whose state hasn't changed.

### 6. Assets and fonts

- **Fonts:** Michroma, Libre Franklin and Share Tech Mono go into the app bundle as local woff2 files with `@font-face` declarations. The study loads them from Google Fonts; the Steam build must work offline.
- **Texture:** the herringbone ships as one 2048 px JPEG under `assets/`, referenced by URL, not inlined as a data URI. Parquet is retired; do not bundle it.

### Must not change during prep

- Layout box sizes, gaps and order.
- Stacking order over the simulation canvas, and pointer-events on overlays.
- Existing `prefers-reduced-motion` and `forced-colors` rules. Move them into `overrides` intact.
- Any selector on the contract list.

## Component mapping

The starting map for workstream E. App controls are named as they appear in the shipping UI; agents fill in the app selector column from the inventory. Study lines are for version 18. (The prototype reference rows were not included in this export because they will change.)

**Top bar, left to right.** The cathode panes, dial rings and filigree in the top bar are drawn by the WebGL console glass (lines 2865–3288), not CSS. Prep only maps them. The console glass is its own later task, inside the simulation's WebGL context.

**Sidebars.** Shared shell for all drawers: the cabinet and drawer fronts (CSS 414–453, script 2677–2715), including single-open with Shift-click, the closed-drawer lamp for incoming changes, and the idle easter egg.

## Baselines and guardrails

Workstream F captures these from the app as it ships today, before any CSS moves. Every later step is checked against them, and each check should be a script in the repo, not a manual step, so agents can run it themselves.

| Baseline | How | Gate for later steps |
|---|---|---|
| Screenshots | Driving the Electron build or the web build, at 1366, 1440, 1920 and 2560 px wide. One image each for the top bar, every drawer open, and the key states: pressed, checked, expanded, focused, disabled. | Prep steps: zero pixel diff. Theme steps: reviewed by Gabriel. |
| Frame time | A 60-second performance trace with the simulation running, idle and while dragging a top bar control. Record median and 95th-percentile frame times, and long tasks. | No regression beyond run-to-run noise. Record the noise from three runs. |
| Layout and paint | The same trace: count of forced layouts and style recalculations per frame. | No new forced layouts per frame. |
| Accessibility | axe-core over every surface, plus a hand-written list of each control's role, name, state and keyboard pattern, taken from the inventory. | No new axe violations; every row of the list still true. |
| Keyboard | A script that tabs through the whole UI and records focus order. | Identical order. |
| Sync | Two clients in one PartyKit room. Script a fixed sequence of changes on one and log what the other receives. | Identical message log. |
| Bundle | Size of the renderer CSS, fonts and assets. | Reported, not gated. Fonts and the texture add to it by design. |

The study's own checks are worth copying into the repo: the jsdom smoke tests that drive controls and read back ARIA state, and running glslangValidator over the shader strings. Both run in seconds.

## Definition of ready and open items

There are two gates. The warm-up ends when the reports exist. The CSS steps start only once the study has settled.

**Warm-up done**

- [ ] `prep/inventory.md`, `prep/selector-contract.md`, `prep/css-audit.md`, `prep/study-survey.md` and `prep/mapping.md` exist, and Gabriel has reviewed them.
- [ ] `prep/css-plan.md` annotates every CSS prep step against the local codebase.
- [ ] Every baseline in `prep/baseline/` is captured, and its check runs from a script.
- [ ] No files outside `prep/` and `design/` have changed.

**Ready for the CSS steps**

- [ ] The study is final, and this doc's study map has been regenerated for that version.
- [ ] Every open item below has an answer.
- [ ] Gabriel has approved the CSS plan.

**Open items for Gabriel**

| Item | Status | Where it came from |
|---|---|---|
| Square button by Ignite | Decided: it locks Ignite on. Ignite itself is held, not clicked; holding is shared and shows the holder's glow. | Top bar |
| Material type slider | Decided: a slider sits under Material type. Its label follows the preset: Vorticity for Fluid, Wetness for Paint (Wet), Thickness for Paint (Thick). Its range and logic come from the app; the study only stands in for them. | Top bar |
| Change notifications | Decided: they appear in the Swirl Together drawer. | Top bar |
| Name indicator | Decided: the player name chip sits beside the control, or above it in the sidebar, never over it. | Multiplayer |
| Atom spin | Being solved in a yin/yang swirl chat. | Top bar |
| No-WebGL fallback | Open: does the app need the flat fallback if the simulation already requires WebGL2? Deferred to Claude; answered in `prep/OPEN-ITEMS.md`. | Console glass |

## Hand-off order

1. Run A, B, C and D in parallel, each in its own context. All four are read-only.
2. Run E once A, B and D are done.
3. Run F at any time; it captures the current UI as it is.
4. Have one agent write `prep/css-plan.md` from C, E and the CSS prep section.
5. Stop there. After the remaining UX tweaks, regenerate the study map, then carry out the CSS steps one at a time, each in a fresh agent, with the screenshot diff as the gate.

---

# Session notes (Claude, 2026-10-17)

Everything below is what this session learned about the codebase before handing out the briefs, and where it departs from the plan above. Agents: read this section before your brief.

## Status at the start of the warm-up

- The starter kit arrived mid-session (study **version 19**, 3,332 lines, 2.19 MB). Saved as `design/walnut-copper-study.html`; the texture-stripped copy is `design/study-lite.html` (3,330 lines; identical to the `awk` output; **its line numbers after 1198 are 2 lower** than the full file's). The long lines in the full file are **1199 and 1200** in v19 (not 1183–1184 as in the v18 map above). The theme doc is `design/walnut-copper-theme.md`; the kit's own README is `design/KIT-README.md`; the kit's copy of this planning doc, with the **v19 study map (authoritative for line numbers)**, is `prep/README.kit.md`. Textures are under `design/textures/` (herringbone-2048.jpg, parquet-diagonal.jpg); CSS prep step 6 moves what ships to `assets/` later.
- Workstream D is unblocked. Use the v19 ranges from `prep/README.kit.md`: tokens 8–26 and 134–138, top bar base 36–110, sidebar components 164–417, cabinet 418–474, top bar specifics 475–574, top bar markup 577–641, sidebar markup 642–1108 (left cabinet 652: Brush 653, Multi-brush 726, Input 763; right cabinet 814: Swirl Together 815 … Settings 1098), motion 1201–1248, wiring 1249–2843, ornaments 2844–2902, console glass 2903–3332.
- Gabriel's hand-off notes (2026-10-17): **functionality 1:1, feature parity first**; the kit is reference, not prescriptive; the top nav, Swirl Together, Multi-brush and Colors-and-palettes components are close to what is wanted, the rest is direction; **herringbone for the sidebar background, parquet for the section headers, no nub on the right of the header**; the colour-shift location in the reference images is wrong; the existing information architecture stays. The study settings behind the reference shots and the parity questions this session found in the theme doc are in `prep/work/open-items/claude-session.md` (consolidated into `prep/OPEN-ITEMS.md` at the end).
- The **yin-yang filigree glyph replaces the atom motif** (Gabriel's hand-off, 2026-10-17): `design/yin-yang-filigree/` holds `yin-yang-filigree.svg` (the one to use: `currentColor`, 100-unit viewBox, 0.7 px non-scaling stroke), a fill-only variant for 160 px and up, PNG fallbacks at 48/64/104/256, `CREDITS.txt` (Vecteezy attribution, licence not yet confirmed; section 7 for `THIRD-PARTY-NOTICES.txt` later, outside prep) and `reference/` (the atom knob it replaces, a size sweep). Designed for 64–120 px, best at ~104 px on a 120 px face, noise below 40 px. The study's 14 px divider atoms and dial-hub atoms must be re-planned at that size constraint; the "Atom spin" open item is answered by this glyph (it may turn with a dial's value).
- The working tree is clean apart from one untracked PNG under `steam/library-assets/`. HEAD is `c4796da` on `main`. Nothing in this phase is committed; Gabriel reviews `prep/` and `design/` first.

## How the UI is built (orientation)

- `index.html` holds the **static markup** (`.controls`, `#canvas-area`, panels, modals, the F1 `#hotkeyOverlay`, the PhotoSafe `#photoWarn` dialog with its own inline `<style>` at lines 249–301). It is 132 KB.
- `js/20-mixer-layout.js` (9,400 lines, 474 KB) **re-parents** those nodes at boot into the shipping layout: `#mixer-strip` (top bar: eight faders built by `faderChannel`, the colour channel, and a `.mixer-stack` holding Presets over Clear/Pause/Stop), `#sidebar-left` (`buildLeftSidebar`: Brush Size fader + Stabilization in `.lsb-head`, then the Brush, Multi-Brush and Stroke sections, with a `.lsb-rail` when folded), `#sidebar-right` (`buildSidebar`: Swirl Together, Simulation, Colors, Layers, Mutation, Effects, Animations, Audio, Kaleidoscope, Text, Focus, Display, Export, Settings, then the quality underbar), all inside `#main-area` around `#canvas-area`. Sections are made by `makeSection` (`.sidebar-section` > `.section-header` > `.section-title[role=button][aria-expanded]` + `.section-body`), grouped by `data-group` core/expressive/system, accordion single-open with Shift for additive. Many controls are created in JS with `className` / `innerHTML` templates, so **class names that CSS depends on live in JS as well as HTML**.
- Stylesheets load in this order from `index.html`: `css/00-tokens.css`, `01-buttons.css`, `styles.css`, `slider-styles.css`, `mask-editor.css`, `light-source.css`, `20-mixer-strip.css`, `21-sidebar.css`, `22-overlays.css`, `23-colour-picker.css`, `24-palette-from-image.css`, `init-responsive.css` (12 files, ~367 KB), then the inline `#photoWarn` block. `js/00a-boot.js` runs before the stylesheets.
- **Three stylesheets are injected from JS** and are unlayered: the boot cursor rule (`js/00a-boot.js:366`, `#boot-cursor-style`, removed after boot), the file-drop hover outline (`js/32-file-drop.js:76`, uses `!important`), and the SAM modal keyframes (`js/16-sam-integration.js:266`, `#samModalStyles`). `js/47-pen-window.js` writes a whole `<style>` into the pen window document (a separate window). Cascade-layer step 1 must list these: once app CSS is layered, any unlayered sheet beats it.
- Scaling: JS computes `--ui-scale` on `documentElement` (`js/20:181`, on resize and DPR change only; 1.0 up to 1600 px wide, ramping to 1.8 at 3840) and CSS applies `zoom: var(--ui-scale)` in `css/init-responsive.css`. Baselines at 1920 and 2560 wide are therefore zoomed. Other root writes: `--app-height` (`js/01-config.js:1557`) and `--sidebar-width` (`js/20:227`). Nothing writes `:root` properties per frame today; `js/37-nav-idle-glow.js` was measured and kept off `#sidebar-right` for that reason.
- `data-ui-key` (and `data-ui-label`) on strip cells and sections is **read by script** (`js/43-ui-visibility.js` show/hide, `js/46-strip-more.js` More-panel parking, `js/49-hotkey-binds.js`). It is a contract attribute, not a free styling hook; the CSS prep's `data-ui` attribute is a different name and must stay different.
- Section collapse state persists by **section title text** (settingsManager), so titles are also a soft contract.
- `window.auditButtons()` (`js/38-button-audit.js`) is an existing **style-contract gate**: it walks live stylesheets and reports any rule outside `css/01-buttons.css` that colours a button (exempting `.btn--destructive`, `.btn--record`, `#photoWarn`). The theme layer will have to be sanctioned there; the CSS plan must say how.
- ARIA today: `aria-pressed` (24 writes in JS), `aria-expanded` (33), `aria-label` (73), `aria-checked` (6), `aria-disabled` (2); CSS already styles `[aria-pressed="true"]` (6 rules), `[aria-expanded="true"]` (2), `[aria-disabled="true"]` (2), `[aria-checked="true"]` (1). Three `prefers-reduced-motion` blocks exist (`styles.css:1391` global, `01-buttons.css:418`, `22-overlays.css:2119`); **no `forced-colors` rules exist**. `!important` appears 77 times (48 in `22-overlays.css`).
- Rough CSS numbers for sizing the audit: 972 colour literals (341 unique), 95 custom properties declared, `var(--sec-h)` / `var(--sec-c)` (per-section hue) are the most used. Media queries: `(pointer: coarse)` ×5, `prefers-reduced-motion` ×3, four `max-width` breakpoints (800/640/600/520).
- Out of scope but present: `phone/` (pad-only PWA with its own `phone.css`), `scripts/copy-sink/index.html`, `interaction-design-concept/`, `Design system breakdown exploration/`. List them, do not audit them.

## Tooling already in the repo (use it, add nothing to package.json)

- **Headless driver:** `scripts/test/radial-menu/driver.js` → `boot()` starts its own static server on the repo root, launches `C:/Program Files/Google/Chrome/Application/chrome.exe --headless=new` with a scratch profile that has PhotoSafe, the startup fork and the first-run hint already answered, waits for the app, and returns `{ ev, send, click, move, down, up, tap, keyDown, keyUp, shot, close, events }` (CDP over Node 25's global WebSocket). `CHROME=` overrides the browser; `SHOT_DIR=` makes `shot()` write PNGs. Nine UI suites use it (`scripts/test/{radial-menu,focus-keys,skip-menu,bar-keys,dialog-focus,slider-keys,popup-focus,stroke-lock,pen-window}/run.js`).
- **Harness:** `scripts/test/cdp.js` (`connect`, `waitReady`), `scripts/test/harness.js` (`window.__test`: virtual clock `freeze()/step()/thaw()`, `seed()`, hashes, synthetic strokes), `scripts/test/stage.js` (`__stage()` pinned state), `scripts/test/perf-harness.js` (`window.__perf` real-clock frame instrument). Read `scripts/test/README.md` and `GUIDANCE.md` §2b (**never call an app setter that persists**; drive `config.*` or dispatch events on the real inputs; the scratch Chrome profile makes this safe for baselines).
- **Inventories, verified against source:** `scripts/test/inventory/params.json` (107 params: id, kind, configKey, min/max/step/def, binding file:line, section, registered), `hotkeys.json` (45 bindings), `features.json` (18 activation recipes), `determinism.json`. `js/01a-param-registry.js` is the SLIDERS/CHECKBOXES/SELECTS registry; `js/09-settings-manager.js` holds persisted keys; `js/06b-mp-look.js` defines what a room shares.
- **Images:** `sharp` is in `node_modules` (pixel diffs, PNG decode). No Playwright, no Puppeteer, no axe-core: vendor `axe.min.js` under `prep/baseline/vendor/` (MIT) rather than touching `package.json`.
- **Local relay for the sync baseline:** `npx wrangler dev --port 8787 --ip 127.0.0.1` (the Cloudflare worker in `party/worker.ts`, what `scripts/test/look-links/run.js` uses via `MP_HOST`) or `npx partykit dev` (port 1999). The app takes the relay from `localStorage.fluidMultiplayerHost` or `window.PARTYKIT_HOST` (`js/06a-mp-core.js:60-70`). Globals like `partySocket`, `currentRoom`, `connectedClients` are bare lexical bindings readable from `Runtime.evaluate`.
- Node v25.9.0; Electron 39 at `node_modules/electron/dist/electron.exe` (the Electron window defaults to 1400×900 and adds `#custom-titlebar`). Baselines use the web build in headless Chrome; the Electron build differs only by the titlebar and window fade, noted in the baseline README.

## Where this session departs from the plan above, and why

1. **A starts from the live DOM, not from reading 9,400 lines of js/20.** A script (`prep/scripts/dom-dump.js`) boots the app headless, opens every section, and dumps every interactive element with its surface, order, id, classes, role, accessible name (CDP Accessibility domain), ARIA state and labels. Inventory agents annotate that dump with setting key, sync and the state-change code path from the registry, `params.json` and the bindings. A critic then diffs the finished inventory against the dump so nothing is missed.
2. **B includes markup that script creates, not only selectors it queries.** `className = '…'`, `innerHTML` templates, `createElement` + `id` assignments and `setAttribute('data-…')` are "write" hooks CSS depends on. Test scripts under `scripts/test/` and the bake scripts are listed in a second tier (they are not shipped, but renaming breaks the gates). `data-ui-key` is on the contract.
3. **C is a script, not a reading exercise.** `prep/scripts/css-audit.js` tokenises every stylesheet, the inline block, the three injected blocks and inline `style=""` attributes, and writes `prep/css-values.csv` deterministically so it can be re-run after each CSS step. "Rules nothing matches" is measured in the live headless app across states (boot, every section open, the main overlays open) and reported as unmatched-in-the-states-tried, with that caveat.
4. **F uses the repo's CDP driver instead of Playwright**, adds no dependency, and runs the existing UI suites once as part of the baseline. Screenshots are taken with the simulation frozen through the harness and the canvas cleared, so the pixel gate has a deterministic canvas under the UI. The performance trace runs alone (no other Chrome open) and three times for noise.
5. **D waits for the study file; E ships its app half now.** `prep/mapping.md` classifies each control into the `data-ui` vocabulary (dial, telegraph, pane, field, keycap, tube, lamp, drawer) and flags controls with no clear kind; the study component and line columns are filled when D runs.
6. **One more report:** `prep/ui-map.md`, a one-page orientation (how the UI is built, load order, surfaces) so later agents do not re-derive it.

## Rules for agents in this repo

- Write only under `prep/`. Do not edit `package.json`, do not `npm install`, do not touch `.gitignore`, do not commit. Scratch files go in `prep/work/` (kept) or the OS temp dir (not the repo root).
- One headless Chrome per agent, through the driver; always `close()` it in a `finally`. Never attach to port 9333 or any running Electron: that is Gabriel's working instrument.
- Never call an app setter that persists (GUIDANCE.md §2b). The scratch profile protects his settings, but the habit matters for the later steps.
- Report, don't decide: open questions and anything that would need a behaviour change go under "Open questions" / "Open items" in your report.
- Prefer file:line references to prose, tables to paragraphs, and say what you did not cover.

## Layout of `prep/`

```
prep/README.md                  this file
prep/briefs/                    one brief per workstream (A, B, C, D, E, F, G)
prep/scripts/                   dom-dump.js, css-audit.js, study-map.js, check scripts
prep/work/                      intermediate JSON/MD parts the merge agents consume
prep/inventory.md  prep/ui-map.md  prep/selector-contract.md (+ .json)
prep/css-audit.md  prep/css-values.csv  prep/css-plan.md  prep/mapping.md
prep/study-survey.md            when the study arrives
prep/baseline/                  README.md, screenshots/, perf/, a11y/, keyboard/, sync/, bundle/, suites/, dom/, vendor/
prep/OPEN-ITEMS.md              everything agents flagged for Gabriel, collected
```
