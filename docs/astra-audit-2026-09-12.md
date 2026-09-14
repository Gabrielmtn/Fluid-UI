# Swirl Together: persistent project knowledge and aesthetic investigation

## Investigation ledger — 2026-09-12

Scope: codebase, supplied artwork, deployed swirltogether.com experience, and opportunities for more compelling and shareable output. Application code is not being changed. This file is updated incrementally so a later session can resume. Distinguish verified source/runtime facts from visual judgments and untested growth hypotheses. No conversion or retention analytics have been supplied.

### Checkpoint 1: recovery and architecture

- The supplied Cascade handoff contains only the original user request, not previous investigation results.
- Working tree was clean at the start. Root source is authoritative; `public/` is generated, gitignored web output. `scripts/build-web.js` copies `index.html`, `js/`, `css/`, and `assets/`, and adds cache-busting parameters. Do not edit generated output.
- Vanilla JavaScript, ordered global scripts, WebGL fluid solver; Electron desktop shell and PartyKit/Cloudflare multiplayer backends. No React/Vue or application bundler.
- `package.json` documents `npm run dev`, `npm run serve`, `npm run build:web`, and desktop commands. Test scripts exist under `scripts/test/` despite no npm test script. Read their guidance before running.
- CAUTION: build:web clears the existing public directory contents; it is not a read-only verification command. Deploy commands publish to production. Neither is needed for this analysis.
- Existing capability map: `05a/05b` shaders; `05c` programs/FBOs; `05d0/05d` brush/input/replay; `05j/05k` update and rendering; `02` palettes; `29` material modes; `34` mandala; `24-video-export` capture; `44-recipes` interactive task help; `20-mixer-layout` main interface; `13-mobile-mode` responsive interaction; `06a..06e` multiplayer; `08a/42` adaptive quality.
- A text fetch of https://swirltogether.com succeeded. It exposes the app and safety warning, not a separate marketing landing page. Text extraction is NOT evidence of the rendered interface layout or usability.
- Root index.html has favicon links but no matches for description, og:, twitter:, or canonical metadata. Need confirm live DOM/head before describing deployed social-card behavior.
- Gloss Paint Wetness and Thickness are already implemented (`js/29-material-modes.js`): bundles controlling existing surface shading, sharpness, damping, and stamp parameters, not independent physical material solvers. Recommendations should build on these rather than claim materials are absent.

### Supplied artwork: visual observations, not confirmed rendering defects

1. Spiral composition: strong motion and unmistakable center; broad rainbow spectrum and repeated fine rings compete for attention. Flat cyan/magenta fields contrast with thin dark contours. Edge softness/stepping needs original-resolution investigation; the supplied image cannot establish a GPU defect.
2. Dark marbled mandala: strongest apparent material depth; beautifully folded forms. Much of the image is low-luminance, with several similarly salient yellow/green features. Thumbnail legibility may suffer; test rather than assume.
3. Neon floral mandala: strongest silhouette and useful black negative space. Green dominates, while a pink/yellow center and red outer shapes introduce competing accents. The center looks granular in this supplied image; investigate zoom/sharpening/lighting/resampling independently before assigning cause.

Working hypothesis: improve hierarchy (dominant family, restrained accent, intentional center, readable silhouette) and the path from creation to finished shareable artifact before adding more simultaneous effects. Virality is not guaranteed by visual polish; sharing and recipient remix friction must also be measured.

### Checkpoint 2: rendering and existing capabilities

Verified source observations:

