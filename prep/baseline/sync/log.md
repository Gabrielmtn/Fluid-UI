# Sync baseline (F5) — capture

Two headless Chromes in one room on a local relay; a fixed sequence on A, one action per 250 ms; every message B received, normalised. Generated 2026-10-17T08:23:24.988Z by `prep/baseline/scripts/sync-log.js`.

## Environment

| Fact | Value |
|---|---|
| Chrome | Chrome/155.0.8059.80 (V8 15.5.35.23, protocol 1.3) |
| Viewport / DPR / `--ui-scale` | 1584×805 / 1 / 1 (both clients) |
| Display Hz the app measured | A 120, B 120 (FPS Limit pinned to Uncapped on both before the room, see NOTES) |
| HEAD | `c4796da` |
| Node / OS | v25.9.0 / win32 10.0.26200 |
| Relay | wrangler on `127.0.0.1:8787`, ready after 1024 ms |
| Relay host the app resolved | A `127.0.0.1:8787`, B `127.0.0.1:8787` (from the seeded `fluidMultiplayerHost`) |
| Device ids (seeded) | A `BASELINEA`, B `BASELINEB` |
| Room | `PLEFZL` (random per run; appears nowhere in the messages, normalised to `<ROOM>` if it did) |
| Connection ids | A `MsOR3tfU5oSfglf7g6vc5` → `<A>`, B `heAKvQcSDXhNFnZYzBk4n` → `<B>` |
| Roles after join | A host, B guest |
| Material mode active | A false (so `#curl` travels as `sliders.curl`, not as the material macro) |
| Look baseline generation | 8 |
| Processes before → after | chrome.exe 63 → 67 (driver Chromes 12 → 0, of which other agents' 0, own left 0); workerd 0 → 0 (own left 0); relay node 0 → 0 (own left 0). Own Chrome pids 34080, 20336, relay pid 46216 (tree 46216, 38828); children took 0 ms to exit after close |

## Counts

| Direction | Messages | By type |
|---|---|---|
| B received | 13 | `clear` 1, `client-count` 1, `connected` 1, `room-look` 10 |
| A sent | 12 | `clear` 1, `ping` 1, `room-look` 10 |
| A received | 3 | `client-count` 2, `connected` 1 |
| B sent | 1 | `ping` 1 |

## Step → what B received

`t` is B's page clock in ms since the kit was installed; keys are the message's fields, or for `room-look` `full=` plus the look sections / keys the delta carries. Values in the last column are the normalised payload for the keys the step changed.

| Step | Action on A | A sent (type, t) | B received (type, keys, t) | Values that landed |
|---|---|---|---|---|
| 0 | join: A `createRoom()`, B `joinRoom(code)`, the host's welcome | `ping` 403<br>`room-look full` 991 | `connected` 492<br>`capacity` `locked` `role` `roomKind` `totalClients`<br>`client-count` 492<br>`count`<br>`room-look` 989<br>`full=true` `checkboxes.breathCueToggle` `checkboxes.breathingToggle` `checkboxes.colorGate` `checkboxes.displayShadingToggle` `checkboxes.ditherToggle` `checkboxes.enableLightShift` `checkboxes.enableLighting` `checkboxes.glowToggle` `checkboxes.kAnimateRot` `checkboxes.kaleidoToggle` `checkboxes.macCormackToggle` `checkboxes.multigridToggle` `checkboxes.overflowToggle` `checkboxes.scatterBlockToggle` `checkboxes.scatterToggle` `colors` `gravity` `lightPos` `lightShiftPath` `material` `paletteIndex` `paletteName` `resolution` `savedColors` `selects.breathColorMode` `selects.breathPattern` `selects.ditherPattern` `selects.ditherTone` `selects.fpsCap` `selects.kaleidoMode` `selects.lightMode` `selects.lightShiftMode` `selects.physicsResolution` `selects.scatterSource` `selects.shadeFormResolution` `selects.visualResolution` `sliders.breathStrength` `sliders.canvasOpacity` `sliders.captureDimming` `sliders.colorBlend` `sliders.curl` `sliders.densityDissipation` `sliders.ditherLevels` `sliders.ditherSize` `sliders.glowIntensity` `sliders.glowThreshold` `sliders.grainCleanup` `sliders.kAngle` `sliders.kBlend` `sliders.kSpinSpeed` `sliders.kTwist` `sliders.kZoom` `sliders.kaleidoSegments` `sliders.lightAmbient` `sliders.lightIntensity` `sliders.lightShiftIntensity` `sliders.lightShiftSaturation` `sliders.lightShiftSpeed` `sliders.lightShiftThreshold` `sliders.lightSpeed` `sliders.mgCoarse` `sliders.mgCycles` `sliders.mgPost` `sliders.mgPre` `sliders.mgRelax` `sliders.overflowBand` `sliders.pressureDissipation` `sliders.pressureIteration` `sliders.ridges` `sliders.scatterAmount` `sliders.scatterReach` `sliders.shadeGloss` `sliders.shadeRelief` `sliders.shadingIntensity` `sliders.sharpness` `sliders.symmetryHold` `sliders.timeScale` `sliders.velocityDissipation` `sliders.velocityInfluence` `sliders.vibrance` `sliders.viscosity` `sliders.wetDrying` `sliders.wetInfluence` `ssOrigin` | full look: 13 sections |
| 1 | curl 10 (#curl, shared slider, step 1 of 4) | `room-look Δ` 2545 | `room-look` 2544<br>`full=false` `sliders.curl` | `sliders.curl`=10 |
| 2 | curl 20 | `room-look Δ` 2797 | `room-look` 2795<br>`full=false` `sliders.curl` | `sliders.curl`=20 |
| 3 | curl 30 | `room-look Δ` 3048 | `room-look` 3047<br>`full=false` `sliders.curl` | `sliders.curl`=30 |
| 4 | curl 40 | `room-look Δ` 3311 | `room-look` 3309<br>`full=false` `sliders.curl` | `sliders.curl`=40 |
| 5 | Glow toggle (#glowToggle, shared checkbox) | `room-look Δ` 3575 | `room-look` 3576<br>`full=false` `checkboxes.glowToggle` | `checkboxes.glowToggle`=true |
| 6 | Breathing pattern -> box (#breathPattern, shared select) | `room-look Δ` 3837 | `room-look` 3837<br>`full=false` `selects.breathPattern` | `selects.breathPattern`="box" |
| 7 | palette: next in the list (.cp-pal-select in the colour popover) | `room-look Δ` 4106 | `room-look` 4105<br>`full=false` `paletteIndex` `paletteName` `savedColors` | `paletteIndex`=2, `paletteName`="Ross' Sunset", `savedColors`=["#FF6347","#FFD700","#FF8C00","#8B4789","#FFF5EE"] |
| 8 | preset apply: Liquid opal (.mixer-preset-btn[data-preset="opal"] click) | `room-look Δ` 4408 | `room-look` 4412<br>`full=false` `checkboxes.displayShadingToggle` `checkboxes.glowToggle` `colors` `paletteIndex` `paletteName` `savedColors` `selects.breathPattern` `sliders.curl` `sliders.densityDissipation` `sliders.grainCleanup` `sliders.pressureDissipation` `sliders.pressureIteration` `sliders.ridges` `sliders.shadeGloss` `sliders.shadeRelief` `sliders.shadingIntensity` `sliders.sharpness` `sliders.velocityDissipation` `sliders.velocityInfluence` `sliders.vibrance` `sliders.viscosity` `sliders.wetDrying` `sliders.wetInfluence` | `sliders.curl`=14, `sliders.densityDissipation`=0.9992, `sliders.grainCleanup`=0.6, `sliders.pressureDissipation`=0.97, `sliders.pressureIteration`=35, `sliders.ridges`=0, `sliders.shadeGloss`=0.5, `sliders.shadeRelief`=0.8, `sliders.shadingIntensity`=0.9, `sliders.sharpness`=0.8, `sliders.velocityDissipation`=0.9985, `sliders.velocityInfluence`=2.5, `sliders.vibrance`=0.075, `sliders.viscosity`=0, `sliders.wetDrying`=3, `sliders.wetInfluence`=0, `checkboxes.displayShadingToggle`=true, `checkboxes.glowToggle`=false, `selects.breathPattern`="relaxed", `colors`={"background":"#080c16"}, `paletteIndex`=1, `paletteName`="Forest Serenity", `savedColors`=["#2AC9B7","#E9E3F1","#8B72D9"] |
| 9 | brush size 7 (#brushSize, PERSONAL: must not arrive) | — | — (nothing) |  |
| 10 | Multi-Brush arms 3 (#multiplier, brush category, PERSONAL) | — | — (nothing) |  |
| 11 | Random colour toggle (#randomColor, Brush section checkbox, PERSONAL) | — | — (nothing) |  |
| 12 | gravity pad write (Constant on + tap at (0, +0.8)) | `room-look Δ` 5477 | `room-look` 5478<br>`full=false` `gravity` | `gravity`={"on":true,"x":0,"y":0.8} |
| 13 | Clear (the strip's Clear button, onclick="clearCanvas()") | `clear` 5679 | `clear` 5677<br> | B ran `clearCanvas()` for the peer |

## Personal controls: confirmed absent from everything B received

| Key | Changed in step | In any `room-look` B received |
|---|---|---|
| `sliders.brushSize` | 9 | absent |
| `sliders.multiplier` | 10 | absent |
| `checkboxes.randomColor` | 11 | absent |
| `colors.brush` | 11 | absent |

Dropped by `dropPersonal` (js/06b-mp-look.js:80-94, via `isPersonalSlider` 06b:70-75): `brushSize` and `multiplier` are `category: "brush"` sliders (js/01a-param-registry.js:110-111 → `ROOM_LOOK_PERSONAL.sliderCategories`, 06b:56), `randomColor` is in `ROOM_LOOK_PERSONAL.checkboxes` (06b:57), and `colors.brush` is cut to `colors.background` (06b:90-93).

## What landed on each side after the sequence (+3000 ms)

| Value | A (acted) | B (received) | Shared? |
|---|---|---|---|
| `#curl` | 14 | 14 | yes (glides on B, 06c) |
| `#glowToggle` | false | false | yes |
| `#breathPattern` | "relaxed" | "relaxed" | yes |
| palette index | 1 | 1 | yes (`paletteIndex`, `savedColors`) |
| gravity | {"on":true,"x":0,"y":0.8} | {"on":true,"x":0,"y":0.8} | yes (`gravity`) |
| `#brushSize` | 7 | 1 | NO (personal) |
| `#multiplier` | 3 | 1 | NO (personal) |
| `#randomColor` | true | true | NO (personal) |
| `#fpsCap` | "0" | "0" | yes (pinned to 0 on both before the room) |

## Join phase, in order

| # | Direction | Type | Keys | Payload (normalised, trimmed) |
|---|---|---|---|---|
| 1 | A sent | `ping` |  | `{"type":"ping"}` |
| 2 | A sent | `room-look` | `full=true` `checkboxes.breathCueToggle` `checkboxes.breathingToggle` `checkboxes.colorGate` `checkboxes.displayShadingToggle` `checkboxes.ditherToggle` `checkboxes.enableLightShift` `checkboxes.enableLighting` `checkboxes.glowToggle` `checkboxes.kAnimateRot` `checkboxes.kaleidoToggle` `checkboxes.macCormackToggle` … (85) | `{"full":true,"snapshot":{"baseline":8,"checkboxes":{"breathCueToggle":true,"breathingToggle":false,"colorGate":true,"displayShadingToggle":false,"ditherToggle":…` |
| 3 | A recv | `connected` | `capacity` `locked` `role` `roomKind` `totalClients` | `{"capacity":8,"clientId":"<A>","locked":false,"role":"host","roomKind":"private","timestamp":0,"totalClients":1,"type":"connected"}` |
| 4 | A recv | `client-count` | `count` | `{"count":1,"timestamp":0,"type":"client-count"}` |
| 5 | A recv | `client-count` | `count` | `{"count":2,"timestamp":0,"type":"client-count"}` |
| 6 | B sent | `ping` |  | `{"type":"ping"}` |
| 7 | B recv | `connected` | `capacity` `locked` `role` `roomKind` `totalClients` | `{"capacity":8,"clientId":"<B>","locked":false,"role":"guest","roomKind":"private","timestamp":0,"totalClients":2,"type":"connected"}` |
| 8 | B recv | `client-count` | `count` | `{"count":2,"timestamp":0,"type":"client-count"}` |
| 9 | B recv | `room-look` | `full=true` `checkboxes.breathCueToggle` `checkboxes.breathingToggle` `checkboxes.colorGate` `checkboxes.displayShadingToggle` `checkboxes.ditherToggle` `checkboxes.enableLightShift` `checkboxes.enableLighting` `checkboxes.glowToggle` `checkboxes.kAnimateRot` `checkboxes.kaleidoToggle` `checkboxes.macCormackToggle` … (85) | `{"clientId":"<A>","full":true,"snapshot":{"baseline":8,"checkboxes":{"breathCueToggle":true,"breathingToggle":false,"colorGate":true,"displayShadingToggle":fals…` |

## Full welcome: the look A sent B (`room-look full=true`)

Sections: `baseline`, `checkboxes` (15), `colors` (1), `gravity` (3), `lightPos` (3), `lightShiftPath`, `material` (3), `paletteIndex`, `paletteName`, `resolution` (2), `savedColors`, `selects` (12), `sliders` (47), `ssOrigin`.

```json
{
 "baseline": 8,
 "checkboxes": {
  "breathCueToggle": true,
  "breathingToggle": false,
  "colorGate": true,
  "displayShadingToggle": false,
  "ditherToggle": false,
  "enableLightShift": false,
  "enableLighting": false,
  "glowToggle": false,
  "kAnimateRot": false,
  "kaleidoToggle": false,
  "macCormackToggle": true,
  "multigridToggle": true,
  "overflowToggle": false,
  "scatterBlockToggle": true,
  "scatterToggle": false
 },
 "colors": {
  "background": "#000000"
 },
 "gravity": {
  "on": false,
  "x": 0,
  "y": 0
 },
 "lightPos": {
  "enabled": false,
  "x": 0.5,
  "y": 0.5
 },
 "lightShiftPath": [],
 "material": {
  "amount": null,
  "mode": "fluid",
  "shape": 0
 },
 "paletteIndex": 1,
 "paletteName": "Forest Serenity",
 "resolution": {
  "dye": 2048,
  "sim": 1024
 },
 "savedColors": [
  "#2C5F2D",
  "#4A7856",
  "#8B4513",
  "#FFD700",
  "#F0EAD6"
 ],
 "selects": {
  "breathColorMode": "same",
  "breathPattern": "relaxed",
  "ditherPattern": "bayer",
  "ditherTone": "retro",
  "fpsCap": "0",
  "kaleidoMode": "1",
  "lightMode": "manual",
  "lightShiftMode": "replace",
  "physicsResolution": "1024",
  "scatterSource": "light",
  "shadeFormResolution": "256",
  "visualResolution": "2048"
 },
 "sliders": {
  "breathStrength": 0.5,
  "canvasOpacity": 100,
  "captureDimming": 80,
  "colorBlend": 0,
  "curl": 0,
  "densityDissipation": 0.99,
  "ditherLevels": 4,
  "ditherSize": 2,
  "glowIntensity": 0.8,
  "glowThreshold": 0.6,
  "grainCleanup": 0.75,
  "kAngle": 0,
  "kBlend": 1,
  "kSpinSpeed": 30,
  "kTwist": 0,
  "kZoom": 1,
  "kaleidoSegments": 12,
  "lightAmbient": 0.3,
  "lightIntensity": 0.5,
  "lightShiftIntensity": 0.5,
  "lightShiftSaturation": 1,
  "lightShiftSpeed": 0.5,
  "lightShiftThreshold": 0.85,
  "lightSpeed": 0.5,
  "mgCoarse": 8,
  "mgCycles": 2,
  "mgPost": 2,
  "mgPre": 2,
  "mgRelax": 1,
  "overflowBand": 2.5,
  "pressureDissipation": 0.95,
  "pressureIteration": 25,
  "ridges": 6,
  "scatterAmount": 0.5,
  "scatterReach": 1,
  "shadeGloss": 0.05,
  "shadeRelief": 0.1,
  "shadingIntensity": 2,
  "sharpness": 2,
  "symmetryHold": 0,
  "timeScale": 1,
  "velocityDissipation": 1.0009,
  "velocityInfluence": 2,
  "vibrance": 0.5,
  "viscosity": 0.3,
  "wetDrying": 4.5,
  "wetInfluence": 0.14
 },
 "ssOrigin": null
}
```

## Problems

None.
