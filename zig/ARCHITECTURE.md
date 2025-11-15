# Fluid-UI Zig Port — Architecture (Phase 1)

Scope: CPU reference engine + TDD harness to establish parity oracles. GPU/backends come later.

## Modules

- `src/util.zig`
  - Math helpers (`Vec2`, `Vec4`, clamp/saturate/lerp), hashing utilities for golden-image checks.
- `src/grid.zig`
  - Indexing helpers and bilinear sampling for `Vec2`/`Vec4` fields.
- `src/prng.zig`
  - Deterministic PCG32 PRNG (seed + stream) used for reproducible tests and later simulation seeds.
- `src/kernels.zig`
  - CPU reference implementations for advection (scalar/vec2/vec4), divergence, curl, pressure Jacobi, gradient subtraction.
- `src/kaleido.zig`
  - CPU compositing for kaleidoscope modes. Phase 1 implements Off + Mirror(H/V) with uniform semantics. Other modes stubbed to identity until parity tests are added.
- `src/root_tests.zig`
  - Test suite entry aggregating unit tests across modules.

## Data Layout (CPU Reference)

- SoA-lite with dense 2D fields flattened to row-major (`y*w + x`).
- Vector types are small POD structs; functions operate on slices to avoid allocations.

## Next (Phase 2+)

- Renderer interface and Vulkan backend for image generation in tests.
- Full kaleidoscope modes (Wedge/Quad/Spiral) with golden-image oracles.
- Determinism policy: unified PRNG, epsilon tolerances.
- Platform adapters and Web/WASM build via zig's Wasm target.