- Rendering order (`05j-update-loop.js:1385-1654`, `05a-shader-core.js:296-635`): HDR dye -> optional Ridges sharpen -> optional RGB vibrance -> optional point lighting -> glow/scatter buffers + smoothed shading form -> kaleido mapping -> per-channel Reinhard/extended Reinhard -> Gate/Ignite saturation -> relief/gloss -> Light Shift -> glow/scatter -> raster layers -> static dither -> alpha -> PhotoSafe final presentation. There are several interacting color operators, not one finish control.
- Surface height comes from luminance of the processed color buffer. A palette change can therefore change apparent geometry, not just pigment. Blinn-Phong shininess is fixed at 48, with two fixed studio-light directions. Roughness and a color-independent deposited-height field would be genuinely new capabilities; changing gloss strength is already supported.
- `SHADE_FORM_RESOLUTION` defaults to a fixed long-side 256, NOT always quarter of the active dye size. Several comments still say quarter-res. Raising it changes the approved material look and may reintroduce pigment grain (`04a:425-434`). Do not blindly tie it to dye resolution.
- Static half-LSB dithering and highp shader precision already exist. Supersampled output already exists through RENDER_SCALE / PerfTiers. Do not recommend these as missing. Supersampling does not recreate detail already lost in low-resolution dye transport.
- No explicit app-wide sRGB decode/linear-light encode contract was located; glow alone gets an explicit 1/2.2 lift. This is an artistic legacy color pipeline, not proof of a browser color bug. Investigate a versioned, opt-in display finish before changing old saved looks.
- Material modes are existing macro bundles. Wetness drives vibrance to 1; surface shading adds further saturation. Extra saturation everywhere is a poor default recommendation for these already saturated images.
- Focus mode ALREADY offers 9:16, 1:1, 16:9 and 21:9 (`21-focus-mode.js`). It fits a ratio into available UI space, not an independently guaranteed export pixel size. Export starts at the current canvas backing-buffer dimensions (`24-video-export.js:559-566`). The opportunity is a unified finish/export flow, not adding aspect ratios from scratch.
- Presets ALREADY have baked thumbnails; user presets have canvas thumbnails and groups (`20-mixer-layout.js:1406-1540`). Most built-ins remain physics-oriented bundles (`04b-presets.js`); Gel Pen adds a finish. Curated complete visual looks should extend the existing preset surface, not duplicate it.
- Recipes are searchable, executable help with control-reveal and step completion (`44-recipes.js`), not an art-directed look gallery. Reuse this machinery for a guided first composition.
- Mutation already has locks, undo/redo, feature gates, and variant counts. Investigate perceptual thumbnails and cohesive style-space variation rather than generic randomization.
- QualityGovernor preserves artwork across buffer rebuilds and makes effect shedding opt-in. Keep that contract: protect appearance before maximizing headline FPS. Mobile code attempts a minimum VIBRANCE of 0.4; verify timing and consistency at runtime rather than assume it always applies.

Historical-test caution: `scripts/test/GUIDANCE.md` and README contain standing bugs that are not necessarily current. For example, current Ridges code now explicitly addresses the earlier low-range dead zone. Reproduce before repeating old bugs as new findings. Use dedicated profiles/ports; never test against the artist's working Electron window, never invoke persisting setters in it, and never regenerate goldens just to silence failures. Existing suites distinguish dye/velocity truth from display truth; perceptual image comparisons are still documented as missing.

### Checkpoint 3: live desktop and distribution observations

Live inspection used a user-approved isolated headless Chrome profile at debug port 9447. No existing user browser was attached, no room was joined, and PhotoSafe remained ON. Runtime reported an RTX 4090 via ANGLE/D3D11: these observations are NOT mobile-performance benchmarks.

- Live/source parity checked for six important files: shader core, video export, UI visibility, Focus mode, mixer layout, and CSS tokens. Git-blob hashes match after normalizing deployed CRLF to LF. Initial raw byte hashes differ only because of line endings. Observed deployed cache stamp: `mtwu42fq`. This is a sampled parity check, not a claim every deployed file matches.
- Fresh desktop flow: safety warning -> Simple/Everything choice -> empty black canvas. No curated example is presented before making a workspace choice. Keep the safety warning/protection; the extra workspace-choice gate is what to reconsider.
- Simple mode actually leaves only Presets and Help in the strip, and Mutate shader / Settings in the sidebar. It hides collaboration, color, pause/clear, and export. This conflicts with a novice create-together-and-share journey; not merely a hypothetical UI concern.
- Preset thumbnails all loaded (9 built-ins). They appear as very small cream/gold-on-black brush samples, not examples of the vivid radial artwork the user supplied. Improve the subject and size of existing thumbnails; do not rebuild a parallel preset browser.
- Mutation cards show a two-color diagonal swatch, a change count, and raw parameter changes (`20-mixer-layout.js:2394-2430`), NOT rendered alternative artwork. That is a particularly awkward centerpiece for Simple mode.
- Live head has only charset, viewport, and color-scheme metadata. No description, Open Graph image/title/description, or Twitter card was present. Actual social-platform scraping was not tested. Add static, crawler-readable artwork metadata first; personalized preview pages are a separate backend feature.
- Source search found no navigator.share / canShare use, and no app analytics SDK references among the searched source paths. This does not rule out provider-side analytics or external campaign analytics.
- One isolated desktop page load recorded 112 resource entries, 1,261,838 aggregate resource transfer bytes and 3,930,131 decoded resource bytes (navigation HTML excluded). Largest decoded source: mixer layout, 388,403 bytes. DOMContentLoaded ~792ms, but the core is loaded later via a 30-script sequential chain, so DCL/load are NOT time-to-paint readiness. Network numbers are one environment/sample, not field metrics.
- Core shader/editor scripts are global/order-dependent. Start with network preloading or fetch-parallel / execute-in-order experiments, not blind script reordering or a framework rewrite. AI model runtimes are already dynamically imported on demand; do not blame model downloads for this initial payload.

