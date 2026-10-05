# Fest projects: the six we stepped around (2026-10-04 to Oct 19)

From the user-test 3 final todo (USERTEST-2026-10-03.md, "What's left"). Gabriel, 2026-10-04: "1-6 can't wait... get them done before Next Fest." Each project had a read-only planning pass first; the plans are below, condensed, with file:line anchors as of 93a60e1.

Sizes: **S** under an hour, **M** an afternoon, **L** a day or more.

## Shipped first (2026-10-04)

- The three loose bundles committed: 28a94a9 (blur grace), 4e0df45 (no stock animations), 4f9ca2f (Record pulse).
- 46 commits pushed (e6f8e0b..4f9ca2f). Web deployed: v=mutr9u15, live check 7/7. Demo rebuilt from 4f9ca2f into `dist/demo`, smoke clean (the two misses also fail on the old build: a stale look-gen expectation and the layout chooser swallowing Tab).
- **Yours:** upload it (Claude's auto mode blocks Steam uploads), then set the new build live on `default`:
  `npm run publish:steam:demo -- GabrielMtn`
- 93a60e1: the copy pass can't unbind hotkeys any more (project 1's blocker).

## Done 2026-10-04 (committed on main, not pushed since 93a60e1)

| Project | What landed | Commits |
|---|---|---|
| 1 Copy | Rewording can't unbind hotkeys; the sprint tool flags the 2 that would | 93a60e1 |
| 2 Audio | Slice 1: a lane's cues fire an action (Splat, Burst, Scatter, Orbit, Spiral, Grid, Next colour, Spin kaleido; every Nth) | dcc4d40 |
| | Slice 2: lanes kept per track (SHA-256 of the file), fire with the chart closed, Save / Open cues | 1e91c03 |
| | Slice 3: Full Audio = the cue editor (select, drag, Delete, double-click, 1-8 taps, undo); the Composer is gone | d9d43bc |
| | Slice 5: the pattern matcher (box a shape, every repeat lights up, Make a lane) | 837b085 |
| | Slice 6: Set up this song (Low / Mid / High, fitted, each doing something); the lanes edited in Full | 8e7bf1b |
| 4 Recording | The four bugs that lose work: Settings Clear keeps animations, Delete asks, the card buttons work, Save says why | 574d7af 5d16cd2 96512ce |
| 5 Palette | Slices 1-3: one palette that saves itself, + New, Rename, Duplicate, Reset, keys in sight | 17c6b65 |
| | Slices 4-5: drag colours and palettes into order, kept by name | dfeac3c |
| 6 Multiplayer | (d) fair per-sender queues: a friend's long line under a 2x flood lost 176 of 720 dabs before, 0 now | 399b4d7 |
| | Slices 1-3: one status line, Invite popover + ⋯ menu, Together / Turns / Call & return switch, Pass only on your turn (mp-panel-e2e 79/79, phone-mouse 77/77) | 79af2b1 b1179cb 1c548fb 6dbda33 |
| 4 Recording | Slices 1, 2, 4: one word per thing (Part, Animation, Video), the record strip replaces Off / Minimized / Full, Keep · Discard, rename, Save writes back | e9e5f51 eabd275 b5d49f6 |
| 2 Audio | Tunnel ring as a lane action; a committed suite, `node scripts/test/audio/run.js` (24/24) | fe0a90b 4b069bd |
| 3 Left sidebar | Slice 1: Brush Size heads a left bar that folds to a rail | 08eed81 |
| | Slice 2: Stroke and replay moves in; sections work in either sidebar | 1d66481 |
| | Slice 3: the brush drawer is the Brush section; saved keys made in it are re-scoped so they can't hit the wrong brush | acd4279 |
| | Slice 4: Multi-Brush is a section (the arm count with everything it governs) | 495eff6 |
| | Slice 6: on a phone it rides in the menu; Simple keeps Brush Size and Brush (slice 5, the fold, came with slice 1) | 9c8fcf5 |

