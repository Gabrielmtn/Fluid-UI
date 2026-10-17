# Walnut & Copper Refactor Prep

2026-10-17 · @Gabriel

## Purpose and ground rules

This doc gets the codebase and your agents ready for the Walnut & Copper reskin. It covers what each agent loads into its context, what it inventories, and how the CSS is restructured so the theme can land later as a style-only change. The look itself is specified in the **Walnut & Copper Theme** doc; this doc does not restate it. Where the two differ, the theme doc wins on appearance and this doc wins on process.

**Th****is phase is a warm-up, and it is read-only.** Agents load the local codebase, the current black UI, into their context, learn it, and write reports into `prep/`. They change no code and commit nothing outside `prep/`. The study is not final either: a few more UX and interaction tweaks are coming, on the same general set of features. So anything taken from the study is direction, not spec, and its line numbers will move. The CSS steps further down are the plan agents will carry out later; in this phase they only annotate it against the codebase.

Rules every agent works under:

- **Behaviour is frozen.** No change to what any control does, its value range, step, default, keyboard handling, event order or timing. Telegraphs, dials and drawers in the study are presentation for existing controls, not new behaviour.
- **Sync is frozen.** No change to what syncs over PartyKit, message shapes, throttling or merge rules. The left brush sidebar stays personal; everything else stays shared, exactly as today.
- **Performance is frozen.** The simulation's frame budget is the ceiling. Plan to make the best and most performant choices to achieve the aesthetic with no new per-frame layout reads that might cause slowdowns, no new WebGL contexts, no new animation loops. The console glass pass, when it comes, runs inside the simulation's existing context.
- **Selectors JavaScript depends on do not move.** Any class, id or data attribute that script queries or toggles keeps its name and meaning. Styling hooks are added beside them, never in place of them.
- **Accessibility only goes up.** Roles, names, states, focus order and live-region behaviour stay at least as good as the baseline captured in prep.
- **Report, don't decide.** If a task finds something that would need a behaviour change to style cleanly, it goes on the open items list for Gabriel, not into code.

## Map of the study file

I can give you a preview of what's coming, but the goal of this prompt is prep, and this file is subject to change as a reference tool for you, but it's coming soon: the reference implementation is the Walnut & Copper study, a single HTML file of about 2.19 MB and 3,332 lines (version 19). Save a copy into the repo as `design/walnut-copper-study.html` so every agent reads the same version. Line numbers below are for version 19, counted in the full file; if the study is republished, regenerate this map before handing out tasks.

**Never load lines 1199 and 1200.** They hold the herringbone and parquet textures as base64 data URIs, 1.1 MB and 0.8 MB, each on a single line. One accidental read fills an agent's context with noise. Agents should read the file by range, or work from a stripped copy:

```

```

The stripped copy loses the textures but keeps every rule, element and line of script. It is two lines shorter, so its line numbers after 1198 are 2 lower than those below.