**Reproduced export mismatch (live, no files downloaded):** On an empty canvas, set backgroundColorPicker to #e8d8b8 via its input event. CSS canvas-area becomes rgb(232,216,184), normal (not transparent) mode, canvas opacity 1, preserveFluidOpacity true, backgroundTransparency 0.8, PhotoSafe true. `await fluidExport.captureFrame()` returns center pixel **[0,0,0,51]**, not the displayed warm background. `captureCompositeFrame` clears to transparency and draws the sim/layers/text but never composites the CSS ground (`24-video-export.js:232-395`). PNG therefore loses the chosen ground; opaque delivery formats need an explicit background policy. Capture compositor mismatch is proven; a decoded MP4/JPEG was not checked. This blocks confident paper/ivory-background art direction until fixed. Preserve deliberate alpha export as a separate explicit choice.

Screenshots saved outside the repo in `C:/Users/Gabri/AppData/Local/Temp/`: `devin-swirl-01-entry.png`, `02-fork`, `03-simple`, `04-presets`, `05-background` (same prefix/suffix). Temporary CDP helper: `devin-swirl-audit.js`. Durable observations are here because temp files may disappear.

### Additional verified capture and invite constraints

- Desktop 9:16 probe: Focus format descriptor says 1080 x 1920, but the actual canvas AND capture were **465 x 826** at a 1424 x 905 viewport. Do not equate the label with delivered resolution. Design independent output geometry, explicit fit/crop/pad, and encoder-safe dimensions. Rendering a larger file from a small canvas alone does not recover missing detail.
- This Chrome reported support for MP4/AVC with Opus, MP4/AVC with AAC, and WebM/VP9. Source prefers MP4+Opus before AAC when audio exists. A type-support result is NOT proof a social upload accepts the resulting file. Test actual encoded audio/video uploads; prefer a tested interoperable delivery profile with a truthful fallback.
- navigator.share exists in the inspected Chrome, but the export code has no share action. Browser support varies; use canShare({files}) and a user gesture, with download fallback. Do not count a resolved download anchor as a completed social post.
- Mandala Capture PNG bypasses the common compositor and calls canvas.toBlob directly (`34-mandala-mode.js:501-513`). It omits DOM-layer/text/ground composition; the guide overlay being excluded is intentional. Decide whether capture means fluid-only or what-you-see, label it, and unify the default if it means finished artwork.
- Invite sharing defaults to a six-character code. The full clickable link is copied only in QR mode (`06e-mp-panel.js:332-357`). Decouple Copy link from how the code is displayed; keep Code/QR/Hide privacy behavior. Do not burn live room codes into public exports.
- No persistent remix/creation URL reader found in the inspected app; URL hashes are interpreted as room codes (`06a-mp-core.js:109-122`). A recipe/remix URL needs a distinct namespace, not reuse of an arbitrary hash that might trigger a room join.
- Current multiplayer exchanges paint events, look settings and colliders, not an authoritative shared framebuffer. `party/index.ts:169-255` sends admission/turn metadata, not current artwork; the architecture ledger explicitly calls out absent late-join canvas sync. Do not promise identical fluid pixels across GPUs. A host-approved still snapshot as a visual starting point is different from exact simulation resumption.
- Web preset durability is localStorage plus manual export/import; the durable preset vault is Electron-only (`12b-preset-vault.js:1-19`). A shareable creation needs explicit persistence and user consent, not the assumption that a local saved preset is an uploaded artwork.
- Existing text/QR/logo branding overlays were deliberately reduced to text tools (`23-text-overlays.js:7-11`). Do NOT reintroduce an intrusive branding panel or mandatory watermark as a growth tactic. Optional export attribution belongs in the finish/share step, separate from the painting surface.