| 4 Recording | Slice 3: the editor's Play / Edit / File groups, a ▶ and ⋯ per part, File ▾ (Open file, Save to file, Start empty) | 97482f0 |
| | Slice 5: Stop and save for video and GIF (keeps what was captured), the VIDEO badge (never in the frames) | c9e9b4f |
| 2 Audio | Snap: a placed cue lands on the hit (Alt places it freely) | c0729fb |

**Built and deployed 2026-10-04:** web v=mutvw09h from c9e9b4f (live check: every new piece present, button audit clean). Demo rebuilt from c9e9b4f into `dist/demo`; its smoke is clean apart from two known test artifacts (a stale look-generation expectation, and the layout chooser swallowing Tab on a fresh profile). **Steam: BuildID 25710408 uploaded and set LIVE on `default` by Gabriel (2026-10-04)**, replacing 25674178 (Oct 2); an 884.9 KB patch. Confirmed in the Steam demo: the left sidebar shows. Known flaky: mp-phone-mouse "as much dye as the same stroke with the mouse" (0.60-0.81 against 0.8; flaky on the old base too).

**What's left after that:** your copy sprints; your calls below; audio's badge and snap-to-hit; multiplayer (b) loop by reference only if 3+ rooms matter (needs a relay deploy); (c) after the fest.

## Schedule

| Days | Project | Slices | Demo cut |
|---|---|---|---|
| every day | 1 Copy (yours) | 2 sprints a day = 26 by Oct 17 | rides every cut |
| Oct 4-5 | 6 Multiplayer panel | status line, Invite popover + ⋯, mode switch, fair queues | Oct 6 |
| Oct 4-7 | 2 Audio | bindings fire, cue file per track, Full = cue editor | Oct 8 |
| Oct 8-10 | 3 Left sidebar | (plan pending) | Oct 11 |
| Oct 11-12 | 4 Recording | (plan pending) | Oct 13 |
| Oct 13-14 | 5 Palette | one palette, New/Rename/Reset, hotkeys in sight, drag | Oct 15 |
| Oct 15-16 | spill-over | audio play-along + pattern matcher, MP loop by reference | |
| Oct 17 | freeze | full verify, final demo build | Oct 17 |
| Oct 18 | buffer | | |

## Your calls (each has a default; I build the default unless you say otherwise)

1. **Audio: delete the Composer?** It runs its own 16 s clock and can't line up with a song. Default: delete it; the old Full sliders become a collapsed "Live input" block for mic and system audio.
2. **Audio in a room:** should your track's cues paint on your partner's canvas? Default: not in v1 (local, like audio today).
3. **Palette: edits save themselves** (no Update button; Ctrl+Z is the safety net)? Default: yes.
4. **Palette: editing a built-in** changes it in place, with Reset colours in its menu? Default: yes, rather than making a copy on the first edit.
5. **Multiplayer: guests** see the mode switch disabled (default) rather than hidden.
6. **Multiplayer: a stranger pair** loses Lock settings (default), since a pair has no real host.
7. **Multiplayer: loop by reference (b)** needs a relay deploy. Default: only if rooms of three or more, or phone artists, are part of the fest demo.
8. **Recording: Stop asks Keep · Discard** (default) rather than keeping every take: auto-keep would fill the ~20-animation localStorage budget.
9. **Recording: look presets stop restoring your current recording** (projects still do), so switching looks can never replace your animation. Default: yes.
10. **Recording: Animations stays out of Simple** (default), but F9, F8 and the REC badge work there.
11. **Left sidebar in Simple:** the head (Brush Size) and Brush only (default). Simple hides both faders today.
12. **Brush Size and Multi-Brush leave the top bar entirely** (default). The wheel, [ ], 1-8 and the radial menu still reach them, and the rail shows the size.
13. **Audio: drop the "Under construction" badge** now that Full is the cue editor? Default: keep it until you've played a song through Set up this song and the matcher.
14. **Palette: + New starts with the picker colour** (default) rather than empty. The study found Procreate's + makes an empty "Untitled"; one colour makes it paint at once.

