# UX Fixes & Improvements — Fluid-UI

> Organized todo list of UX improvements, bug fixes, and feature refactors.
> Do NOT implement yet — this is for planning and clarification only.

---

## 1. Replay System

### 1.1 Replay doesn't recall brush color settings
- [x] **Investigate why replay ignores color modes (random, step, fixed)**
- `processReplay()` in `js/05d-input-replay.js` applies `ev.color` directly from the recorded event without considering `randomColor` or `stepPalette` settings
- `pushStrokeEvent()` records `color: color.slice()` — the resolved color at time of recording, not the mode
- Replay events do NOT set `exactColor: true`, so they *should* respect arm color modes via `resolveArmColor()`, but the recorded color overrides this
- **Fix approach:** During replay, re-resolve color through `resolveArmColor()` / arm color mode logic instead of using the raw recorded color, OR record the color mode alongside the color

### 1.2 Add brush replay speed control
- [x] **Add a speed slider for brush stroke replay**
- Currently replay plays back at real-time speed (events have timestamps `ev.t` relative to stroke start)
- Add a UI control (slider or select) to adjust replay playback speed (e.g., 0.25x–4x)
- Files: `js/05d-input-replay.js` (replay loop), `js/20-mixer-layout.js` (UI for control)

### 1.3 Color setting during recording should respect "lock layer" color checkbox
- [x] **When recording, color changes should honor the layer's color lock setting**
- If a layer has a "lock color" checkbox enabled, color changes during recording should not override the layer's configured color
- Need to check if path layers or recording layers have a color-lock mechanism and wire it into the recording color capture

---

## 2. Multiplayer

### 2.1 Multiplayer doesn't respect replay
- [ ] **Ensure replay strokes are properly synchronized in multiplayer**
- `broadcastReplayStroke()` in `js/06-multiplayer.js` sends replay events with `x`, `y`, `dx`, `dy`, `color`, `mult`, `radius`
- `scheduleStrokeReplay()` receives and reconstructs these
- Brush size (radius) IS broadcast — verify it's being applied correctly on the receiving end
- **Investigate:** Are replay strokes from one peer visible to others? Is the replay state itself synced?

### 2.2 Multiplayer doesn't respect path layers
- [ ] **Path layers are not broadcast or handled on the receiving end**
- `js/24-path-layers.js` creates path layers with `brushSize`, `color`, and `exactColor: true`
- Path layer splats use `applyMultiSplatWith()` with `exactColor: true`, bypassing arm color modes
- These splats may not be broadcast via `broadcastSplat()` or `broadcastReplayStroke()`
- **Fix approach:** Broadcast path layer splats as replay strokes or direct splats with `exactColor` flag

### 2.3 Multiplayer brush size sync
- [ ] **Verify brush size is synced across peers during live painting**
- `broadcastSplat()` includes `radius` in the message
- Receiving end should apply `radius` — verify this works for live (non-replay) strokes too

---

## 3. Brush Controls

### 3.1 Brush multiplier renamed to "Brush" with controls visible at 1x
- [x] **Already implemented** — mixer strip has `faderChannel('Brush', ...)` for the multiplier channel
- The "Brush" label opens the brush settings panel; the value (e.g., "2x") opens arm colors
- At 1x, the single row IS the brush's color mode (confirmed in `js/20-mixer-layout.js` comments)
- **Verify:** Controls are accessible and functional at 1x multiplier

### 3.2 Brush easing out should have inertia
- [x] **Splat-out tail should feel more like inertia, not an abrupt stop**
- Current splat-out in `js/05j-update-loop.js` (lines 193–220) uses velocity decay `* 0.9` and distance-based taper via `getSplatOutMult()`
- The tail stops when `outMult <= 0.001` or velocity dies (`outVel2 < 0.0004`)
- **Fix approach:** Add smoother deceleration curve, longer taper, or velocity-based inertia so the brush trails off naturally instead of cutting

### 3.3 Investigate pressure iteration behavior at 12+
- [x] **Pressure iterations may cause instability or visual artifacts at 12+**
- `pressureIteration` slider controls `config.PRESSURE_ITERATIONS`
- High iteration counts (12+) may cause performance issues or visual glitches
- **Investigate:** Test with 12–20 iterations, check for artifacts, performance impact, and whether a cap is needed