### Checkpoint 4: fresh mobile-layout emulation

- A new isolated profile at port 9448 was used after the page-level CDP connection rejected createBrowserContext. Chrome emulation: 390 x 844 CSS px, DPR 3, touch enabled, iPhone user-agent override. This is still Chromium on a desktop 4090, NOT Safari/iOS hardware validation. An earlier width-only probe retained desktop settings and is not evidence of mobile defaults.
- Fresh emulated-mobile runtime: DYE_RESOLUTION 512, SIM_RESOLUTION 128, canvas backing store **390 x 844 despite DPR 3**, VIBRANCE 0, PhotoSafe true, no boot error cards. The VIBRANCE 0.4 adjustment in `13-mobile-mode.js` did not survive/apply on this boot; cause not isolated. Do not promote automatic saturation changes as a platform-calibration strategy.
- After the two dialogs, Simple shows a black canvas and only a hamburger and '?' floating at the top right. No artwork example, drawing prompt, palette, Together, or Share is visible.
- Opening the drawer reveals Presets/Help and Mutate/Settings. Mobile preset trigger was 32 CSS px high in this sample; the separate '?' was 44 x 40. Prefer generous touch targets for primary actions; verify hit areas and clipping, not just font size.
- The floating '?' opens the keyboard Hotkeys sheet (Space, Shift+Space, F9, Ctrl+V, etc.), not the interactive Recipes help. The first choice dialog also includes desktop arrow/Enter/Esc hints. This is a verified mismatch with touch-first onboarding, not a request to remove keyboard support.
- Global iOS gesture prevention and viewport user-scalable=no intentionally protect painting geometry, but also constrain reading UI. Investigate scoping gesture suppression to the drawing surface and offering accessible UI sizing; test native Safari before changing the established gesture behavior.
- Screenshots in the same Temp folder: `devin-swirl-07-fresh-mobile-safety.png` through `devin-swirl-11-fresh-mobile-help.png` (08 fork, 09 simple, 10 menu).

## Coverage and limits

Reviewed the main shader/display pipeline, framebuffer architecture, brush engine, palette/random-color paths, material and mandala controls, preset/snapshot/vault contracts, mutation UI, recording/export composition, social format handling, mobile/UI visibility, audio scene foundations, multiplayer transport/admission/look sharing, and build/deployment/test guidance. This is a broad architecture/product/aesthetic audit, not a line-by-line correctness or security review of every subsystem. The Electron shell, AI model inference, native pen hardware, and full multi-peer networking were not exercised.

No production rooms joined, no uploads/shares/deploys, no existing artwork modified, no safety protection disabled, no application source edits. No field analytics were available. Aesthetic and conversion recommendations below are experiments, not measured uplift. Exact screenshot-generating settings/strokes were not provided; their granular centers and contours are not assigned to a specific bug.

## Art-direction and implementation opportunities

### Thesis

The distinctive product is a tactile, living painting instrument that two people can play together. Preserve the psychedelic expressiveness; make polish attainable without specialist shader knowledge. The strongest growth proposition is not another visualizer effect: it is the visible transformation from a small human gesture (or two alternating gestures) into a beautiful personal artifact that another person can try.

A useful experiment model is: compelling output -> comprehensible creative action -> retained/exported result -> interested recipient -> first successful remix. Improving only the first term leaves the rest of the chain weak. This is a product hypothesis, not measured causality.

### 1. Color hierarchy before more saturation

