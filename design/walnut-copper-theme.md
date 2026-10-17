# Walnut & Copper Theme

2026-10-17 · @Gabriel

## Scope: a reskin, nothing else

Walnut & Copper changes how Swirl Together looks and how its existing interactions move. It does not change what any control does, what syncs, when it syncs, or how fast the app runs.

Treat these as hard limits for every change made under this spec:

- **Behaviour stays.** Every control keeps its current values, ranges, defaults, step sizes, keyboard handling and side effects. A slider that sets viscosity still sets viscosity, at the same moment, with the same value.
- **Data and sync stay.** No new fields, messages or rooms. The PartyKit protocol, what counts as shared and what stays personal, and message rates are unchanged. Inbound styling reads events the client already receives.
- **Layout order stays.** Sections, their order in the sidebar and the controls inside them are kept. The only structural change is presentation: panels become drawers, nested boxes flatten, banks share widths.
- **Performance budgets stay.** The fluid simulation keeps its frame budget. Theme work must not add a second WebGL context, per-frame layout reads, or large repaints while the simulation runs (see Implementation notes).
- **Accessibility can only get better.** Every role, label and keyboard path that exists today survives; the reskin adds the ones the study already demonstrates.

The study page (Walnut & Copper Console artifact) is the visual reference. Where this doc and the study disagree, this doc wins on behaviour and the study wins on look.

The top bar's glass (cathode panes, dials, the material slider's tube and their copper wire) ships as the study's WebGL renderer, drawn inside the simulation's existing context. Everything else is CSS, SVG and small 2D canvases. This doc matches study version 19.

## Materials and tokens

Three materials do all the work: wood is the ground, copper is the line, and cathodes carry state. Nothing else gets a border, a fill or a glow.

**Wood.** Herringbone is the only wood. It runs edge to edge under the top bar and fills both sidebars, with no walnut border, frame or second grain anywhere. Alternate slat columns lean opposite ways, so under the fixed light each column catches a different sheen and the field reads as art deco. The diagonal parquet is retired. One seamless 2048 px JPEG, about 0.86 MB and taken from the 16K scan, serves every surface:

- **Top bar:** the console shader samples it with a 679 px tile (a 120 px slat × 8 / √2). It stains it by mixing the albedo toward walnut at 0.72, and adds a narrow per-column sheen from the fixed key light.
- **Sidebars:** a CSS background with a 566 px tile (a 100 px plank × 8 / √2), stained by a translucent `rgba(44, 20, 8, 0.732)` overlay. The overlay is `0.12 + 0.72 × stain` with the stain at 0.85. Never use `background-blend-mode: multiply` on large panels; it repaints badly.

**Copper.** Every line is copper: bezels, dividers, bead rows, the atom, scroll ends, carets, the drawer pull. Copper never fills an area and never carries state on its own.

**Cathodes.** Three glass families, each with a fixed meaning:

| Glass | Colour | Used for |
|---|---|---|
| Neon (nixie) | Glow `rgb(255 110 30)`; lit label `#ffd9b0`; a label on a lit pane is `#fff6e6` over a dark halo | On/off and selection: panes, indicators, tubes, dials, keycaps |
| VFD | Teal `#72f2d4` | Information: readouts, the notification screen, the brush organizer, the gates spectrum |
| Colour CRT | Aperture-grille RGB | Colour itself: the light shift path picker |

Unlit glass always shows its hex anode mesh at about 10% so an off control still reads as a control.

**Tokens.**

| Token | Value | Role |
|---|---|---|
| `--room` / `--room-2` | `#110c09` / `#1a130f` | Page ground behind the panels |
| `--ink` / `--muted` | `#eadccb` / `#a8937c` | Body text and hints |
| `--rule` | `#3a2c22` | Hairlines outside the theme surfaces |
| `--cu` / `--cu-hi` / `--cu-lo` | `#c47a4b` / `#f2b38a` / `#5a2e17` | Copper line, highlight, shadow |
| `--lit` / `--unlit` | `#ffd9b0` / `#a08a76` | Cathode label on / off |
| `--engrave` | `#e7d2b2` | Engraved labels on wood |
| `--vfd` | `#72f2d4` | VFD text and phosphor |
| `--focus` | `#ffb547` | Focus ring, always 2 px with offset |
| `--you` / `--alex` / `--mika` | `#ff8a3d` / `#5ab0ff` / `#c38cff` | Player colours in the study; production assigns from a palette kept clear of VFD teal |
| `--mesh-dim` | SVG data URI, 10 × 17.32 px hex cell | The unlit anode mesh behind glass; --mesh-lit and --mesh-vfd are its orange and teal versions |
| `--f-display` / `--f-body` / `--f-vfd` | Michroma / Libre Franklin / Share Tech Mono | The three families, each with system fallbacks |