---

## 4. Path Layers

### 4.1 Path layers should support multiple paths
- [x] **Allow a single path layer to contain multiple paths (not just one)**
- `js/24-path-layers.js` `createPathLayer()` creates a layer with a single path
- `applyPathSplat()` iterates over one path's points
- **Fix approach:** Store an array of paths per layer, allow adding/appendng paths, and iterate all paths in `applyPathSplat()`

### 4.2 Path layer brush and color controls
- [x] **Already partially implemented** — path layers have brush size slider, flow slider, color picker, and mode select
- Located in `js/24-path-layers.js` path layer UI (lines 630–650)
- **Verify:** Brush size, flow, color, and play mode (loop/pingpong) all work correctly

---

## 5. Page Refresh & UI State

### 5.1 Mobile sidebar flashes open then closes on refresh
- [x] **Fix mobile sidebar auto-opening on page refresh**
- On mobile devices, the sidebar briefly flashes open then closes after page refresh
- `js/13-mobile-mode.js` enables mobile mode on load if `isMobileDevice()` returns true
- The sidebar `controls.classList` may briefly have `visible` before mobile mode removes it
- **Fix approach:** Ensure mobile mode is applied before sidebar becomes visible (CSS `display: none` by default on mobile, or apply mobile class earlier in load order)

### 5.2 Sidebar sections auto-expand on refresh
- [x] **Sidebar sections should remember collapsed state on refresh**
- Preset system captures `sidebarSectionCollapsedStates` in snapshots
- Sections may be expanding on refresh before saved state is applied
- **Investigate:** Check load order — are sections built before saved collapsed state is restored?

---

## 6. Audio Reactive System

### 6.1 Remove EQ bars scene
- [x] **Remove the EQ bars audio reactive scene entirely**
- `js/30-audio-scenes.js` defines the `eq` scene with `applyBarSplat()` creating lane-shaped splats
- User confirmed: EQ bars are too big and don't look great — remove completely
- **Files:** `js/30-audio-scenes.js` (remove `eq` scene definition), `js/20-mixer-layout.js` (remove from scene select dropdown)

### 6.2 Rework ferrofluid mode
- [ ] **Rework ferrofluid to pool and collect dye like a real ferrofluid device**
- Current `ferro` scene in `js/30-audio-scenes.js` uses splat calls for magnetic pull and beat-triggered spikes
- Issues: glitches out, doesn't look like a real ferrofluid
- **Goal:** Thoughtful ferrofluid effect that:
  - Pools and collects dye (density accumulates in response to magnetic fields)
  - Forms smooth spike patterns on beats (not glitchy)
  - Settles back into pooled state when audio is quiet
  - Uses appropriate colors (`FERRO_DARK`, `FERRO_HI` need tuning)
- **Fix approach:** Rework the `tick()` function to use gradual density accumulation/dissipation, smoother spike formation, and proper pooling behavior

### 6.3 Enhanced minimized audio mode (sidebar)
- [ ] **Enhance minimized audio mode in the sidebar with full timeline editing**
- Currently `js/27-audio-composer.js` has `drawAudioMiniTimeline()` for visual representation
- **Needed:**
  - Draw shapes on the timeline (not just view)
  - Modify segment settings from the minimized view
  - Support overlapping states/segments
  - Set duration for segments
  - Playhead position indicator
  - Segment editing (add, move, resize, delete)
- Keep in sidebar form factor (not a bottom bar or floating panel)

### 6.4 Improve full audio tab UI
- [ ] **Improve the full audio tab for better input sizing and user guidance**
- The full audio mode needs better UI for:
  - Input size controls (sizing audio input properly)
  - User guidance/onboarding (how to use the audio reactive features)
  - Clearer layout for segment configuration
- Files: `js/27-audio-composer.js`, `js/20-mixer-layout.js` (audio section UI)

---

## 7. Layers UI

### 7.1 Layers doesn't collapse properly
- [x] **Fix layer item collapse/expand behavior**
- `css/22-overlays.css` defines `layer-item-collapsible` using `grid-template-rows` for collapse/expand
- `js/05k-layers-render.js` handles collapse/expand logic
- **Investigate:** Why isn't collapse working? Is the CSS class not being toggled, or is the grid-template-rows transition failing?