- Keep unrestricted random color as an expert/play option. Add a constrained color behavior to complete visual presets: a dominant family, a supporting family, and an occasional accent. Prototype roughly 60/30/10 coverage, not mandatory mathematical proportions.
- Existing random color samples the entire hue wheel with HSL saturation 85-100% and lightness 50-65%, followed by a luminance-floor adjustment (`05g-arm-colors.js:564-605`). Several artists' strokes therefore compete at similar saturation. Existing palette entries have role-like property names, but are flattened into a list by getPaletteColorsForIndex (`01-config.js:157-164`); the role names do not control coverage.
- Palette-role weighting, a hue-constrained random option, and perceptual lightness/chroma interpolation would add real art direction. CPU-side palette generation is a smaller initial experiment than changing all stored dye to a different color space.
- Test both restrained and neon variants. Do not infer that quieter is always more shareable. Evaluate at full size AND a phone-feed thumbnail: does one subject/gesture remain legible without zooming?
- A global hue-preserving highlight shoulder is worth a versioned display experiment. The existing per-channel tone mapper, gate vibrance, Ignite, surface saturation, Light Shift and glow can compound. Preserve the approved legacy profile for old presets rather than silently recoloring saved work.

### 2. Make material identities genuinely different

Already available: gloss strength, relief amount, smoothed form normals, wetness/drying, stamp texture, optional lighting and glow. Use these first to ship a small number of coherent looks, not more sliders.

A deeper material experiment would separate surface height/coverage from RGB. Currently a bright-yellow pigment produces different luminance gradients from a deep-blue pigment at the same deposit thickness. A separate low-resolution height field would stabilize geometry while changing palette; it needs its own deposition/advection/decay, serialization, resize, replay, and multiplayer semantics. Dye alpha is already pigment memory, so it is not a free spare height channel. Start as an opt-in prototype, not a solver-wide rewrite.

A smaller shader experiment: expose highlight width/roughness (the current specular exponent is fixed at 48) with a controlled studio-light rig, and decouple relief from saturation. The warm key/cool fill already exist; avoid marketing a light-position slider as a new lighting engine.

The separate Light Source pass can darken a composition: at its default ambient 0.3/intensity 0.5, its base diffuse brightness multiplier is at most 0.51 before the smaller rim/specular additions (`05a:780-799`). This is a concrete candidate to isolate when investigating dark output, NOT a diagnosis of screenshot 2, whose settings are unknown. Compare Surface Shading alone against Surface Shading + Light Source on the same frozen dye.

### 3. Proposed first visual collection

These are creative briefs and starting color chips, NOT rendered/approved presets or calibrated physical materials. Preserve user control; complete-look application must be explicit and reversible.

| Working name | Color direction | Form and finish | What it demonstrates |
|---|---|---|---|
| Liquid Opal | Ink #080C16, teal #2AC9B7, pearl #E9E3F1, restrained violet #8B72D9 | Slow broad folds, soft relief, sparse highlights, glow off or minimal | Rich material without wall-to-wall neon; initial flagship candidate |
| Electric Bloom | Ink #08080E, emerald #39D353, turquoise #21B8B0, tiny coral #FF5E86 | One readable floral silhouette, quiet center, deliberate black border, gentle turn | Builds directly on screenshot 3 while reducing competing accents |
| Porcelain Tide | Ivory #EFE9DF, cobalt #2447BA, pale blue #A2C7E5, small copper #B76B4B | Smooth glossy channels, lots of negative space, one off-center sweep | A new light-background identity; blocked on export-ground parity |
| Embossed Ink | Charcoal #10141A, warm grey #9B958C, cream #E6DECB, small muted gold #B69655 | Low chroma, broad relief, narrow highlights, no luminous halo | Shows surface depth rather than relying on rainbow color |
| Two Currents | Ink #080D17; painter A teal #35C4B5, painter B coral #F18473, shared cream #F2DBB4 | Two alternating interwoven gestures with separate color identities | Makes the collaboration visible in the finished artifact |

Three polished and tested looks are preferable to shipping all five half-finished. Keep existing expressive presets; this is an accessible featured collection, not a replacement for the instrument.

Practical first A/B: use the same saved strokes/field to compare the original spectrum against a restrained palette; then change relief/gloss independently; then adjust framing. Do not change palette, solver, lighting, sharpness and exposure simultaneously and call the result a controlled test.

### 4. Composition and motion

