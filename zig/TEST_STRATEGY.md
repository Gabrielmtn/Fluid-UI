# Test Strategy (Phase 1)

Goal: Establish CPU reference and parity oracles with high coverage.

## Current Tests

- PRNG determinism for PCG32 (seed, stream) — reproducible sequences
- Advection (scalar) conservation under zero velocity + dissipation
- Divergence/curl zero for uniform velocity fields
- Pressure solve reduces total divergence after gradient subtraction
- Kaleidoscope compositor
  - Off = identity
  - MirrorH property: vertical symmetry for segments=2

## Coverage & Oracles

- Run `zig build test -Dcoverage` to emit `zig-out/coverage/*.profraw`.
- If LLVM tools available, `zig build coverage` merges to `zig-out/coverage/default.profdata`.
- Golden-image oracles will arrive with the renderer stub (Vulkan/WebGPU) in Phase 2.

## Next

- Add property-based tests: mass conservation (with controlled dissipation), bounds checks, stability under Courant limits.
- Add golden-image tests for Wedge/Quad/Spiral modes with SSIM/PSNR.
- Add deterministic end-to-end macros (Smash/Jellyfish/Vortex/Ascend/Portal/Portrait) on the renderer path.