### 7.2 Row of buttons shouldn't be in the collapsible header
- [x] **Move layer action buttons out of the collapsible header**
- `js/05k-layers-render.js` builds `layer-item-header` with `layer-controls` inside it
- The buttons row should be in the collapsible body, not the header — header should only have the layer name/visibility toggle
- **Fix approach:** Move button controls into the expandable body section

### 7.3 Educate users on masking/feathering for collider layers
- [x] **Add UI guidance for masking and feathering collider layers**
- Users need to understand they should mask or feather layers to get clean collider layer setups
- Without masking/feathering, the collider is just the whole block
- **Fix approach:** Add tooltips, hints, or a brief tutorial/infobox when creating collider layers

### 7.4 Crisp edges for collider layers
- [x] **Ensure collider layers have crisp, non-jagged edges**
- Current collider generation may produce jagged edges
- **Fix approach:** Improve edge detection/feathering in collision generation logic
- Files: `js/23-depth-collision.js` (collision generation), `js/15-layer-masking.js` (mask/feather controls)

### 7.5 Overhaul "Drop here for bottom" section
- [ ] **Improve the drag-and-drop bottom zone with smooth auto-scroll and collapse-others**
- `js/05k-layers-render.js` has drop zones for top/bottom reordering
- **Needed:**
  - Smooth auto-scroll when dragging near the top/bottom of the layers list
  - Collapse other layer items when dragging (to reduce visual clutter)
  - Clear drop zone visual feedback
  - Smooth animations (within Electron CSS constraints — no opacity transitions)

### 7.6 Investigate collider layer performance issues
- [x] **Investigate and fix performance issues with collider layers**
- Collider layers may cause frame rate drops
- **Investigate:** Profile with multiple collider layers, check collision computation in `js/23-depth-collision.js`
- Look for unnecessary recomputation, texture reads, or shader overhead

---

## 8. Gate Control UI

### 8.1 Add vertical slider for gate max density
- [x] **Add a vertical slider control for gate max density**
- Current gate control is a checkbox (`colorGate`) in `js/05h-slider-bindings.js` (lines 60–84)
- `applyGateState()` sets `config.COLOR_GATE` and `config.BLOOM_CEILING` (hardcoded to 3.0)
- **Fix approach:** Replace or augment the checkbox with a vertical slider that controls `BLOOM_CEILING` (max density), allowing users to set the cap value
- Files: `js/05h-slider-bindings.js` (gate logic), `js/20-mixer-layout.js` (UI), CSS for vertical slider styling

---

## 9. "Underbar" UI Component

### 9.1 Define new underbar component for custom settings
- [ ] **Create a reusable "underbar" UI component — a slim horizontal bar at the bottom of the top mixer strip**
- Purpose: Quick access to custom settings without opening a full panel
- Should appear at the bottom of the top mixer strip (upper nav area)
- Also usable in the right nav (sidebar)
- **Design considerations:**
  - Slim, minimal height
  - Context-sensitive (shows settings relevant to current active channel/section)
  - Collapsible
  - Must follow Electron CSS constraints (no opacity transitions, no backdrop-filter)

---

## 10. Focus Mode

### 10.1 Change focus mode hotkey from 'S' to 'F'
- [x] **Change the focus mode toggle hotkey from 'S' to 'F'**
- `js/21-focus-mode.js` binds the hotkey to 'S'
- Change the keydown check from 'S'/'s' to 'F'/'f'
- **Verify:** 'F' key doesn't conflict with other bindings (check `js/05n-hotkeys-init.js` and other hotkey handlers)

---

## 11. Battery UI Removal

### 11.1 Remove battery UI and auto-adjust
- [x] **Remove all battery management UI and auto-adjust functionality**
- `js/14-battery-manager.js` contains battery UI and auto-adjust controls
- `css/battery-styles.css` contains battery styling
- **Files to modify:**
  - Remove or gut `js/14-battery-manager.js`
  - Remove `css/battery-styles.css` from `index.html` link tags
  - Remove battery-related UI elements from `js/20-mixer-layout.js` (buildSettingsSection references)
  - Remove battery profile references from `js/05h-slider-bindings.js` (resolution dropdown injection for battery profiles)
  - Remove battery references from preset snapshot in `js/12-save-load.js`