- Screenshot 1: preserve the spiral gesture, but test fewer dominant ring bands and a quieter center; peripheral fragments should support the center rather than fill every edge. Whether rings come from the Spiral display mode, replay, or the painted source must be established from the original session before changing shader math.
- Screenshot 2: preserve the folded material. Test a lighter midtone read and fewer competing yellow peaks before increasing exposure across the whole image. Keep black negative space genuinely dark.
- Screenshot 3: retain the silhouette; simplify center chroma and test removing one accent family. Inspect the granular center at source resolution with shading/Ridges/Light Shift isolated, not by adding more sharpening.
- Existing kaleido UV geometry is centered and normalized per axis. A square mandala can become elliptical when the simulation itself is reformatted to portrait. Keep a square composition and contain it in a portrait delivery frame when preserving the circular subject matters; changing the simulation aspect is not equivalent to cropping a camera.
- Add framing guides and a preview of actual delivery crop/safe areas in the export step. Guides must never enter the output. Let the artist set center placement and margin instead of auto-cropping away intentional negative space.
- For short clips, show one readable action -> growth/transformation -> satisfying hold. Start with an already legible subject, not several seconds of empty canvas. Compare slow build, close-detail reveal, and two-person call/return as separate content formats.
- Recording playback already loops, but looping input is not a seamless loop of an evolving velocity/dye field. A loop export needs a loop-boundary preview and a defined strategy (periodic camera over a held field, deliberately cyclical animation, or an explicit crossfade). Do not claim a perfect fluid loop merely because the event timeline repeats.
- Optional retrospective capture could prevent losing a good moment, but make it explicit and bounded. Avoid raw full-resolution frame rings (large RAM), silent microphone recording, or enabling capture by default. First prioritize reliable deliberate capture.

### 5. Interface: a welcoming studio, not a second application

Retain the efficient mixer and expert controls. Rework the beginner defaults around what a painter needs:

- Top/compact bar: Look, Color, Brush, Undo, Pause, Together, Save/Share. Advanced controls remain available via the existing visibility/section system.
- Replace the initial Simple/Everything decision with a usable starter layout; put workspace choice in Settings. Keep the photosensitivity warning and protection. A static example can communicate the potential without autoplaying an intense sequence behind the warning.
- Show three visual start cards and a dismissible 'Drag to make your first swirl' prompt on the empty canvas. Opening a supplied look should not erase existing work or unexpectedly start animations. A one-gesture guided composition can reuse Recipes' completion watchers.
- Replace beginner-facing 'Mutate shader' emphasis with visual variations, ideally after the user has made something. Initially prefer complete curated presets over expensive multi-preview rendering.
- When rendered variation previews are added, use a frozen snapshot and sequential small previews. Never apply N candidates to the live document just to generate thumbnails. Separate display-only variants from physics variants: a display-only change can render existing dye, while a physics change needs a controlled replay/simulation. Keep diagnostic parameter diffs in expert mode.
- On mobile, keep a compact reachable action row (Look, Color, Undo, Together, Save) rather than hiding everything behind the drawer. Connect '?' to touch-aware Recipes; keyboard shortcuts remain a secondary page.
- Preserve the dark control surface and recognizable faders. Reduce accidental hierarchy competition: a permanent cyan editing border, rainbow category labels, red states, blue buttons, and orange fills currently all ask for attention. Tokens are only partly authoritative; a later cascade controls actual colors. Audit computed styles before changing 00-tokens.css and expecting the whole app to follow.
- Favor readable sentence-case labels and generous primary touch areas over generic glass panels or decorative gradients. No framework migration is required for this work.

### 6. Finish -> share -> remix

First, make one trustworthy finish step over the EXISTING exporter:

1. Choose still or clip, independent output pixel dimensions and aspect, contain/crop/pad, intended background or alpha.
2. Show the exact composited result, including layers/masks/text and chosen ground, excluding all guides/cursors/private room codes. Make Mandala capture semantics consistent or explicitly fluid-only.
3. Use a tested encoder/container/audio combination and report actual dimensions/FPS. H.264 compatibility may require even dimensions; validate instead of assuming the current odd-width working canvas is a valid delivery size.
4. Offer native file share when supported and user-initiated, plus a download fallback. Optional unobtrusive attribution is fine; no mandatory watermark.
5. Make Copy invite link available independently of Code/QR/Hide, preserving privacy choices.

