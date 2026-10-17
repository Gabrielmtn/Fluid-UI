# Frame time and layout baseline (F2)

Captured 2026-10-17 at HEAD `c4796da` with Chrome/155.0.8059.80 (headless), viewport 1440×900 CSS px, DPR 1, `--ui-scale` 1, Node v25.9.0. Written by `prep/baseline/scripts/perf-trace.js`; 3 runs, each a fresh boot, one stroke, then one 60 s CDP trace in three phases of 20 s: **idle1** (sim running, no input), **drag** (left button held on the `#curl` fader with ~60 trusted mouse moves/s sweeping its track), **idle2**.

**Headless numbers are relative, not the user's machine.** Headless Chrome paces requestAnimationFrame from its own synthetic BeginFrame source, not a display (the rAF tick interval it produced here is under *Informational metrics*), the app's own FPS Limit decides which ticks draw, and rendering goes through the GPU path named under *GPU renderer* below; absolute frame times say nothing about Gabriel's 144 Hz panel or the Electron build. The gate is the same capture before and after a CSS step on the same machine, read against the run-to-run noise measured here (noise = max − min over the runs; gate = mean + noise).

## Environment (run 1; the other runs agree unless noted under *Run-to-run differences*)

| Fact | Value |
|---|---|
| Date | 2026-10-17T13:45:16.896Z |
| HEAD | c4796dac21008b26528e57f813425ffb7bd58490 |
| Chrome | Chrome/155.0.8059.80 (protocol 1.3, V8 15.5.35.23) |
| Build | web build in headless Chrome (Emulation.setDeviceMetricsOverride 1440x900 @1, scratch profile) |
| Viewport / DPR / --ui-scale | 1440×900 / 1 / 1 |
| Canvas (drawing buffer) / wrapper | 864x741 / 864x741 |
| GPU renderer (UNMASKED_RENDERER_WEBGL) | `ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| gl.RENDERER / vendor / version | `WebKit WebGL` / `Google Inc. (NVIDIA)` / `WebGL 2.0 (OpenGL ES 3.0 Chromium)` |
| WebGL2 | true |
| fpsCap / locked / measured Hz (known) | 60 / true / 120 (true) |
| Dye / sim resolution (config), pressure iterations | 2048 / 1024, 25 |
| Governor at boot (level, scales) | L0, enabled true, allowResolution true, scales 1/1 |
| Boot ascent settled | true after 3.16 s (final scales 1/1, level 0, 1 state changes) |
| PerfTiers.describe() | `{"dye":2048,"sim":1024,"dyeLive":"2048x1756","simLive":"1024x878","iters":25,"mgShaped":true,"mg":{"cycles":2,"pre":2,"post":2,"coarse":8},"oversample":1,"substepsEffective":1,"substepGate":true,"renderScale":1,"buffer":"864x741","glow":256,"scatter":512,"shadeForm":256,"vramMB":160.8,"governor":{"enabled":true,"allowResolution":true,"level":0,"cpuEma":0.1528415396253533,"upDwell":5,"slowdown":{"shown":"none","paintLevel":0,"rescue":false,"idleFps":65.2431791225671,"wavedOff":0}}}` |
| __perf.probe() | timerQuery true, maxTextureSize 16384, cores 32, deviceMemory 32 GB, canvas 864x741 |
| Material type / curl at boot | fluid / 0 |
| Left bar folded / open sections | false / Brush |
| Strip cells parked in More | none |
| Stroke | 49 trusted points across the canvas, 121 frames drawn meanwhile |
| Drag target | `#curl` (channel Fluid, canonical input, rect 166×30 at 14,25) |
| Trace | trace-1.json.gz (162.7 MB raw, 9.7 MB gz, 819952 events, 66 s, buffer max 0.27%); trace-2.json.gz (161.7 MB raw, 9.7 MB gz, 814296 events, 65.95 s, buffer max 0.26%); trace-3.json.gz (163.2 MB raw, 9.7 MB gz, 822611 events, 65.96 s, buffer max 0.27%) |
| Trace categories | `devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,v8.execute` |
| Renderer process / threads | Renderer (TracingStartedInBrowser); Compositor (42848), CrRendererMain (27024), PerfettoTrace (49664), Chrome_ChildIOThread (40720), ThreadPoolForegroundWorker (30304), ThreadPoolForegroundWorker (18044), ThreadPoolForegroundWorker (36516), ThreadPoolServiceThread (38752), MemoryInfra (10980) |
| Phase boundaries | marks; marks; marks |
| Long-task source | RunTask > 50 ms |
| Trace metadata | {"gpu":"ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.16.1088)"} |

### Run-to-run differences in the environment