| Lines | What it holds | Load for |
|---|---|---|
| 8–26 | Tokens on `:root`: room, ink, muted, engrave, lit and unlit cathode, VFD teal, focus, rule, player colours, the three font families | Tokens |
| 134–138 | Copper tokens and the three mesh data URIs (dim, lit, VFD); they sit inside the dock block | Tokens |
| 36–110 | Top bar base: `.console`, labels, cathode panes (`.cap`), dials, slider tracks, player chips (beside-the-control variant at 96–99) | Top bar |
| 111–163 | Dock styles (study only), apart from the tokens above | Skip |
| 164–417 | Sidebar components: panes, indicators, fields, keycaps, bargraph sliders, brush screen, multi-brush, gates, CRT, lamps, text fields, layers, timing, gravity scope | Sidebar components |
| 418–474 | Cabinet and drawer fronts, room drawer, nixies | Sidebar shell |
| 475–574 | Top bar specifics: telegraphs (484–503, including curved labels, nixies and flag), change log in the drawer (492–494), material slider (495–497), fields, Ignite and lock, full-width layout (521–560), lit-label halo (562), idle easter egg (564–566) | Top bar |
| 577–641 | Top bar markup, in shipping order | Top bar |
| 642–1108 | Sidebar markup. Left cabinet at 652: Brush 653, Multi-brush 726, Input 763. Right cabinet at 814: Swirl Together 815 (with the change log), Simulation 846, Colors and palettes 865, Layers 898, Mutate shader 972, Effects 982, Animations 992, Audio 1002, Kaleidoscope 1048, Text 1058, Focus 1068, Display 1078, Export 1088, Settings 1098 | Sidebar |
| 1109–1196 | Dock markup (study only) | Skip |
| 1201–1248 | Springs, cathode timing, atoms | Motion |
| 1249–1396 | Parameters (including the material slider labels), element registry, pane width rule, state sync, material swap, change targets | Top bar wiring |
| 1397–1494 | Change log, announcements, player chips | Multiplayer |
| 1495–1711 | Input wiring for panes and dials; held Ignite and its lock (1522); fields and commands (1559); telegraphs, hover preview and the order flag (1567–1711) | Top bar wiring |
| 1712–1772 | Simulated remote players and tuning (study only) | Skip |
| 1773–2276 | Sidebar wiring: brush screen, radios, checkboxes, sliders, keycaps, comboboxes, swatches, press surge, sharing split, player tints | Sidebar wiring |
| 2277–2721 | Gates, light shift CRT, layers, timing, gravity scope | Sidebar wiring |
| 2722–2843 | Drawers, idle easter egg, closed-drawer lamp, room drawer, change log empty state | Sidebar shell |
| 2844–2902 | Filigree ornaments as small SVGs | Ornament |
| 2903–3332 | WebGL console glass: shaders, uniforms, draw (3266) and frame loop (3293) | Console glass |

Two things in the study are scaffolding, not spec: the dock (rules, tuning sliders, pattern switch) and the simulated remote players. Agents should not port either. The shader still contains code paths for element types 4 to 8 and the old outer border, which the shipping bar no longer uses.

## Agent workstreams

The following was recommended by the other agent, you're tasked with reviewing it and being discerning about what you actually think is the best way this part is just another LLM's best guess, yours will be better as your context window grows, so take it with a grain of salt:  
  
Six workstreams, written as Claude Code agent briefs. Paste a brief as the agent's task, or save each as `prep/briefs/<id>.md` and point the agent at it. A to D can run in parallel; E needs A and B; F runs any time before visual work starts. Every agent writes only into `prep/` unless its brief says otherwise, and every report is Markdown so the next agent can load it cheaply.

Shared preamble for every brief:

> You are preparing the Swirl Together codebase for a style-only reskin. Read `prep/README.md` (this doc, exported) first. Do not change behaviour, sync, performance, or any selector that JavaScript queries. Read the study only through `design/study-lite.html` and only the line ranges your brief names. When unsure, write the question into your report under **Open questions** and move on.

### A — App UI inventory

**Load:** the app's renderer entry, every stylesheet, and the components or templates for the top bar and both sidebars. Not the simulation or shader code.

**Do:** list every UI surface in the order the user meets it: the top bar controls left to right, then each sidebar section top to bottom. For each control record its id or class, the element and role, its state attributes, the setting key it reads and writes, and whether it syncs.

**Output:** `prep/inventory.md`, one table per surface.

### B — Selector contract

**Load:** all renderer JavaScript or TypeScript, plus `prep/inventory.md` once it exists.

**Do:** find every selector, id, class and data attribute that script touches: `querySelector`, `getElementById`, `classList`, `dataset`, `matches`, `closest`, and string-built selectors. Mark each one _read_ (script queries it) or _write_ (script toggles it).

**Output:** `prep/selector-contract.md`. This is the do-not-rename list for the whole refactor.

### C — CSS audit

**Load:** every stylesheet and inline style block in the app.

**Do:** report file sizes; every hard-coded colour, font, radius, shadow and transition with its count; `!important` use; specificity hot spots (ids in selectors, deep descendant chains); rules nothing matches; and the media queries in use.