The tokens are declared on `:root`, except copper and the mesh, which the study declares beside the dock styles (study lines 134–138). Production should keep them all together in the tokens layer.

**Type.** Michroma for engraved labels and pane text (uppercase, 0.12 to 0.26 em tracking). Share Tech Mono for every number, readout and keycap. Libre Franklin for body copy and hints. Values are always tabular.

## Layout

Both sidebars become cabinets of drawers. The left cabinet keeps the brush sections where they live today (Brush, Multi-brush, Input); the right cabinet holds a drawer per nav section. Each is one herringbone panel with one copper line, and nothing inside draws a second box.

**One container per column.** The cabinet's inner copper line is the only border in the column. Sections inside a drawer have no box; a bead-row divider opens each one, with a 14 px atom resting in a gap in the beads. Sub-groups inside a section (Mask, Collision) use a smaller dotted rule with the label centred. Brush channels, gates, stamps and similar sets live on a screen, never in cards.

**Drawers replace the accordion headers.** Each nav section header (Swirl Together, Simulation, Colors and Palettes, Layers, Mutate Shader, Effects, Animations, Audio, Kaleidoscope, Text, Focus, Display, Export, Settings) becomes a drawer front:

- A 46 px walnut strip with a copper edge, the section name engraved on the left, a small pilot lamp before it and a copper pull bar on the right.
- Badges that exist today (Under construction) sit on the front as small VFD tags; counts (2 layers, 3 gates) sit there as engraved values.
- Opening pulls the drawer out: the front lifts 1 px and gains a deeper shadow, and the tray grows below it on the drawer spring, pushing the drawers beneath down. There is no empty bay; the front itself becomes the tray's lip.
- Closed drawers stack with 6 px between fronts, so a closed cabinet is about 52 px per section.
- One drawer is open at a time in each cabinet. Shift-click opens another without closing the first, exactly as the app does today.

**Top bar.** It runs edge to edge across the window, about 180 px tall, on bare herringbone. It has no title bar, no player list and no outer border, and draws no frame around a group; each control carries its own filigree. The order follows the shipping nav, left to right:

1. **Material type:** a field (Fluid, Paint (Wet), Paint (Thick)), with its paired bargraph slider directly below. The slider is labelled Vorticity, Wetness or Thickness to match the preset.
2. **Viscosity and Isolation:** two cathode dials.
3. **Laminar / Blend and Time:** two engine order telegraphs, side by side.
4. **Density and Velocity:** two cathode dials.
5. **Actions, two rows:** One, Random and Palette (a radio bank) with Limit; then the current-colour lamp, a wide Ignite and the Ignite lock.
6. **Scene, two rows:** Presets as a full-width field; then Clear, Pause and Stop.

The groups spread across the width (`justify-content: space-between`). The three instrument groups grow; Material type is capped at 220 px (160 px at 1700 px and below), and the action and scene groups keep their natural width. At 1700 px and below, padding and tracking tighten, dials drop from 76 to 68 px and telegraphs from 124 to 112 px. At 1430 px and below the bar wraps, and wrapped rows centre. The change log no longer lives in the top bar; it moved to the Swirl Together drawer.

**Modules and spacing.**

| Tier | Height | Width module | Label | Where |
|---|---|---|---|---|
| Top bar | 40 px | 24 px, minimum 48; banks share widths | 10.5 px, 0.16 em tracking (0.12 em at 1700 px and below) | Panes, fields, the slider track |
| Main | 48 px | 24 px, minimum 48 | 10.5 px | Sidebar panes (`.cp`) |
| Compact | 32 px | 16 px, minimum 32 | 9 px, 0.12 em tracking | Sidebar `.cp.sm`, layer rows |
| Drawer front | 46 px | Full column | 11 px, 0.22 em tracking | Every drawer |