---

## 1. Copy rewrite (yours, with the tool)

- `npm run copy-sink`, open http://127.0.0.1:3998/__sink/, press **Sprint**. 445 help strings, ~7,700 words, ~26 sprints of 25 minutes.
- **Safe to reword now (93a60e1).** A saved Ctrl+Shift+H key on a control with words of its own falls back to its words when its tooltip changes (js/49 `resolve`). 2 of the 249 help tooltips still depend on their text (two inputs in the radial menu's editor); the sprint row says "⚠ hotkey finds it by this". The collision-layer tour uses `#addCollisionLayerBtn` now, not a tooltip prefix.
- Viscosity's and Laminar / Blend's titles in index.html never render: edit `CHANNEL_TOOLTIPS` in js/20.
- When the sprints are done: STORE-PAGE-COPY.md §10 (the AI disclosure) can say the text is yours.

## 2. Audio rebuild around the timing tool

**Finding:** the timing chart detects everything but fires nothing into the sim. A cue crossing the hit line only flashes the lane (40:1019). Every visible effect comes from 22's live engine, which never reads the chart. So most of the rebuild is wiring plus an editor.

**Today:** 22's `tick()` (22:619) feeds `applyMappings` (22:810): auto-splats via `fireAutoSplat` (22:1001) into `applyMultiSplatWith` (05g:553), kaleido spin into `kAngle` (22:847-868), colour every N beats via `stepPaletteOnce` (22:880-895), brush pulse on `SPLAT_RADIUS` (22:817-839). Tunnel runs in `AudioScenes.tickFrame` (22:732, 30:357-448). Offline, 40 caches a 256-column spectrogram per track (40:349-440) and extracts lanes (40:670): onset, level, beat + BPM, pitch. The composer (27) has its own clock and never reads `position()`. Full (20:7006-7260) has no chart and no gate editor.

**Target:**
- **Track identity:** SHA-256 of the file bytes (first 16 hex), taken in `startFile` before `decodeAudioData` (22:365) detaches the buffer. Fallback: name + duration ±0.2 s, with "Use cues from X?". Not 40's `fileKey()` (40:305): it includes the sample rate.
- **Cue file `.swirlcues` (JSON):** `{format, v:1, track:{sha,name,dur}, nudgeMs, lanes:[{id,name,lo,hi,th,uth,method,pattern?,bpm,bind:{act,p},mute,edited,cues:[[ms,e100]...]}]}`. An unedited lane stores no cues (regenerated from the cache); an edited one ~15 KB for 4 min × 3 lanes.
- **Storage:** Electron `Documents/Swirl Together/Cues/<name>-<sha8>.swirlcues` beside the vault (12b:173-177, `createVaultFS`); web localStorage `swirlCues.v1:<sha>` outside `fluidUI:` so Clear and Reset app leave it. Every edit writes through (debounced 300 ms, flushed on pointerup). Never rides presets, Mutate, look links or the room mirror; keep editor controls out of 01a.
- **Scheduler `js/40a-audio-cues.js`:** called from 22's tick beside 22:732 (no rAF of its own); fires cues in `(lastT, nowT]`, `nowT = position().time − outputLatency + Nudge`; a seek or loop wrap resets `lastT` without firing; nothing while paused.
- **Actions:** splat (22's generators, needs a public `fireGenerator(name, e)`), colour step (`stepPaletteOnce`, 250 ms floor, 500 with PhotoSafe; "every N" counts beat-lane cues), kaleido step (eased, ≤ 90°/s), Tunnel ring (`AudioScenes.fireRing` split out of 30:406), brush pulse (`audioReactive.kick(e)`).
- **Editor (Full becomes a horizontal timeline):** spectrogram strip, cue ticks per lane, playhead, zoom/scroll; select, drag to nudge (snap ±40 ms to a flux peak), Delete, double-click to add, box-select, undo; keys 1-8 tap a cue while playing; the first edit freezes a lane, Re-detect replaces it. The falling chart stays as the play-along view.
- **Pattern matcher:** box a time × frequency region (≤ 1.5 s, ≤ 48 columns pooled); zero-mean NCC over the cache in the worker (~0.2 s for 4 min); peaks ≥ Similarity 0.6, suppressing within half the template; "attack" mode matches the positive-difference patch. Add 'pattern' to METHODS (40:150).
- **Wizard:** `autoLanes` (40:1242) names Low/Mid/High; per band pick Hits / Pulse / Melody / This shape, Fit with `calibrateTh` (40:1133), pick an action (defaults Low = Burst, Mid = colour every 4 beats, High = sparkle).
- **Mic and system audio:** no cue file; the same lanes and bindings fire through live `gatesTrigger`.

**Slices:**
1. Bindings fire (M): 40a scheduler, action registry, a bind select on the lane rows (40:1504). Visible: a track's lanes splat, step colour and spin in time.
2. Cue file per track (M): hashing, storage, per-track lanes seeded from the global gates, Export/Import. Visible: reload, load the same song, the lanes come back.
3. Full = cue editor (L): composer deleted (27, its tag at index.html:1805, 20:6557, 6932-7004, 7252), `53-idle-vram.js:95` checks "track playing". Visible: drag a cue and it fires at the new spot.
4. Play-along (S): tap to add, snap, chart selection.
5. Pattern matcher (L): box one snare and every snare lights up.
6. Wizard + downbeat for "every N" (M): "Set up this song" in under a minute.
7. Safety and cleanup (S-M): rate floors, `scripts/test/audio/` harness, inventory, badge gone.

**Traps:** one cue can cost dozens of splats (Grid 12 × arms × kaleido); cap 3 actions a tick with a gap per action. Redraw the spectrogram only on scroll/zoom. `disable()` drops caches over 8 MB (40:1108). Bluetooth lags 150-250 ms: subtract `outputLatency`, keep Nudge (±300 slider, ±500 in `setNudge` 40:1606). Dense hat lanes on bright splats can trip PhotoSafe's 5/s flicker limit (04a:1426): add "every Nth cue". The room mirror skips the audio toggle and source (06b:60-66) but not `audioMode`. Delete clears the recording layer globally (05n:428): the editor must swallow Delete and the arrows while focused. features.json:294-310 points at stale 22 lines.

## 3. Left sidebar

**What moves:** the Brush Size channel (`#brushSize`, `#mixer-brushValue`, the tip swatch; 20:794-811), the brush drawer (`buildBrushPanel` 20:4772-5587, a body-mounted 252px slide-in closed by any outside click at 5576), the Multi-Brush window (`buildArmColorsDropdown` 20:7922-8507, body-mounted 220px, closed by an outside pointerdown at 8469-8479), and Stroke and replay (`buildBrushSection` 20:4397-4764, now in the right sidebar at 2194). "Settings" in the note = the drawer (its gear says "Brush settings & presets"); the right sidebar's Settings stays.

**Reuse:** `makeSection` (20:8628) and the collapse CSS (21-sidebar.css:52-65, 104-125) name no sidebar. These hard-code `#sidebar-right` and must take both: 20:8537, 8559, 8621; 12:468, 806, 1364; 43:125, 184, 257; the findSection copies at 44:649, 49:104, 13:80, 51:262. Add `SECTION_SEL` for both bars and `window.Sidebars = {sections, find, open, left:{collapse, expand, toggle, isCollapsed}}`; `open` expands the rail first. One `sidebar.sections` map keyed by title (titles are unique). `onOpen` on `makeSection` takes the drawer's and Multi's open-time work. Sideways state = `ui.leftSidebar.collapsed`. Don't copy `initSidebarResize` (20:208): it writes a variable no CSS reads.

**Target:** `#sidebar-left` in `#main-area` before `#canvas-area` (20:60-74), 248px × `--ui-scale`, open by default.
1. Head (sticky): the Brush Size channel moved whole (keeps COS 07:329, radial readouts, 49's `valueTextOf`), plus «.
2. **Brush** (open): the drawer's content in its current order.
3. **Multi-Brush** (collapsed): the `#multiplier` channel with its ↔ badge, symmetry, the notes, arm rows, legend.
4. **Stroke and replay** (collapsed): title verbatim (tours, saved state and hotkey scopes key on it).

Collapsed sideways: a 32px rail with », the live size, and each section's title as vertical text; a click opens that section. Auto-collapse below ~1280 CSS px until the user picks.

**Traps:**
- **Canvas width:** a change runs ResizeObserver (01:970, 80 ms) → `fitCanvasIntoArea` → 180 ms settle (05j:312-345) → one buffer realloc + `initFramebuffers` (copies dye, velocity, pressure, layers, masks). Same cost as a window resize. Snap, never animate (05j:318-331). The underbar (`left:0`, z 1200) must trim its left edge in `place()` (20:2285).
- **Hotkeys silently retarget:** id-less binds search the whole body by position; the drawer's tip buttons share text and title with the three alt-brush tip rows (20:5293 vs 4184), so moving the drawer earlier in the page makes a key change the wrong brush. Migration in 49's `load()` over `hotkeys.controls` and `hotkeys.radialMenu`: binds whose `where` was Brush / Multi-brush get a section scope and a recount; ambiguous ones stay unresolved; map `multiplierPanel` → `multiplier`. Keep every moved control's title and text verbatim.
- 43: `collect` lists left sections, `restampGroups` per sidebar, hide the bar when all its sections are hidden, bump `SIMPLE_VERSION`. 13 (mobile): move `#sidebar-left` like the strip, `zoom:1` when nested. ui-scale: drop `.arm-colors-panel` from moved containers (its own zoom doubles), widen ~30 rules in 21-sidebar.css to `:is(#sidebar-right,#sidebar-left)`. 58's `sliderHome` (953) labels anything in a `.mixer-channel` "Top bar". Remove both panels' click stopPropagation (5583, 8483) or they swallow other popups' outside-click closers.
- 44: `BRUSH_DRAWER`/`inDrawer` (110-111) → `{section:'Brush'}`, strip targets (118-164), POPUPS (679-680) and the 320 ms slide wait (756) go; ~12 strings say "drawer" / "its gear".

**Slices:** 1 Shell (M: the left column with Brush Size, the canvas refits). 2 Generalise sections, move Stroke and replay (M). 3 Brush section, drawer gone, 49 migration (M+). 4 Multi-Brush section, floating window gone (M). 5 Sideways collapse (M). 6 Simple, mobile, cleanup (M). Checks after each: boot, ut3 verifier, the ten affected tours, a profile with saved hotkeys, `--ui-scale` 1.35.

## 4. Recording's information architecture

**Live bugs found on the way (fix first, they lose work):**
- **Settings → Clear deletes every saved animation and the slot layout.** `clearExceptPresets` keeps only `fluidUI:preset.*` (09:271-285), while the dialog says "Your presets are kept" (12:530).
- **A bare Delete wipes the active take with no confirm** whenever Recording Mode isn't Off (05n:428-433).
- **Every button on a drawer layer card is dead** (👁 ▶ 🔁 ✂): the input/button guard at 03:861 runs before the `[data-action]` lookup at 03:862.
- **Save fails silently twice:** a re-used name dead-ends with 'exists' (03:1641), a full quota is ignored (03:1644).
- The global Max only reaches layers made after it changes (03:132, 03:204), while the record head draws against the global value (03:1228).

**Today, eight surfaces:** A the sidebar Recording section with "Recording Mode" Off / Minimized / Full (03:1848; Off kills capture, F8, F9, Delete, ↑/↓, Ctrl+Shift+N, but slots still play); B the drawer "Recorded Layers" with Speed, Max and a 10-button row (index.html:1508-1517: Record · Play Layer · Play All · Stop · Add Layer · Duplicate · Delete · Clear Active · Export · Import) plus an Animations select that *appends* (03:1594-1614); C the Animations slots + Saved Animations library (20:3235-3508; `fluidUI:recPreset.<name>`, `fluidUI:animSlots`; not in the vault or the project); D right-click Replay (05d); E Path Layers (24-path-layers); F Export (Video/GIF run a fixed Duration; status says "Recording... N%", 24:1789); G the canvas badge ("⏱ ..." shows a literal ellipsis); H hotkeys.

**Glossary today:** "Record" is a tab, a button, a How-do-I pillar that also holds Audio, and the video tooltips. "Recording" is a section, a mode, a capture label, the video status, and a saved animation. "Layer" is a take, an image layer, a path layer, a still, a collision layer. "Preset" is a look and, in the recorder's own status text, a saved animation. Full / Minimized / Off mixes size with on/off, and Audio uses the same words.

**One name each:**

| Concept | Name | Lives in |
|---|---|---|
| A saved, replayable stroke performance | **Animation** | Animations (slots + library) |
| One recorded pass inside it | **Part** ("Layer" stays with image/path layers; "Take" already means Take turns) | the editor |
| Capturing strokes | **Record** only; badge "REC 3…" | Animations strip, F9 |
| Hold-to-repeat the last stroke | **Replay** only | Stroke and replay |
| Video, GIF, Sequence, picture | **Video** etc.; status "Video 0:07 / 0:15"; badge "VIDEO" | Export |
| A saved look | **Preset** only | Presets |
| Animation file in/out | **Save to file / Open file** | the editor's File menu |
| Replay colours | **As painted / Exact colours / Current brush** | editor + library row |

**Off / Minimized / Full become:**
- Off goes: nothing is captured until Record is pressed; F8 and F9 always work; Delete, ↑/↓, Ctrl+Shift+N act only while the editor is open.
- Minimized becomes **the record strip** at the top of Animations: ● Record · ▶ Play · ■ Stop · "0:03 / 0:08" · length chips 4 / 8 / 15 / 30 s · Edit ⤢. It reuses the `recMini*` ids (03:693-746).
- Full becomes **Edit ⤢**, opening the drawer; its tab is renamed "Animation". The Recording section folds into Animations (20:2193). `#recMode` stays as a hidden element (28:20, 12:119 and Audio read it).
- The 10 buttons split into **Play** (Record · Play · Stop; a ▶ per part), **Edit** (+ New part; a ⋯ per part: Duplicate, Clear, Delete, Loop length, Colours) and **File** (name · Save · Save as new · File ▾). Record in the editor always adds a new part.

**First-time paths:** Animations → ● Record (F9) → 3-2-1 → paint → ■ Stop (or 8 s) → **Keep · Discard** → Keep saves "Animation 1" into the library and the first empty slot → click the slot to loop it. Video: start what should move → Export → Video → the button becomes **■ Stop and save**, the canvas shows "VIDEO 0:04 / 0:15".

**Slices:**
1. Words (S): Part / Animation / Video / Replay on every label, every id kept; stored "Layer N" names display as "Part N"; colour labels, video status, hotkey overlay, tours.
2. The strip replaces Off / Min / Full (M): Recording folds into Animations; drawer-only hotkeys scoped to the open editor; the badge shows the countdown digit (styles.css:1165).
3. Editor row split (M-L): play / edit / file, per-part menu, the dead-button fix, masks and the select row removed.
4. Keep and Save (M): Keep/Discard, auto-names that bump, rename moves the key and rewrites slots, Settings → Clear keeps `recPreset.*` and `animSlots`, quota failures shown, `animSlots.assignFirstEmpty()`.
5. Video reads as video (S-M): Stop and save (finish-early flag in both encode loops), the VIDEO badge, ids on the Quick Export buttons (add ids BEFORE renaming them: js/49 finds them by their words).

**Migrations:** `recPreset.*` and `animSlots` keep their shape; `select.recMode` is read but gates nothing; 'section:Recording' in `ui.hiddenSections` / `sidebar.sections` disappears. **Tours to rewrite:** 44:423-450, 44:501-508, the "Record" pillar (44:101). Trailer beat 6 (steam/TRAILER-SCRIPT.md:165) uses F9/F8, which then work without picking a mode.

## 5. Palette redesign

**Today's model:** a palette = name + colours, from built-ins (01:55-60), `customPalettes`, and name-keyed edits (`userPalettes['name:<name>']`, 01:160-186), all written through. The **tray** (`savedColors`, 01:5; localStorage `fluidSimColors`, 02:292-337) is what Palette mode actually paints: `getStepColorList()` returns the tray and falls back to the palette only when empty (01:342-347). `applyPalette` overwrites the tray (01:361-367). After picking a palette the tray box and the chip row show the same colours and nothing says which paints.

**Bugs found on the way:**
- Tray edits are lost on reload unless you press Update: boot runs `applyPalette` twice (05g:623 → 01:690-696, then 12:305-311) after restoring the tray. Breaks the write-through rule.
- Update on a built-in changes the built-in object itself (`curatedPalettes` is a shallow copy, 01:61, 474), so Restore defaults (01:726) can't get the colours back.
- Clicking a chip or swatch leaves Palette mode for Fixed (01:306, 04a:49). The recipes still call Palette mode "Cycle" (44:197-202).

**Target: one palette, edits save themselves.** The tray becomes an internal mirror (`setPaletteColorsForIndex` already writes both, 01:282-285). The chip row always shows what Palette mode paints. Colours from a look that match no saved palette read "Unsaved colours · Keep" (`colorsKey`, 01:193, exists unused). Built-ins edit in place with Reset colours.

```
┌ Palettes ─────────────────────────── Ctrl+← → ┐
│ [Mountain Majesty] [Forest Serenity] [Sunset] │
│ [Ocean Waves] [Red White Blue] [+ New]        │  drag a tag to move it
│      right-click: Use · Rename · Duplicate · Reset colours · Delete…
├ Forest Serenity ──────────────────────────────┤
│ [■][■][■][■][■] [+]                           │  drag a chip to move it
│      ▲next                                    │  + adds the picker colour (Shift+S)
│ Palette mode  A      Next ■ 2/5   N / ⇧N      │  right-click a chip: Paint with it ·
├───────────────────────────────────────────────┤  Replace with current · Remove (⇧X)
│ Import · Export this · Export all             │
└───────────────────────────────────────────────┘
```

Save as New becomes the **[+ New]** tag (copies the active colours into "<name> 2", name field inside the tag); Save Color becomes the **[+]** chip; Update and Clear All go. Drag uses the layer rows' pattern (05k:10-40, with 32-file-drop:21-36's guard). Migration: old index keys move to `name:` once; new `palettes.order` and `palette.currentName` (keep writing `currentIndex` for older builds). Keep the tag's tooltip and the `palette-chip` class (js/49 bindings).

**Slices:** 1 One palette (M: hide tray, [+] chip, Shift+S/⇧X on the palette, "Unsaved colours", palette in undo). 2 New / Rename / Reset (M). 3 Hotkeys in sight (S: `kbd` labels, tooltips, "Cycle" text, help modal). 4 Drag colours (M). 5 Drag palettes + order migration (M).

**What the five apps do (official docs, 2026-10-04):**
- **Saving:** Photoshop saves new swatches to its preferences automatically; Procreate documents no save step; Krita versions on Save, on switching palette, or on a normal quit. Auto-save matches the norm.
- **New:** Procreate's + sits at the top of the palette list and makes "Untitled"; Duplicate lives in each palette's ⋯ menu. Clip Studio's new set is empty, Duplicate is separate. Nobody has a free-floating "Save as New". So: [+ New] makes an empty palette named "Untitled", and Duplicate (in the menu) copies.
- **Adding a colour:** tap an empty slot (Procreate, Krita, Photoshop's empty row). Aseprite shows its add icon only when the current colour isn't in the palette yet, so the button doubles as a status: do the same with [+].
- **Reorder:** drag is the norm (Procreate, Krita, Photoshop); Procreate holds before dragging a palette, Clip Studio needs a modifier, both to stop accidental moves.
- **Hotkeys:** few apps have any; Aseprite's [ and ] step colours but are brush size in Photoshop (and here). Showing the key in the tooltip matters more than which key.
- Sources: help.procreate.com colors-palettes; docs.krita.org palette_docker; helpx.adobe.com customizing-color-pickers-swatches; help.clip-studio.com Color_Set_palette; aseprite.org color-bar-tutorial.

## 6. Multiplayer panel and hardening

**Today** (index.html:1279-1350; 06e `updateConnectedView` 148-213; 06c `updateTurnUI` 393-483; 54:247-302; 61:162-180): a private host sees 12 buttons, a slider and ~7 text items; a guest sees 10 including two dead "host only" buttons; turns show the clock three times and the count twice; a stranger pair lets whoever connected first lock the other's look (06e:201).

**Target:**
```
not in a room                      in a room
[ Start a room ]  [ Stranger ]     ● Your turn · 0:42 · 3 here
[ Paste a code…       ][Join ]     [ Invite ▾ ]                 [ ⋯ ]
  📱 Paint from your phone          [ Together | Turns | Call & return ]
                                     Each turn ──●──── 1:00   (driver, before it starts)
                                     Now  ● Artist-XY (you)
                                     Next ● Artist-AB
                                   [ Pass ]                   [ Leave ]
```
- Blurbs become tooltips. Pass only on your turn. Host's Skip moves to ⋯. Guests see the switch disabled ("The host picks how the room paints"). A stranger pair: Invite becomes "📱 Phone", picking a segment asks the partner ("Asking…"), no locks.
- ⋯ (host): ✓ Lock room · ✓ Everyone uses my look · Skip <name> · Copy room report. Guest: Copy room report.
- Invite popover on `.brush-shape-menu` (20:490-534): Code | QR | Hide, Copy link, Copy code, phone row. Keep every id (`roomName`, `roomQr`, `shareMode*`, `copyRoomBtn`, `copyRoomCodeBtn`, `phonePadRoomBtn`): 06e:290, 44:476-482 and the copy sink read them.
- One status line from one 06e function: `{Activity}[ · clock] · {people}[ · lock]`, never the room code.

**Hardening:**
- **(d) fair queues (M), no wire change:** per-sender `Map<clientId,{q,dabs,paceOffset,...}>` in place of the one `_inboundSplats` FIFO (06d:1110) and shared `_paceOffset` (06d:1117); round-robin budget; a not-yet-due message blocks only its sender; evict from whoever queued most. Matters once a phone artist joins (two computers + a phone = three senders).
- **(b) loop by reference (L), relay deploy first:** the first pass as today plus `sid`/`loop:1`, later passes `{type:'stroke-loop', data:{sid,pass,speed,sym,at,fc,rc?}}` ~120 B; a `caps v:2` handshake so an old peer keeps getting full sends; relay adds `stroke-loop` to TURN_HOLDER_ONLY (index.ts:40) and PAINT_TYPES (index.ts:82). A held loop today re-sends ~180 KB a pass (05d:874).
- **(c) live before bulk (M), after the fest:** a `sendBulk` lane gated on `bufferedAmount < 24 KB`.

**Slices:** 1 status line + text cut (S). 2 Invite popover + ⋯ (M; host 12 controls → 5). 3 segmented switch + Pass (M; keep `#turnsBtn`/`#callReturnBtn` ids for 44:486-497). 4 fair queues (M; target 0 dropped dabs, lag p95 < 150 ms under a 42 msg/s flooder). 5 loop by reference (L). 6 live before bulk (M, after). Tests: `mp-text-e2e.js` pattern (separate Chrome profiles + local relay `npx wrangler dev --port 8787`), a new `scripts/test/mp/mp-panel-e2e.js` with three Chromes.