- boot ascent settled after 3.16 s / 3.15 s / 3.15 s (outcome identical)
- none: Chrome build, viewport, DPR, `--ui-scale`, GPU renderer, canvas size, fps cap, measured Hz, resolutions, material type, boot-ascent outcome and drag target agree in every run

## Gated metrics, the runs side by side

`--check` re-captures once and flags a metric whose value is **above** gate = mean + noise, noise = max − min over these runs (higher is worse for every row); the timing rows (`interval.*`, `frameWork.*`, `msPerFrame.*`) also have to exceed the gate by 2 % of it (`--tolerance-pct`, see NOTES.md for why), the count rows fail on anything above it. **Frame** = a main-thread frame (`BeginMainThreadFrame` on the renderer main thread, the unit in which style recalc, layout, paint and commit run); "/ frame" divides by its count. rAF ticks and rAF callbacks are reported separately: every tick fires every registered callback (about six: 05j `update`, the jank monitor, light source / light shift, the audio editors, the brush cursor), so `FireAnimationFrame` counts callbacks, not frames. The **frame interval** is DrawFrame-to-DrawFrame on the renderer's Compositor thread, i.e. the frames that were actually drawn under the app's FPS Limit (cross-checked against the app's own `__drawSerial`). **Frame work per tick** is the sum of one tick's rAF callback durations. **Forced synchronous layouts** are Layout events nested inside a script event (FunctionCall, EventDispatch, TimerFire, FireAnimationFrame, …): JavaScript asked for geometry before the frame's own layout; forced style recalcs the same for UpdateLayoutTree. (Layout events carry no stack trace without the `disabled-by-default-devtools.timeline.stack` category, so DevTools' own "forced reflow" flag is not available here; nesting is the signal.)

### idle1 (idle, sim running)