- A pane's width is its label plus padding, rounded up to its module. Panes in a bank share the widest member's width; a primary action fills its row.
- 8 px between panes in a bank, 10 px between groups, 6 px between drawer fronts.
- Labels sit directly above their control: a slider's value line overlaps the tube's marker space by 9 px rather than adding a gap.
- Everything inside a drawer shrinks to the column: rows wrap, four-way strips tighten their tracking, nothing is allowed a minimum width wider than the sidebar.

## Components

Every control in the app maps onto one of these families. Each keeps its current element, role and behaviour; only its skin changes.

| Family | Replaces | Look | States |
|---|---|---|---|
| Cathode pane | Buttons, toggles, chips | Smoked glass, copper bezel, hex mesh; the label is the glyph | Unlit, lit, pressed surge, other player's colour |
| Radio and checkbox panes | Radio groups, checkboxes | A pane with a cathode indicator in the first module: round for radio, square with a check for checkbox | Same as pane; the indicator lights with the label |
| Joined pair | Two-way segmented controls (Stroke / Time, On move / Constant) | One strip, square inner corners, no indicator | One side lit |
| Field | Dropdowns, including Material type and Presets in the top bar | A pane at 60% brightness with a copper chevron cell. Sidebar fields open their options inline below; top-bar fields keep the native select popup | Resting, hover or focus at full brightness, open |
| Text field | Name and code inputs | Glass input with mesh, Share Tech Mono | Unlit, focused (strikes orange), invalid (red bezel) |
| Bargraph tube | Every sidebar slider, and the material slider in the top bar | IN-9 style tube, neon column with a white-hot head, copper diamonds above and below the value | Value, held, other player's colour; stepped sliders add copper detent ticks |
| Cathode dial | Viscosity, Isolation, Density, Velocity | 76 px glass (68 px at 1700 px and below). 21 cathode dots on a 270° arc, a copper hand, and a copper atom at the hub that turns with the value. One soft copper wire at the rim, milgrain beads 9 px outside it, and the glass darkens gently over its outer 14 px. The value sits below in nixie orange, Share Tech Mono 14 px | Value, other player's colour |
| Engine order telegraph | Laminar / Blend and Time | 124 px face (112 px at 1700 px and below). A soft copper bezel with a shadow, dark glass with hex mesh, order sectors over a 240° sweep and a copper A-frame lever. The readouts differ per telegraph; see below | Lever position; lit sectors; another player's colour glowing on the lever while it fades; on Time, a hovered sector's outline brightens |
| Keycap | Key-binding fields | Pane with a second inner copper line | Bound (unlit glyph), listening (breathing), held key (lit) |
| Copper ring | Clear-binding buttons | A copper circle with an × | Hover glow |
| VFD screen | Readouts, notification feed, brush organizer, brush channels | Teal phosphor on dark glass with scanlines | Selected item at full brightness with copper corner brackets |
| Spectrum screen | Gates | Segmented VFD bars, peak hold, decade lines; gates as copper-lidded boxes | Gate idle, gate firing (amber), other player's colour |
| Colour CRT | Light shift picker | Aperture-grille colour field; the path glows in the colours it crosses; a beam travels it | Drawing, playing, keyboard cursor |
| Phosphor scope | Gravity direction | Round graticule, dot with afterglow trail | Off, centred, pulled, other player's trace |
| Timing tubes | Timing lanes | One vertical tube per lane in its own phosphor; cues fall to a copper rail | Lane lamp strikes on each hit |
| Pilot lamp | Small status dots, current colour | A round cathode | Off, lit, breathing |
| Nixie tubes | Room and pairing codes | One glass tube per character | Lit only |
| Drawer | Nav section headers | Walnut front, copper pull, engraved name, pilot lamp | Closed, opening, open; lamp flashes a player's colour when something changes inside while closed |
| Ignite and its lock | Ignite and the small square button beside it | A wide cathode pane, and a 40 px square pane with a square glyph | Ignite: unlit, burning while held or locked, the holder's colour. Lock: pressed or not |
| Player chip | The name shown on another player's change | A dark pill outlined and lettered in the player's colour, Michroma 9.5 px. Beside the control in the top bar; above it in the sidebars; never over it | Shown for 1.5 s |