Next, introduce an intentionally scoped remix feature:

- Phase A product capability: a versioned curated-look ID + palette/macro state; truthful label 'Try this look', not 'Recreate this exact painting'. Namespace it separately from room hashes. Preserve the receiver's PhotoSafe and workspace/device preferences.
- Phase B capability: optional saved creation with a representative static image plus versioned settings/stroke data. An encoded clip or image is the authoritative visual artifact; simulation replay is editable approximation unless determinism is actually established.
- A public preview needs crawler-visible metadata served from a real path. Client-only hashes do not produce distinct server-rendered social cards. The current worker routes multiplayer; preview storage/routes would be new architecture, not a one-line frontend patch.
- Define upload consent, visibility/unlisted behavior, deletion/retention, size/rate limits, and rendering safety before hosting user creations. Do not upload every canvas automatically. Public text/images require an abuse-handling policy.
- Use existing Call and return as the collaborative prompt: 'One stroke each' or 'Finish my swirl' can explain why someone should invite another person. Experiment with consented dual authorship/capture. No need to expose private live-room codes in exported artwork.

## Priority order and validation gates

Scope below is relative engineering scope, not a time estimate. 'High confidence' refers to the observed gap, not guaranteed growth.

| Priority | Change | Scope | Confidence / why | Acceptance evidence |
|---|---|---|---|---|
| P0 | Fix explicit background/alpha policy and unify finished capture semantics | Medium | High: capture mismatch reproduced | Screen/composite agreement on black, ivory, transparent; masks, layers, text; verify decoded PNG/JPEG/video |
| P0 | Preserve Together, Save, essential paint controls in starter/mobile layout; touch-aware help | Small–medium | High: controls hidden and keyboard-only help observed | Fresh desktop/phone user can paint, find invite and capture without opening workspace settings |
| P0 | Feature three complete looks using existing preset thumbnails and Recipes | Medium, art-led | High opportunity, taste unvalidated | Same-gesture examples approved at full and thumbnail size; novice can reach a recognizable composition |
| P0 | Add static social-card metadata; expose Copy link separately | Small | High: live metadata absent; invite code/link coupling verified | Real crawler preview and receiver opens intended flow; Hide privacy remains intact |
| P1 | Independent delivery resolution / fit / crop and native file sharing | Medium | High: 465x826 portrait capture measured | Preview equals output, dimensions honest, tested codec playback/upload, cancelled share handled |
| P1 | Palette roles, constrained randomness, cohesive visual variations | Medium | Medium: structural color problem, user preference needs testing | Blind comparisons improve subject/readability without flattening the user's expressive style |
| P1 | 'Try this look' links with versioned curated IDs | Medium | Medium: distribution hypothesis | Recipient restores intended look without joining unintended room, changing safety, or overwriting work |
| P2 | Roughness/light-rig controls and opt-in color finish | Medium–large | Medium: clear renderer limitation, visual gain unmeasured | Frozen-field A/B, palette ramps, old-preset compatibility, no clipping/banding regressions |
| P2 | Rendered mutation previews and seamless/cyclical clip tooling | Large | Medium: helpful but nontrivial state/render cost | Previews do not mutate live art; boundary playback and memory/perf checks |
| P3 | Independent height/pigment material model and hosted remix artifacts | Large | Exploratory | Height transport + persistence tests; storage/privacy model; measured value beyond simpler presets |

Do not prioritize: more simultaneous bloom, unconditional vibrance boosts, blanket 4K/8K defaults, forced virality prompts/watermarks, an unbounded rewind buffer, a framework rewrite, or a gallery backend before first-paint/capture usability. Pigment mixing, edge darkening/granulation and bristle work already appear in TODO.md's painterly backlog; they are not newly discovered ideas, and should be prioritized against the simpler finish/preset work rather than duplicated.

### Verification protocol for the next implementation session