**Output:** `prep/css-audit.md` and `prep/css-values.csv` (value, property, file, line).

### D — Study survey

**Load:** `design/study-lite.html`, reading the CSS (lines 8–26, 134–138, 36–110 and 164–574) and the markup, plus the theme doc.

**Do:** catalogue the study's component patterns: what each one is, which states it shows, which ARIA pattern it uses, and which runtime properties it reads (`--i`, `--ga`, `--gc`, `--pc`). Don't extract or rewrite CSS yet; the study is still changing. Skip anything that exists only for the study page: the intro, the dock, the tuning panel and the simulated players.

**Output:** `prep/study-survey.md`.

### E — Mapping

**Load:** `prep/inventory.md`, `prep/selector-contract.md`, `prep/``study-survey.md`, and the mapping table in this doc.

**Do:** pair each app control with its study component and the hook it will be styled through, and flag any control with no match.

**Output:** `prep/mapping.md`.

### F — Baselines

**Load:** the app's run and build scripts and test setup.

**Do:** capture the baselines listed under _Baselines and guardrails_ below, using the app as it is today.

**Output:** `prep/baseline/`, holding screenshots, traces, the axe report and the sync log.

## CSS prep

This is the plan for later, once the study settles. The end state is a stylesheet where the theme arrives as one new layer of tokens and component rules, without touching markup that script depends on.

**In the warm-up, agents don't apply these steps.** They annotate them: for each step, which files and rules in the local codebase it would touch, roughly how big the change is, and anything that would block it. The output is `prep/css-plan.md`. When the steps do run, each one must render pixel-identical to the baseline and be committed on its own.

### 1. Cascade layers

Declare the layer order once, at the top of the first stylesheet the app loads:

```css

```

Move all existing app CSS into `@layer legacy` unchanged. Unlayered CSS beats every layer, so check for third-party or injected styles that were relying on losing to app CSS. List any you find in the audit rather than fixing them silently. The theme lands in `@layer theme` later and wins over legacy without specificity fights. `overrides` stays empty for now; it is for forced-colours and reduced-motion rules that must win over everything.

### 2. Semantic tokens with today's values

Replace hard-coded values in `legacy` with custom properties named by role, holding **today's** values, so nothing changes on screen. Use `prep/css-values.csv` from the audit as the worklist. Name by role, not by colour, because the theme swaps the values:

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

### 3. A theme switch for lighter or darker theme with tones of wood and typography being variable light/dark

Put `data-theme="classic"` on `<html>`. Scope all theme rules to `[data-theme="walnut-copper"]`. That way a theme switch can ship to allow users to pick and compare stain/unstained wood theme side by side, and be rolled back by changing one attribute. With Skeuomorphism we can't  assume dark mode is best, people may like a rich dark font on lighter wood.  

### 4. Styling hooks separate from script hooks

The selector contract from workstream B is the list of hooks script owns. Style through two other kinds of hook instead:

- **ARIA state** for state: `[aria-pressed="true"]`, `[aria-checked="true"]`, `[aria-expanded="true"]`, `[aria-disabled="true"]`. Where today's CSS styles a state through a class that script toggles, keep the class working and add the ARIA-based rule beside it.
- **`data-ui`** for component identity: `data-ui="dial"`, `"telegraph"`, `"pane"`, `"field"`, `"keycap"`, `"tube"`, `"lamp"`, `"drawer"`. Adding an attribute to markup is allowed in prep, because no script reads it.

### 5. Runtime custom properties

The theme's cathodes read four properties per control: `--i` (brightness, 0 to 1), `--ga` (another player's glow, 0 to 1), `--gc` (glow colour as `r g b`) and `--pc` (player colour). Prep does not write them. Instead, workstream A notes for each control the existing code path that already runs when its state changes, so the theme can set these properties there. No new loops and no per-frame writes for controls whose state hasn't changed.

### 6. Assets and fonts

- **Fonts:** Michroma, Libre Franklin and Share Tech Mono go into the app bundle as local `woff2` files with `@font-face` declarations. The study loads them from Google Fonts; the Steam build must work offline.
- **Texture:** the herringbone ships as one 2048 px JPEG under `assets/`, referenced by URL, not inlined as a data URI. Parquet is retired; do not bundle it.