**Engine order telegraphs.** Both keep today's value, range and step; only the face changes. Measurements below are in the face's 140-unit viewBox.

- **Laminar / Blend** has two orders, LAMINAR on the left and BLEND on the right. Their names curve gently along the top of each half: Michroma 11 units on an arc of radius 41.5 spanning 108°, `#cbb59f` when unlit and `#fff0dc` when lit, with a thin dark outline so they hold on a lit wedge. Each half lights in proportion to the value. The face has no title text. The exact value (0.00 to 1.00) shows as three nixie tubes with a glowing decimal point, in the black space below the hub and clear of the inner circle. Each tube is 11.2 × 17.5 units at y 36 to 53.5, with a faint 8 behind the digit as an unlit cathode.
- **Time** keeps its 0.01× to 3× range. Its six orders (STOP, DEAD SLOW, SLOW, HALF, FULL, FLANK) are sectors without ring labels, spaced on a square-root curve so the slow end has room; the current one lights. The value (1.00×) sits just under the hub, Share Tech Mono 15 units. Below it, where an ENGINE TIME title would sit, is a copper-framed slot (83 × 19 units) showing a brass flag engraved with the order name in dark `#24130a` Michroma, up to 10.5 units and shrinking to fit.
- **The flag** shows the current order. Point at a sector on the outer ring (between 44% and 90% of the radius, inside the sweep) and that sector's outline brightens and the flag changes to its name. Move off and it returns. Each change drops the old plate out of the slot, then drops the new one in with a small settle. The flag is visual only: screen readers get the current order through `aria-valuetext`.
- **Keys:** arrows step 0.01 (Shift for 0.1); Page Up and Page Down jump between orders (Laminar: 0 and 1; Time: 0.01×, 0.25×, 0.5×, 1×, 2×, 3×); Home and End go to the ends. Dragging follows the pointer's angle.

**Material slider.** A bargraph tube directly under Material type, its label set by the preset: Vorticity for Fluid, Wetness for Paint (Wet), Thickness for Paint (Thick). The app's existing logic decides its range and what changing the preset does to its value. The study stands in with 0 to 1 and a remembered value per preset. A label change is not a new setting and does not post a notification on its own.

**Ignite.** Ignite is held, not clicked. It burns while you hold it, by pointer or by keeping Space or Enter down, and stops when you let go. The square button beside it locks Ignite on (`aria-pressed`, named “Lock ignite on”) and syncs like any toggle. While another player holds Ignite, it burns in their colour for as long as they hold it.

**Swirl Together room drawer.**

- Not in a room: Start a room and Stranger as two panes side by side, a code field with Join, then Sync phone and Link to current settings.
- In a room: a teal pilot lamp with the sharing line (Sharing settings · 3 here), the room code as nixie tubes, then the change log on a VFD screen (see Multiplayer presentation), then Copy code and Leave.
- Leave is a red-tinted pane. The current ⋯ menu's actions become visible panes, because the drawer has room for them.
- Sync phone opens a pairing code in nixie tubes inline, with a countdown, instead of a separate dialog.

**Layers.** Each row is a disclosure, a glass thumbnail and a name field. Show (checkbox pane) and Delete (red pane) sit on a row of their own under the name. Delete leaves an Undo strip for 6 s and moves focus to it.

## Motion

Motion explains who changed what. Your own actions are fast and a little rough, other players' arrive slower and smoother, and nothing moves unless something changed.