---

## 12. ComfyUI Bridge Rename

### 12.1 Rename "ComfyUI Bridge" to "Set Save To Folder"
- [x] **Rename all references to "ComfyUI Bridge" to "Set Save To Folder"**
- `js/comfyui-bridge.js` handles the ComfyUI integration
- UI label in settings section (`js/20-mixer-layout.js` buildSettingsSection) says "ComfyUI Bridge"
- **Fix approach:** Update the display label text only — keep internal variable names and API as-is (`window.comfyuiBridge`, settings keys `comfyui.*`)

---

## 13. Mobile Improvements

### 13.1 Pinch/zoom to change brush size
- [x] **Add pinch gesture to control brush size on mobile**
- Currently brush size is controlled via slider or scroll wheel (`js/05h-slider-bindings.js` lines 300–324)
- **Fix approach:** Add touch pinch detection (two-finger pinch) that maps pinch scale to brush size slider value
- Show visual indicator of current brush size during pinch

### 13.2 Two-finger up/down for duration
- [x] **Add two-finger swipe up/down to adjust replay duration**
- Map two-finger vertical swipe to replay time period adjustment
- Show visual indicator of current duration value

### 13.3 Visual indicators for gestures
- [x] **Add on-screen visual indicators when using mobile gestures**
- Show temporary overlay/text indicating brush size change, duration change, etc.
- Must be non-intrusive and auto-dismiss

### 13.4 Audio gate clearing on mobile
- [x] **Ensure audio gates can be cleared easily on mobile**
- Gate editors in `js/30-audio-scenes.js` use canvas drag + double-click
- Double-click may not work reliably on touch — add a clear button or long-press gesture

### 13.5 Lock settings for invited users (multiplayer)
- [ ] **Allow host to lock settings so invited users can't change them**
- In multiplayer mode, the host should be able to lock certain settings
- Locked users can paint but not modify sim parameters, layers, or other config
- Files: `js/06-multiplayer.js` (add lock message type), `js/20-mixer-layout.js` (disable controls when locked)

### 13.6 Improve slider usability on mobile
- [x] **Make sliders easier to use on touch devices**
- Current sliders may be too thin/short for finger control
- **Fix approach:** Increase touch target size, add larger handle, ensure touch events work smoothly

### 13.7 Disable horizontal layout on mobile
- [ ] **Force vertical layout on mobile — disable any horizontal layout mode**
- Mobile should always use vertical/portrait layout
- Check `js/13-mobile-mode.js` and CSS responsive rules

### 13.8 Improve mobile color vibrance
- [x] **Improve color vibrance/contrast/brightness on mobile displays**
- Mobile screens may show washed-out colors
- **Fix approach:** Tune `config.VIBRANCE`, `config.CLARITY` defaults for mobile, or add mobile-specific color enhancement
- May need HSL/contrast adjustments in the display shader for mobile

---

## 14. Capture Area

### 14.1 Fix capture area size consistency
- [x] **Ensure capture area size is consistent across different canvas sizes**
- Capture via `toBlob()` in `js/comfyui-bridge.js` captures the canvas at its current resolution
- Canvas size may vary based on window size, resolution settings, etc.
- **Fix approach:** Standardize capture dimensions or allow user to set a fixed capture resolution
- Verify capture works correctly at all supported canvas sizes

---

## Priority Order (Suggested)

1. **Quick wins:** #10.1 (hotkey change), #12.1 (rename), #11.1 (battery removal)
2. **Bugs:** #5.1 (mobile sidebar flash), #7.1 (layers collapse), #7.2 (buttons in header)
3. **Core features:** #6.1 (remove EQ), #6.2 (ferrofluid rework), #1.1 (replay color), #1.2 (replay speed)
4. **UI improvements:** #8.1 (gate slider), #9.1 (underbar), #7.5 (drag-drop overhaul), #6.3 (minimized audio)
5. **Mobile:** #13.1–13.8 (all mobile improvements)
6. **Investigation:** #3.3 (pressure iterations), #7.6 (collider performance), #14.1 (capture size)
7. **Multiplayer:** #2.1–2.3 (sync issues)