### Must not change during prep

- Layout box sizes, gaps and order.
- Stacking order over the simulation canvas, and `pointer-events` on overlays.
- Existing `prefers-reduced-motion` and `forced-colors` rules. Move them into `overrides` intact.
- Any selector on the contract list.

## Component mapping

The starting map for workstream E. App controls are named as they appear in the shipping UI; agents fill in the app selector column from the inventory. Study lines are for version 19.

### Prototype Reference (not included because it will change) Top bar, left to right

The cathode panes, dial rings and filigree in the top bar are drawn by the WebGL console glass (lines 2903–3332), not CSS. Prep only maps them. The console glass is its own later task, inside the simulation's WebGL context.

### Sidebars

Shared shell for all drawers: the cabinet and drawer fronts (CSS 418–457, script 2722–2760), including single-open with Shift-click, the closed-drawer lamp for incoming changes, and the idle easter egg.

## Baselines and guardrails

Workstream F captures these from the app as it ships today, before any CSS moves. Every later step is checked against them, and each check should be a script in the repo, not a manual step, so agents can run it themselves.

| Baseline | How | Gate for later steps |
|---|---|---|
| Screenshots | Playwright, driving the Electron build or the web build, at 1366, 1440, 1920 and 2560 px wide. One image each for the top bar, every drawer open, and the key states: pressed, checked, expanded, focused, disabled. | Prep steps: zero pixel diff. Theme steps: reviewed by Gabriel. |
| Frame time | A 60-second performance trace with the simulation running, idle and while dragging a top bar control. Record median and 95th-percentile frame times, and long tasks. | No regression beyond run-to-run noise. Record the noise from three runs. |
| Layout and paint | The same trace: count of forced layouts and style recalculations per frame. | No new forced layouts per frame. |
| Accessibility | axe-core over every surface, plus a hand-written list of each control's role, name, state and keyboard pattern, taken from the inventory. | No new axe violations; every row of the list still true. |
| Keyboard | A script that tabs through the whole UI and records focus order. | Identical order. |
| Sync | Two clients in one PartyKit room. Script a fixed sequence of changes on one and log what the other receives. | Identical message log. |
| Bundle | Size of the renderer CSS, fonts and assets. | Reported, not gated. Fonts and the texture add to it by design. |

The study's own checks are worth copying into the repo: the jsdom smoke tests that drive controls and read back ARIA state, and running `glslangValidator` over the shader strings. Both run in seconds.

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

### Open items for Gabriel

| Item | Status | Where it came from |
|---|---|---|
| Square button by Ignite | **Decided:** it locks Ignite on. Ignite itself is held, not clicked; holding is shared and shows the holder's glow. | Top bar |
| Material type slider | **Decided:** a slider sits under Material type. Its label follows the preset: Vorticity for Fluid, Wetness for Paint (Wet), Thickness for Paint (Thick). Its range and logic come from the app; the study only stands in for them. | Top bar |
| Change notifications | **Decided:** they appear in the Swirl Together drawer. | Top bar |
| Name indicator | **Decided:** the player name chip sits beside the control, or above it in the sidebar, never over it. | Multiplayer |
| Atom spin | Atom spin is being solved in a yin/yang swirl chat I'm having with claude | Top bar |
| No-WebGL fallback | Open: does the app need the flat fallback if the simulation already requires WebGL2?  Answer: I don't know we'll defer to claude | Console glass |
|   |  |  |
|   |  |   |

### Hand-off order for Claude Code

1. Run A, B, C and D in parallel, each in its own context. All four are read-only.
2. Run E once A, B and D are done.
3. Run F at any time; it captures the current UI as it is.
4. Have one agent write `prep/css-plan.md` from C, E and the CSS prep section.
5. Stop there. After the remaining UX tweaks, regenerate the study map, then carry out the CSS steps one at a time, each in a fresh agent, with the screenshot diff as the gate.