| Event | Motion |
|---|---|
| Your cathode turns on | Exponential rise with a 45 ms time constant, flickering over the first 170 ms |
| Another player's cathode turns on | Exponential rise with a 220 ms time constant in their colour, no flicker; the colour cools back to orange with a 1.4 s time constant |
| A cathode turns off | Exponential afterglow with a 300 ms time constant (450 ms when another player did it) |
| Your press | Brightness surge on a spring, stiffness 600, damping ratio 0.70 |
| Your drag (tube, dial, gate) | Spring 600 / 0.70 |
| Another player's drag | Spring 120 / 0.95, retargeted on every update so a burst reads as one glide |
| Drawer opening or closing | Spring 180 / 0.85: a small overshoot, then the tray settles |
| Atom on a section divider | Sidebar dividers only. It rests; a change in its section eases it into a spin for about 1.1 s, repeated changes extend the spin, and then it settles. The top bar has no spinning atoms; each dial's hub atom turns with its value |
| Notification line | Strikes in, steps down one row per newer line, dims to 62% then 40%, leaves with an afterglow |
| Field options | Open inline on the drawer spring; the chevron turns 180° |
| Ignite | While held or locked, the burn ramps to full in about 170 ms; on release it fades with a 350 ms time constant. The burn drives a dimming flicker (random each frame, 55% to 100% of 0.7) that falls off with distance from Ignite as e^(−d / 220 px). The same falloff applies to pane brightness and to the glass, dials, tube and glow spill, so the buttons around Ignite flicker and the far side of the bar stays still. No flicker under reduced motion |
| Time flag changes | The old plate drops 17 units out of the slot in 110 ms (ease-in); the new one drops in from above over 260 ms, overshooting 1.6 units at 70% before settling. Changes queue while one is moving. Under reduced motion the text swaps in place |
| Player chip | Fades in over 300 ms while sliding 10 px out from the control's edge (500 ms, slight overshoot); stays 1.5 s, then fades |

**Drawer opening, step by step.**

1. The front lifts 1 px and its shadow deepens with the spring.
2. The tray height follows the spring from 0 to its content height, pushing later drawers down.
3. The tray's contents ride 14 px up into place as it opens, so they appear to come out with the drawer.
4. The pilot lamp on the front strikes as it opens and goes dark as it closes.
5. Once settled, the tray's height returns to auto so its contents can grow or shrink freely.

**Reduced motion.** Springs jump to their target, cathodes switch without flicker or afterglow, atoms and the CRT beam stay still, drawers open without travel, Ignite does not flicker, and the Time flag swaps its text in place. Live data (the spectrum, timing cues) still updates, because it is content rather than decoration.

**Light is fixed.** No surface responds to the pointer: no light that follows the cursor, no moving sheen, no hover-driven glare. Lighting is a single fixed key from the upper left. A pointer-following light was tried in the study and left out because it moves content under people who don't expect it and adds noise for low-vision users.

**Idle easter egg stays.** After 20 s with no input, the right cabinet's section names fade into the original nav colour gradient (blue through violet, teal, green and slate) as a soft cathode glow. Any pointer, key or wheel input returns them to engraved copper. Under reduced motion the change is instant rather than a fade.

## Multiplayer presentation

Other players' changes are shown, never hidden and never pushed into your way. All of this reads events the client already gets; nothing new is sent.

**What counts as shared stays exactly as it is today.** The left brush sidebar (Brush, Multi-brush, Input) is personal and never shows another player's hand. Everything else syncs: the top bar and every section in the right cabinet.

**The c****hange log.** It lives in the Swirl Together drawer, on a VFD screen between the room code and Copy code: three lines of Share Tech Mono 12 px on a 21 px pitch, in VFD teal with each player's dot and name in their colour. With nothing to show it reads “Quiet · no changes yet”, or “Offline” outside a room. The top bar has no screen.

1. Only shared settings report; local view state such as opening a drawer never does.
2. Your own changes report too, briefly: they strike fast and leave after 1.8 s. Other players' lines warm up slowly and stay 4.5 s.
3. Newest on top, three lines; older lines step down and dim like cooling tubes; a fourth pushes the oldest off.
4. Changes by the same player to the same setting within 900 ms merge into one line showing where the value started and where it is now.
5. If you are holding a control when someone else changes it, their line reads QUEUED until you let go, then shows their value with AFTER YOU.
6. Joins, leaves and room events read as plain sentences: ALEX › JOINED THE ROOM.