- Start with reproduction tests for the capture-background mismatch and independent export dimensions; no application fix was made in this audit.
- Use a frozen field for display comparisons, and seeded/fixed input for simulation comparisons. Pin canvas geometry, effective dye/sim resolutions, governor state and relevant look settings. Record PhotoSafe state; keep it enabled for actual user-facing/export validation.
- Baseline set: supplied art reconstructed from original presets/strokes if the artist can supply them; otherwise clearly labeled new scenes. Include gradient fade, bright layered paint, dark saturated colors, fine kaleido center, portrait-with-contained-square, clipped raster/DOM layers, text, and light/transparent grounds.
- Existing infrastructure: `node scripts/test/run-regression.js`, `node scripts/test/run-regression.js --gl-errors`, targeted `node scripts/test/run-sweep.js --param ridges`, and `node scripts/test/run-inputs.js`, against a dedicated instance (read their port/options first). Never point defaults at the working artist's debug port. Known documented nondeterminism means hash differences need scalar/perceptual diagnosis, not blind baseline replacement.
- Performance: `scripts/test/PERF.md` describes run-perf.js, GPU queries and vsync caveats; JankMonitor/LookWatchdog already exist. Do not run expensive GPU probes concurrently with the artist's session and call the results hardware capacity. Do not adopt instructions to kill unrelated app processes.
- Assess temporal quality as well as stills: p95 frame delivery, brush latency, center shimmer, scene settling, clipping, and actual encoded output. Decode/review the delivery artifact; capture success alone is insufficient.
- Device coverage still required: real Safari/iPhone, Android Chrome, integrated GPU, desktop Chrome and Electron. Chrome UA emulation does not test WebKit, mobile memory limits, or thermal behavior.
- Preview compare at large size and small phone-feed size; then blind preference/readability tests with both existing artists and first-time users. Share rate, saved work, recipient activation, and retained users are more useful than time spent opening advanced controls.

### Measurement model (not yet instrumented)

Define events and denominators before claiming uplift: app_ready -> first_stroke -> chosen_look/meaningful_edit -> capture_open -> export_success -> share_invoked/share_result -> recipient_open -> recipient_first_stroke. Separate generated files, invoked share sheets, and confirmed posts (the latter often cannot be observed). Compare novice vs returning, mobile vs desktop, acquisition source, and paired vs solo.

Suggested experiments:

1. Current entry vs guided starter: first-stroke completion, first saved creation, and users needing help. Keep safety messaging unchanged.
2. Existing thumbnails vs three art-directed examples: look selection, user-rated pride in output, and export completion. Change no rendering math in this test.
3. Full-spectrum vs constrained palette on matching actions: blind visual preference and thumbnail subject clarity, then observed exports/shares.
4. Existing export vs unified finish: successful decoded file, completion/abandonment, recipient opens from optional link.
5. Solo prompt vs Call-and-return invitation: invite acceptance, both participants painting, collaborative artifact captured, return usage.

Guardrails: crashes/context loss, input latency, dropped frames, unreadable UI, accidental loss of artwork, safety preference preserved, export failures, and unwanted invitations/uploads. No analytics collection should silently include artwork, room codes, clipboard data or audio.

## Final checkpoint / resume notes

- Broad source audit and live desktop/mobile-emulation checks completed. Only this persistent Markdown file was added to the repository. No application edits, commits, deployments or production-room tests.
- Mobile touch smoke test: synthesized one 24-move touch stroke in the isolated profile; capture pixels with max RGB >10 changed from 0 to 128,446, max channel 216, no boot error cards, PhotoSafe true. This confirms basic drawing/capture responded; it is not aesthetic or performance validation.
- Findings to carry forward first: hidden Together/Export in Simple; mobile help opens Hotkeys; missing static social metadata; export CSS-background mismatch; portrait format is not delivery resolution; preset and mutation previews undersell existing output.
- Request the original .fluid/preset + recording/strokes for each supplied screenshot before diagnosing its fine-detail artifacts. Ask which look should become the flagship, but do not block usability/export fixes on that choice.
- Open validation: real phone/browser matrix; decoded video/audio compatibility; live multi-peer late join behavior; exact artwork reproduction; user/campaign analytics; rendered A/B material/color studies. These were not silently assumed to pass.
- Both isolated audit browsers were closed gracefully; final checks showed PhotoSafe true and zero boot error cards in each. Temporary screenshots/helper/profile data remain outside the repository. Application regression/performance suites were not run because this audit changed no application code.