| metric | run 1 | run 2 | run 3 | mean | noise (max−min) | gate (mean+noise) |
|---|---:|---:|---:|---:|---:|---:|
| frame interval median (ms) (`interval.median`) | 15.289 | 15.296 | 15.266 | 15.284 | 0.030 | 15.314 |
| frame interval p95 (ms) (`interval.p95`) | 16.300 | 16.255 | 16.209 | 16.255 | 0.091 | 16.346 |
| rAF frame work per tick p95 (ms) (`frameWork.p95`) | 0.234 | 0.246 | 0.241 | 0.240 | 0.012 | 0.252 |
| long tasks > 50 ms (`longTasks.count`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout / frame (`perFrame.Layout`) | 0 | 0 | 0 | 0 | 0 | 0 |
| UpdateLayoutTree (style recalc) / frame (`perFrame.UpdateLayoutTree`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Paint / frame (`perFrame.Paint`) | 0 | 0 | 0 | 0 | 0 | 0 |
| PrePaint / frame (`perFrame.PrePaint`) | 1 | 1 | 1 | 1 | 0 | 1 |
| Layerize / frame (`perFrame.Layerize`) | 1 | 1 | 1 | 1 | 0 | 1 |
| Commit / frame (`perFrame.Commit`) | 1 | 1 | 1 | 1 | 0 | 1 |
| CompositeLayers / frame (`perFrame.CompositeLayers`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout ms / frame (`msPerFrame.Layout`) | 0 | 0 | 0 | 0 | 0 | 0 |
| UpdateLayoutTree ms / frame (`msPerFrame.UpdateLayoutTree`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Paint ms / frame (`msPerFrame.Paint`) | 0 | 0 | 0 | 0 | 0 | 0 |
| main thread busy ms / frame (`msPerFrame.mainBusy`) | 0.270 | 0.273 | 0.269 | 0.270 | 0.004 | 0.274 |
| forced synchronous layouts / frame (`forced.layoutsPerFrame`) | 0 | 0 | 0 | 0 | 0 | 0 |
| forced style recalcs / frame (`forced.styleRecalcsPerFrame`) | 0 | 0 | 0 | 0 | 0 | 0 |

Governor level / effective dye scale during the phase: L0 / 1; L0 / 1; L0 / 1. App frames drawn (`__drawSerial`): 1305 / 1305 / 1307.

### drag (dragging the fader)

| metric | run 1 | run 2 | run 3 | mean | noise (max−min) | gate (mean+noise) |
|---|---:|---:|---:|---:|---:|---:|
| frame interval median (ms) (`interval.median`) | 14.664 | 14.825 | 14.583 | 14.691 | 0.242 | 14.933 |
| frame interval p95 (ms) (`interval.p95`) | 16.680 | 16.762 | 16.497 | 16.646 | 0.265 | 16.911 |
| rAF frame work per tick p95 (ms) (`frameWork.p95`) | 0.420 | 0.427 | 0.420 | 0.422 | 0.007 | 0.429 |
| long tasks > 50 ms (`longTasks.count`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout / frame (`perFrame.Layout`) | 0.217 | 0.217 | 0.217 | 0.217 | 0.000 | 0.217 |
| UpdateLayoutTree (style recalc) / frame (`perFrame.UpdateLayoutTree`) | 0.217 | 0.217 | 0.217 | 0.217 | 0.000 | 0.217 |
| Paint / frame (`perFrame.Paint`) | 0.688 | 0.688 | 0.683 | 0.686 | 0.005 | 0.692 |
| PrePaint / frame (`perFrame.PrePaint`) | 1.010 | 1.010 | 1.009 | 1.009 | 0.001 | 1.010 |
| Layerize / frame (`perFrame.Layerize`) | 1 | 1 | 1 | 1 | 0 | 1 |
| Commit / frame (`perFrame.Commit`) | 1 | 1 | 1 | 1 | 0 | 1 |
| CompositeLayers / frame (`perFrame.CompositeLayers`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout ms / frame (`msPerFrame.Layout`) | 0.032 | 0.032 | 0.032 | 0.032 | 0.001 | 0.033 |
| UpdateLayoutTree ms / frame (`msPerFrame.UpdateLayoutTree`) | 0.024 | 0.023 | 0.024 | 0.023 | 0.000 | 0.024 |
| Paint ms / frame (`msPerFrame.Paint`) | 0.041 | 0.040 | 0.040 | 0.040 | 0.001 | 0.041 |
| main thread busy ms / frame (`msPerFrame.mainBusy`) | 0.433 | 0.424 | 0.440 | 0.432 | 0.015 | 0.448 |
| forced synchronous layouts / frame (`forced.layoutsPerFrame`) | 0.216 | 0.216 | 0.215 | 0.216 | 0.000 | 0.216 |
| forced style recalcs / frame (`forced.styleRecalcsPerFrame`) | 0.216 | 0.216 | 0.215 | 0.216 | 0.000 | 0.216 |

Drag: 1195 moves in 19.93 s = 60 Hz (max gap 39 ms); 1195 moves in 19.92 s = 60 Hz (max gap 39 ms); 1194 moves in 19.91 s = 60 Hz (max gap 40 ms). Curl value seen: 0–58; 0–58; 0–58.
Governor level / effective dye scale during the phase: L0 / 1; L0 / 1; L0 / 1. App frames drawn (`__drawSerial`): 1305 / 1300 / 1306.

### idle2 (idle, sim running)

| metric | run 1 | run 2 | run 3 | mean | noise (max−min) | gate (mean+noise) |
|---|---:|---:|---:|---:|---:|---:|
| frame interval median (ms) (`interval.median`) | 15.318 | 15.327 | 15.276 | 15.307 | 0.051 | 15.358 |
| frame interval p95 (ms) (`interval.p95`) | 16.202 | 16.285 | 16.248 | 16.245 | 0.083 | 16.328 |
| rAF frame work per tick p95 (ms) (`frameWork.p95`) | 0.187 | 0.184 | 0.187 | 0.186 | 0.003 | 0.189 |
| long tasks > 50 ms (`longTasks.count`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout / frame (`perFrame.Layout`) | 0 | 0 | 0 | 0 | 0 | 0 |
| UpdateLayoutTree (style recalc) / frame (`perFrame.UpdateLayoutTree`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Paint / frame (`perFrame.Paint`) | 0.001 | 0.001 | 0.001 | 0.001 | 0 | 0.001 |
| PrePaint / frame (`perFrame.PrePaint`) | 1.000 | 1.000 | 1.000 | 1.000 | 0 | 1.000 |
| Layerize / frame (`perFrame.Layerize`) | 1 | 1 | 1 | 1 | 0 | 1 |
| Commit / frame (`perFrame.Commit`) | 1 | 1 | 1 | 1 | 0 | 1 |
| CompositeLayers / frame (`perFrame.CompositeLayers`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout ms / frame (`msPerFrame.Layout`) | 0 | 0 | 0 | 0 | 0 | 0 |
| UpdateLayoutTree ms / frame (`msPerFrame.UpdateLayoutTree`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Paint ms / frame (`msPerFrame.Paint`) | 0 | 0 | 0 | 0 | 0 | 0 |
| main thread busy ms / frame (`msPerFrame.mainBusy`) | 0.226 | 0.230 | 0.239 | 0.232 | 0.013 | 0.244 |
| forced synchronous layouts / frame (`forced.layoutsPerFrame`) | 0 | 0 | 0 | 0 | 0 | 0 |
| forced style recalcs / frame (`forced.styleRecalcsPerFrame`) | 0 | 0 | 0 | 0 | 0 | 0 |

Governor level / effective dye scale during the phase: L0 / 1; L0 / 1; L0 / 1. App frames drawn (`__drawSerial`): 1305 / 1304 / 1308.

## Informational metrics (reported, not gated)

### idle1

| metric | run 1 | run 2 | run 3 | mean | noise (max−min) | gate (mean+noise) |
|---|---:|---:|---:|---:|---:|---:|
| main-thread frames (BeginMainThreadFrame) (`frames.main`) | 2609 | 2610 | 2613 | 2610.7 | 4 | 2614.7 |
| DrawFrame count (compositor) (`frames.draw`) | 1305 | 1305 | 1307 | 1305.7 | 2 | 1307.7 |
| rAF ticks (`frames.rafTicks`) | 2609 | 2610 | 2613 | 2610.7 | 4 | 2614.7 |
| rAF callbacks (FireAnimationFrame) (`frames.rafCallbacks`) | 18263 | 18270 | 18291 | 18274.7 | 28 | 18302.7 |
| app frames drawn (__drawSerial delta) (`frames.drawSerial`) | 1305 | 1305 | 1307 | 1305.7 | 2 | 1307.7 |
| frame interval mean (ms) (`interval.mean`) | 15.331 | 15.333 | 15.320 | 15.328 | 0.013 | 15.341 |
| frame interval max (ms) (`interval.max`) | 25.199 | 21.240 | 18.469 | 21.636 | 6.730 | 28.366 |
| rAF tick interval median (ms) (`tickInterval.median`) | 7.629 | 7.633 | 7.630 | 7.631 | 0.004 | 7.635 |
| rAF tick interval p95 (ms) (`tickInterval.p95`) | 8.301 | 8.258 | 8.285 | 8.281 | 0.043 | 8.324 |
| rAF frame work per tick median (ms) (`frameWork.median`) | 0.142 | 0.148 | 0.149 | 0.146 | 0.007 | 0.153 |
| rAF frame work per tick max (ms) (`frameWork.max`) | 0.416 | 0.637 | 0.575 | 0.543 | 0.221 | 0.764 |
| single rAF callback p95 (ms) (`rafCallbackDur.p95`) | 0.099 | 0.102 | 0.102 | 0.101 | 0.003 | 0.104 |
| longest top-level task (ms) (`longTasks.maxMs`) | 8.710 | 5.250 | 2.350 | 5.437 | 6.360 | 11.797 |
| UpdateLayerTree / frame (`perFrame.UpdateLayerTree`) | 0 | 0 | 0 | 0 | 0 | 0 |
| HitTest / frame (`perFrame.HitTest`) | 0.015 | 0.015 | 0.015 | 0.015 | 0 | 0.015 |
| EventDispatch / frame (`perFrame.EventDispatch`) | 0 | 0 | 0 | 0 | 0 | 0 |
| FunctionCall / frame (`perFrame.FunctionCall`) | 7.207 | 7.207 | 7.206 | 7.206 | 0.000 | 7.207 |
| TimerFire / frame (`perFrame.TimerFire`) | 0.161 | 0.161 | 0.161 | 0.161 | 0.000 | 0.162 |
| FunctionCall ms / frame (`msPerFrame.FunctionCall`) | 0.124 | 0.129 | 0.130 | 0.128 | 0.005 | 0.133 |
| EventDispatch ms / frame (`msPerFrame.EventDispatch`) | 0 | 0 | 0 | 0 | 0 | 0 |
| forced synchronous layouts (count) (`forced.layoutsInScript`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout events with a stack trace (count) (`forced.layoutsWithStack`) | 0 | 0 | 0 | 0 | 0 | 0 |
| forced style recalcs (count) (`forced.styleRecalcsInScript`) | 0 | 0 | 0 | 0 | 0 | 0 |
| InvalidateLayout (count) (`forced.invalidateLayout`) | 0 | 0 | 0 | 0 | 0 | 0 |
| ScheduleStyleRecalculation (count) (`forced.scheduleStyleRecalc`) | 0 | 0 | 0 | 0 | 0 | 0 |
| __stats.fps mean (`stats.fps.mean`) | 65.825 | 65.825 | 65.800 | 65.817 | 0.025 | 65.842 |
| __stats.frametime median (ms) (`stats.frametime.median`) | 15.300 | 15.200 | 15.300 | 15.267 | 0.100 | 15.367 |
| __stats.lastCpuMs median (`stats.cpu.median`) | 0.100 | 0.100 | 0.100 | 0.100 | 0 | 0.100 |
| __stats.lastCpuMs p95 (`stats.cpu.p95`) | 0.200 | 0.200 | 0.200 | 0.200 | 0 | 0.200 |
| __stats.budgetPct median (`stats.budgetPct.median`) | 0.600 | 0.600 | 0.600 | 0.600 | 0 | 0.600 |

### drag

| metric | run 1 | run 2 | run 3 | mean | noise (max−min) | gate (mean+noise) |
|---|---:|---:|---:|---:|---:|---:|
| main-thread frames (BeginMainThreadFrame) (`frames.main`) | 2609 | 2601 | 2612 | 2607.3 | 11 | 2618.3 |
| DrawFrame count (compositor) (`frames.draw`) | 1588 | 1526 | 1604 | 1572.7 | 78 | 1650.7 |
| rAF ticks (`frames.rafTicks`) | 2609 | 2601 | 2612 | 2607.3 | 11 | 2618.3 |
| rAF callbacks (FireAnimationFrame) (`frames.rafCallbacks`) | 15671 | 15623 | 15687 | 15660.3 | 64 | 15724.3 |
| app frames drawn (__drawSerial delta) (`frames.drawSerial`) | 1305 | 1300 | 1306 | 1303.7 | 6 | 1309.7 |
| frame interval mean (ms) (`interval.mean`) | 12.567 | 13.069 | 12.437 | 12.691 | 0.632 | 13.323 |
| frame interval max (ms) (`interval.max`) | 19.374 | 18.901 | 24.134 | 20.803 | 5.233 | 26.036 |
| rAF tick interval median (ms) (`tickInterval.median`) | 7.639 | 7.663 | 7.607 | 7.636 | 0.056 | 7.692 |
| rAF tick interval p95 (ms) (`tickInterval.p95`) | 8.251 | 8.291 | 8.260 | 8.267 | 0.040 | 8.307 |
| rAF frame work per tick median (ms) (`frameWork.median`) | 0.138 | 0.136 | 0.142 | 0.139 | 0.006 | 0.145 |
| rAF frame work per tick max (ms) (`frameWork.max`) | 0.729 | 0.623 | 0.670 | 0.674 | 0.106 | 0.780 |
| single rAF callback p95 (ms) (`rafCallbackDur.p95`) | 0.116 | 0.117 | 0.122 | 0.118 | 0.006 | 0.124 |
| longest top-level task (ms) (`longTasks.maxMs`) | 2.070 | 3.510 | 8.280 | 4.620 | 6.210 | 10.830 |
| UpdateLayerTree / frame (`perFrame.UpdateLayerTree`) | 0 | 0 | 0 | 0 | 0 | 0 |
| HitTest / frame (`perFrame.HitTest`) | 0.018 | 0.018 | 0.018 | 0.018 | 0.000 | 0.018 |
| EventDispatch / frame (`perFrame.EventDispatch`) | 1.141 | 1.144 | 1.139 | 1.141 | 0.005 | 1.146 |
| FunctionCall / frame (`perFrame.FunctionCall`) | 11.660 | 11.673 | 11.649 | 11.661 | 0.024 | 11.685 |
| TimerFire / frame (`perFrame.TimerFire`) | 0.161 | 0.161 | 0.160 | 0.161 | 0.001 | 0.161 |
| FunctionCall ms / frame (`msPerFrame.FunctionCall`) | 0.177 | 0.175 | 0.179 | 0.177 | 0.005 | 0.182 |
| EventDispatch ms / frame (`msPerFrame.EventDispatch`) | 0.060 | 0.059 | 0.060 | 0.060 | 0.001 | 0.061 |
| forced synchronous layouts (count) (`forced.layoutsInScript`) | 563 | 561 | 563 | 562.3 | 2 | 564.3 |
| Layout events with a stack trace (count) (`forced.layoutsWithStack`) | 0 | 0 | 0 | 0 | 0 | 0 |
| forced style recalcs (count) (`forced.styleRecalcsInScript`) | 563 | 561 | 563 | 562.3 | 2 | 564.3 |
| InvalidateLayout (count) (`forced.invalidateLayout`) | 568 | 566 | 568 | 567.3 | 2 | 569.3 |
| ScheduleStyleRecalculation (count) (`forced.scheduleStyleRecalc`) | 567 | 565 | 567 | 566.3 | 2 | 568.3 |
| __stats.fps mean (`stats.fps.mean`) | 65.974 | 65.821 | 66.026 | 65.940 | 0.205 | 66.145 |
| __stats.frametime median (ms) (`stats.frametime.median`) | 15.200 | 15.300 | 15.400 | 15.300 | 0.200 | 15.500 |
| __stats.lastCpuMs median (`stats.cpu.median`) | 0.100 | 0.100 | 0.100 | 0.100 | 0 | 0.100 |
| __stats.lastCpuMs p95 (`stats.cpu.p95`) | 0.400 | 0.400 | 0.300 | 0.367 | 0.100 | 0.467 |
| __stats.budgetPct median (`stats.budgetPct.median`) | 0.600 | 0.600 | 0.600 | 0.600 | 0 | 0.600 |

### idle2

| metric | run 1 | run 2 | run 3 | mean | noise (max−min) | gate (mean+noise) |
|---|---:|---:|---:|---:|---:|---:|
| main-thread frames (BeginMainThreadFrame) (`frames.main`) | 2610 | 2607 | 2617 | 2611.3 | 10 | 2621.3 |
| DrawFrame count (compositor) (`frames.draw`) | 1306 | 1304 | 1309 | 1306.3 | 5 | 1311.3 |
| rAF ticks (`frames.rafTicks`) | 2610 | 2607 | 2617 | 2611.3 | 10 | 2621.3 |
| rAF callbacks (FireAnimationFrame) (`frames.rafCallbacks`) | 15660 | 15642 | 15702 | 15668 | 60 | 15728 |
| app frames drawn (__drawSerial delta) (`frames.drawSerial`) | 1305 | 1304 | 1308 | 1305.7 | 4 | 1309.7 |
| frame interval mean (ms) (`interval.mean`) | 15.324 | 15.347 | 15.291 | 15.321 | 0.056 | 15.377 |
| frame interval max (ms) (`interval.max`) | 17.460 | 17.632 | 23.647 | 19.580 | 6.187 | 25.767 |
| rAF tick interval median (ms) (`tickInterval.median`) | 7.645 | 7.649 | 7.612 | 7.635 | 0.037 | 7.672 |
| rAF tick interval p95 (ms) (`tickInterval.p95`) | 8.286 | 8.289 | 8.224 | 8.266 | 0.065 | 8.331 |
| rAF frame work per tick median (ms) (`frameWork.median`) | 0.111 | 0.111 | 0.110 | 0.111 | 0.001 | 0.112 |
| rAF frame work per tick max (ms) (`frameWork.max`) | 0.355 | 0.339 | 0.355 | 0.350 | 0.016 | 0.366 |
| single rAF callback p95 (ms) (`rafCallbackDur.p95`) | 0.097 | 0.098 | 0.099 | 0.098 | 0.002 | 0.100 |
| longest top-level task (ms) (`longTasks.maxMs`) | 3.100 | 3.130 | 9.450 | 5.227 | 6.350 | 11.577 |
| UpdateLayerTree / frame (`perFrame.UpdateLayerTree`) | 0 | 0 | 0 | 0 | 0 | 0 |
| HitTest / frame (`perFrame.HitTest`) | 0.016 | 0.016 | 0.016 | 0.016 | 0 | 0.016 |
| EventDispatch / frame (`perFrame.EventDispatch`) | 0 | 0 | 0 | 0 | 0 | 0 |
| FunctionCall / frame (`perFrame.FunctionCall`) | 6.208 | 6.208 | 6.207 | 6.208 | 0.001 | 6.208 |
| TimerFire / frame (`perFrame.TimerFire`) | 0.161 | 0.161 | 0.161 | 0.161 | 0.001 | 0.161 |
| FunctionCall ms / frame (`msPerFrame.FunctionCall`) | 0.095 | 0.096 | 0.097 | 0.096 | 0.002 | 0.098 |
| EventDispatch ms / frame (`msPerFrame.EventDispatch`) | 0 | 0 | 0 | 0 | 0 | 0 |
| forced synchronous layouts (count) (`forced.layoutsInScript`) | 0 | 0 | 0 | 0 | 0 | 0 |
| Layout events with a stack trace (count) (`forced.layoutsWithStack`) | 0 | 0 | 0 | 0 | 0 | 0 |
| forced style recalcs (count) (`forced.styleRecalcsInScript`) | 0 | 0 | 0 | 0 | 0 | 0 |
| InvalidateLayout (count) (`forced.invalidateLayout`) | 0 | 0 | 0 | 0 | 0 | 0 |
| ScheduleStyleRecalculation (count) (`forced.scheduleStyleRecalc`) | 0 | 0 | 0 | 0 | 0 | 0 |
| __stats.fps mean (`stats.fps.mean`) | 65.775 | 65.700 | 65.875 | 65.783 | 0.175 | 65.958 |
| __stats.frametime median (ms) (`stats.frametime.median`) | 15.400 | 15.400 | 15.100 | 15.300 | 0.300 | 15.600 |
| __stats.lastCpuMs median (`stats.cpu.median`) | 0.100 | 0.100 | 0.100 | 0.100 | 0 | 0.100 |
| __stats.lastCpuMs p95 (`stats.cpu.p95`) | 0.200 | 0.200 | 0.200 | 0.200 | 0 | 0.200 |
| __stats.budgetPct median (`stats.budgetPct.median`) | 0.600 | 0.600 | 0.600 | 0.600 | 0 | 0.600 |

## Where the Layout and UpdateLayoutTree events sit (parent event → count, every run)

A Layout whose parent is `RunTask` is the frame's own layout (BeginMainThreadFrame → UpdateLayoutTree → Layout → PrePaint → Paint → Commit); one whose parent is `FunctionCall` / `EventDispatch` / `TimerFire` was forced by script.

| run | phase | Layout parents | UpdateLayoutTree parents |
|---|---|---|---|
| 1 | idle1 | — | — |
| 1 | drag | FunctionCall 563, RunTask 3 | FunctionCall 563, RunTask 4 |
| 1 | idle2 | — | — |
| 2 | idle1 | — | — |
| 2 | drag | FunctionCall 561, RunTask 3 | FunctionCall 561, RunTask 4 |
| 2 | idle2 | — | — |
| 3 | idle1 | — | — |
| 3 | drag | FunctionCall 563, RunTask 3 | FunctionCall 563, RunTask 4 |
| 3 | idle2 | — | — |

## The script sites that forced them (innermost script event first, every run)

| run | phase | forced Layout sites | forced UpdateLayoutTree sites |
|---|---|---|---|
| 1 | idle1 | — | — |
| 1 | drag | FunctionCall draw 40b-audio-cue-editor.js:123 &lt;- FireAnimationFrame 282, FunctionCall update 05j-update-loop.js:390 &lt;- FireAnimationFrame 281 | FunctionCall draw 40b-audio-cue-editor.js:123 &lt;- FireAnimationFrame 282, FunctionCall update 05j-update-loop.js:390 &lt;- FireAnimationFrame 281 |
| 1 | idle2 | — | — |
| 2 | idle1 | — | — |
| 2 | drag | FunctionCall update 05j-update-loop.js:390 &lt;- FireAnimationFrame 335, FunctionCall draw 40b-audio-cue-editor.js:123 &lt;- FireAnimationFrame 226 | FunctionCall update 05j-update-loop.js:390 &lt;- FireAnimationFrame 335, FunctionCall draw 40b-audio-cue-editor.js:123 &lt;- FireAnimationFrame 226 |
| 2 | idle2 | — | — |
| 3 | idle1 | — | — |
| 3 | drag | FunctionCall draw 40b-audio-cue-editor.js:123 &lt;- FireAnimationFrame 297, FunctionCall update 05j-update-loop.js:390 &lt;- FireAnimationFrame 266 | FunctionCall draw 40b-audio-cue-editor.js:123 &lt;- FireAnimationFrame 297, FunctionCall update 05j-update-loop.js:390 &lt;- FireAnimationFrame 266 |
| 3 | idle2 | — | — |

## Longest top-level main-thread tasks per phase (run 1)

| phase | ms | at (s into phase) | event | biggest children |
|---|---:|---:|---|---|
| idle1 | 8.71 | 10.954 | RunTask | Commit 8.41 ms; FireAnimationFrame 0.25 ms; PrePaint 0.02 ms |
| idle1 | 3.77 | 3.274 | RunTask | Commit 3.45 ms; FireAnimationFrame 0.27 ms; PrePaint 0.02 ms |
| idle1 | 1.61 | 3.305 | RunTask | Commit 1.24 ms; FireAnimationFrame 0.25 ms; PrePaint 0.02 ms |
| idle1 | 1.43 | 18.094 | RunTask | Commit 1.16 ms; FireAnimationFrame 0.23 ms; PrePaint 0.01 ms |
| idle1 | 1.42 | 13.821 | RunTask | Commit 1.16 ms; FireAnimationFrame 0.21 ms; PrePaint 0.02 ms |
| drag | 2.07 | 0.005 | RunTask | EventDispatch 1.40 ms; UpdateLayoutTree 0.19 ms; Layout 0.17 ms |
| drag | 1.98 | 14.75 | RunTask | Commit 0.81 ms; FireAnimationFrame 0.58 ms; Paint 0.14 ms |
| drag | 1.59 | 3.615 | RunTask | FireAnimationFrame 0.38 ms; Paint 0.34 ms; EventDispatch 0.17 ms |
| drag | 1.58 | 0.265 | RunTask | FireAnimationFrame 0.63 ms; Commit 0.22 ms; Paint 0.20 ms |
| drag | 1.49 | 11.014 | RunTask | Commit 1.10 ms; FireAnimationFrame 0.19 ms; EventDispatch 0.07 ms |
| idle2 | 3.1 | 6.769 | RunTask |  |
| idle2 | 2.02 | 10.778 | RunTask |  |
| idle2 | 1.5 | 12.266 | RunTask | Commit 1.24 ms; FireAnimationFrame 0.19 ms; PrePaint 0.02 ms |
| idle2 | 1.44 | 17.369 | RunTask | Commit 1.19 ms; FireAnimationFrame 0.20 ms; PrePaint 0.02 ms |
| idle2 | 1.3 | 7.859 | RunTask | Commit 1.07 ms; FireAnimationFrame 0.17 ms; PrePaint 0.02 ms |

## What the trace contains (run 1, main thread, top 40 event names by count)

| event | idle1 count | idle1 ms | drag count | drag ms | idle2 count | idle2 ms |
|---|---:|---:|---:|---:|---:|---:|
| UpdateCounters | 18825 | 0 | 30444 | 0 | 16222 | 0 |
| FunctionCall | 18802 | 324.9 | 30422 | 462.2 | 16202 | 247.4 |
| UpdateLayer | 16965 | 5.8 | 19056 | 6.5 | 15672 | 4.5 |
| RunTask | 12556 | 704 | 16884 | 1129.6 | 12206 | 590.4 |
| FireAnimationFrame | 18263 | 356.4 | 15671 | 419.1 | 15660 | 270.6 |
| RequestAnimationFrame | 18263 | 0 | 15671 | 0 | 15660 | 0 |
| IntersectionObserverController::computeIntersections | 5218 | 5.8 | 5235 | 5.5 | 5220 | 4.7 |
| EventDispatch | 0 | 0 | 2977 | 155.6 | 0 | 0 |
| SetLayerTreeId | 2609 | 0 | 2634 | 0 | 2611 | 0 |
| PrePaint | 2609 | 27.5 | 2634 | 43.2 | 2611 | 27.2 |
| BeginMainThreadFrame | 2609 | 0 | 2609 | 0 | 2610 | 0 |
| Layerize | 2609 | 1.8 | 2609 | 35.6 | 2610 | 1.8 |
| Commit | 2609 | 140.5 | 2609 | 130.2 | 2610 | 117.3 |
| BeginCommitCompositorFrame | 2609 | 0 | 2609 | 0 | 2610 | 0 |
| PaintImage | 0 | 0 | 1891 | 9.1 | 0 | 0 |
| Paint | 0 | 0 | 1795 | 106.1 | 0 | 0 |
| RunMicrotasks | 60 | 1.5 | 627 | 17.8 | 62 | 1.3 |
| DOMStats | 45 | 0 | 595 | 0 | 52 | 0 |
| InvalidateLayout | 0 | 0 | 568 | 0 | 0 | 0 |
| ScheduleStyleRecalculation | 0 | 0 | 567 | 0 | 0 | 0 |
| UpdateLayoutTree | 0 | 0 | 567 | 61.2 | 0 | 0 |
| Layout | 0 | 0 | 566 | 84.5 | 0 | 0 |
| TimerFire | 421 | 22.6 | 419 | 30.2 | 420 | 24.6 |
| V8.GC_MC_INCREMENTAL | 87 | 3.1 | 151 | 7 | 54 | 2.6 |
| V8.GC_MC_INCREMENTAL_EMBEDDER_TRACING | 87 | 1.9 | 151 | 4.3 | 54 | 1.4 |
| Major concurrent marking rescheduled | 40 | 0 | 95 | 0 | 48 | 0 |
| HitTest | 40 | 0.6 | 46 | 0.8 | 41 | 0.5 |
| V8.BytecodeBudgetInterrupt | 38 | 0.1 | 39 | 0.1 | 0 | 0 |
| V8.StackGuard | 30 | 0.5 | 33 | 0.6 | 0 | 0 |
| V8.HandleInterrupts | 30 | 0.5 | 33 | 0.6 | 0 | 0 |
| V8.GC_TIME_TO_SAFEPOINT | 23 | 0 | 22 | 0 | 20 | 0 |
| V8.GC_HEAP_EXTERNAL_PROLOGUE | 22 | 0.1 | 20 | 0.1 | 19 | 0 |
| V8.GC_HEAP_PROLOGUE | 22 | 0 | 20 | 0 | 19 | 0 |
| V8.GC_HEAP_PROLOGUE_SAFEPOINT | 22 | 0 | 20 | 0 | 19 | 0 |
| V8.GC_HEAP_EPILOGUE_SAFEPOINT | 22 | 0 | 20 | 0 | 19 | 0 |
| V8.GC_HEAP_EPILOGUE | 22 | 0.1 | 20 | 0.2 | 19 | 0.1 |
| V8.GC_HEAP_EXTERNAL_EPILOGUE | 22 | 0.1 | 20 | 0.1 | 19 | 0.1 |
| MinorGC | 21 | 7.8 | 18 | 5.7 | 18 | 5.9 |
| V8.GC_SCAVENGER | 21 | 6 | 18 | 4.4 | 18 | 5 |
| V8.GC_SCAVENGER_SCAVENGE | 21 | 5.8 | 18 | 4.3 | 18 | 4.9 |

## Problems recorded by the runs

- none