All four timings (lines, your dwell, others' dwell, merge window) are tunable in the study's dock and should ship as constants.

**Inbound changes on controls.**

- The control glows in the player's colour and fades back with a 1.4 s time constant. A chip with their name appears beside it in the top bar, on its right, or on its left within 100 px of the window's right edge, and above it in the sidebars. The chip never sits on the control or its label. Holding Ignite is shared: while anyone holds it, Ignite burns in the holder's colour for the whole hold, their line reads HOLDING IGNITE, and the screen reader hears “Alex is holding Ignite”.
- Tubes tint their neon column and copper diamonds in that colour and glide on the remote spring.
- Gates light their lid in the player's colour and move in short visible steps.
- Gravity draws its afterglow trail in that colour, so you see the path, not just the end point.
- When the section is collapsed, its header takes the indicator instead of the control, because the control can't be seen: the drawer's lamp flashes in the player's colour for a moment. A line still posts, and the drawer never opens on its own.
- Inbound changes never move your focus, close an open field, or change your selection.

**Players.** Each player keeps one colour for the whole session. Player colours must be easy to see: each reaches at least 4.5:1 against the dark glass and 3:1 against the wood, with no dark blues, deep purples or browns. They also stay clear of VFD teal and neon orange, which already carry meaning. The study uses blue `#5ab0ff` and violet `#c38cff` beside your orange; further players draw from light, saturated hues such as gold, pink and lime.

## Accessibility

The skin sits on top of real, native controls. Painted glass, canvases and textures are always `aria-hidden`; the element underneath carries the role, name and state.

| Control | Semantics | Keyboard |
|---|---|---|
| Pane toggle | `button` with `aria-pressed`, or `role=checkbox` with `aria-checked` | Space and Enter |
| Radio bank, joined pair | `role=radiogroup`, `role=radio`, roving `tabindex` | Arrows move and select; grids move by row |
| Field | Select-only combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant` over an inline `listbox` | Arrows, Home, End, Page keys, Enter, Space, Escape, Tab commits |
| Tube, dial | Native range input or `role=slider` with `aria-valuetext` in the displayed units | Arrows, Page keys, Home, End |
| Keycap | `button` whose name states the bound key in words (semicolon, not ;) | Enter to listen, any key to bind, Escape cancels |
| Gate | `button` with `aria-roledescription=gate` and its range and threshold in the name | Arrows move, Shift with arrows resizes, Delete removes |
| CRT path, gravity scope | Group with a role description and a written readout | Arrows move a cursor or the dot, Space adds a point, Home centres |
| Drawer | `h2` containing a `button` with `aria-expanded`; the tray is `inert` and `hidden` when closed | Enter and Space |
| Room code, pairing code | `role=img` named with the characters spaced out | n/a |
| Engine order telegraph | role=slider with aria-labelledby, aria-valuemin/max/now, and aria-valuetext naming the order and value (“Blend, 0.62”; “half, 1.00 times”). The SVG face is aria-hidden | Arrows ±0.01 (Shift ±0.1), Page keys between orders, Home, End |
| Ignite | button; momentary, so no aria-pressed. The lock beside it is a button with aria-pressed, named “Lock ignite on” | Hold Space or Enter to burn, release to stop; key repeat is ignored |
| Material slider | Native range input labelled by its visible label, which changes with the preset; aria-valuetext as displayed | As any range input |

**Contrast.** Unlit labels (`#a08a76` on near-black glass) measure about 5.4:1 and must not drop below 4.5:1. Telegraph order names are brighter, `#cbb59f` unlit and `#fff0dc` lit, each with a thin dark outline. A label on a lit pane, or on Ignite while it burns, turns `#fff6e6` over a dark halo, so it reads against the bright glass; lit glass is also held below full brightness for the same reason. Confirm these at shipping sizes. Lit state never relies on colour alone: brightness, glow and the indicator's shape change together, and the state is in ARIA.

**Focus.** A 2 px `--focus` ring with an offset on everything focusable, never removed. Focus is moved only by the person's own action: Delete moves it to Undo, Leave moves it to Start a room, closing a field returns it to the field.

**Announcements.** One polite live region. Other players' changes are announced at most every 3.5 s, always the newest; your own changes are not announced. Key bindings, gates added or removed, layer removal and room joins and leaves are announced once.

**Forced colours.** Canvas glass is hidden; controls get system borders, and selected states get a `Highlight` outline.

**Reduced motion.** As in Motion: no travel, no flicker, no spinning atoms; data still updates.

## Implementation notes

Ship the sidebars and controls as CSS and small 2D canvases on the existing DOM. The top bar's console glass ships as the study's renderer, drawn inside the fluid simulation's existing WebGL context, so the page still has exactly one context.

| Layer | Technique | Notes |
|---|---|---|
| Wood, copper, panes, tubes, keycaps, drawers, nixies | CSS on existing elements | Custom properties drive state: `--i` brightness (0 to 1), `--ga` another player's glow (0 to 1), `--gc` glow colour as `r g b`, `--pc` the player's colour, `--dp` drawer travel and `--p` tube value. Ignite burning is `[data-burning]`; other states come from ARIA attributes |
| Filigree ornaments, atoms | Inline SVG data URIs, built once | Atom rotation is a CSS transform set only while it spins |
| Spectrum, CRT, scope, timing lanes | One 2D canvas each, sized to the element | Drawn only while their drawer is open and on screen; skip the frame when nothing changed |
| Stamps on screens | Rendered once to small canvases, shown through a CSS mask | Re-render only when the stamp set changes |
| Console glass (top bar) | A second WebGL shader | Ships with the softened lighting, as a separate pass in the simulation's context, scissored to the top bar and redrawn only when a value, cathode, glow or the Ignite burn changes. The study redraws every frame; production must not. The shipping bar uses three of the study's element types: 1 (pane and field), 2 (dial) and 3 (tube). Types 4 (kaleidoscope drawer), 5 (VFD readout), 6 (fascia), 7 (bay) and 8 (group frame) and the outer border ornament are no longer used and can be dropped. Uniforms: element rects, parameters, glows and extras (32 maximum), plus the texture, stain, tile size, the fixed light, the Ignite burn and the Ignite position for its falloff |

**Performance guardrails.**

- One `requestAnimationFrame` loop for all theme animation, paused while the tab is hidden. It writes custom properties; it never reads layout, except for a drawer that is actively moving.
- Elements at rest are left alone: settled springs, unlit cathodes and still atoms cost nothing per frame.
- Wood is one seamless 2048 px herringbone JPEG, loaded once and shared by every surface; the parquet texture does not ship. No `background-blend-mode` on large areas; stain with a translucent overlay.
- No `filter: blur()` or backdrop filters on large or animating areas; glows are box-shadows and text-shadows on small elements.
- Canvas surfaces cap their device pixel ratio at 2 and resize only when their box changes.
- Inbound styling hooks into the existing event handlers; it adds no listeners to the sync layer and no messages.
- Budget check before merge: frame time with all drawers open and two remote players active must match today's within measurement noise.

**Rollout order.** Each step ships alone and changes look only.

1. Tokens, fonts, wood and copper on the existing panels.
2. Panes, indicators, fields, text fields and tubes across every section.
3. The drawer cabinet replacing the accordion headers.
4. Screens: notification feed, brush organizer, brush channels, gates, CRT, scope, timing.
5. Inbound styling and the room drawer.
6. The top bar: the full-width layout, the console glass pass, the four dials, the material slider, the two engine order telegraphs with the Laminar nixies and the Time flag, and held Ignite with its lock.

## Decisions

- **Wood:** herringbone everywhere, laid vertically like the console; the diagonal parquet is retired.
- **Sharing:** the left brush sidebar is personal; the top bar and every right-cabinet section sync. A collapsed section shows inbound changes on its header lamp.
- **Brush home:** Brush, Multi-brush and Input stay in the left sidebar.
- **Drawers:** one open at a time per cabinet; Shift-click opens more without closing others, as today.
- **Player colours:** only easy-to-see hues, kept clear of VFD teal and neon orange.
- **Top bar:** full width, in the shipping nav's order, on bare herringbone. No title bar, players or screen in it, and no outer, inner or group borders; each control carries its own filigree. The console glass renderer ships with softened lighting and softer dial rims.
- **Ignite:** held, not clicked. The square button beside it locks it on. Holding is shared and shows the holder's colour, and the dimming flicker reaches only the buttons around it.
- **Idle easter egg:** the section-name colour gradient stays, now as a cathode glow after 20 s idle.
- **Light:** fixed; nothing follows the pointer.
- Material slider: under Material type, labelled Vorticity, Wetness or Thickness by preset; the app's own logic sets its behaviour.
- Notifications: in the Swirl Together drawer, not the top bar.
- Name chips: beside the control in the top bar and above it in the sidebars, never over it.
- Telegraphs: Laminar / Blend has curved order names and a nixie value under the hub; Time drops its ring labels for a brass order flag in a slot, which previews the hovered order.
