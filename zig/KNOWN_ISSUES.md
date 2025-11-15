# Known Issues & Limitations

## Uniform Buffers in Render Passes (wgpu-native)

**Status:** Known limitation - workaround in place  
**Severity:** Medium (does not affect compute pipelines)  
**Date Discovered:** November 11, 2025

### Issue Description

When using uniform buffers in bind groups within render passes, wgpu-native reports a validation error:
```
Error in wgpuQueueSubmit: Validation Error
Caused by:
    Buffer Id(0,1,vk) is still mapped
```

### Isolation Tests

Systematic testing revealed:
- ✅ **Render pipelines work** - Validated with `test-render-minimal`
- ✅ **Uniform buffer bind groups work** - Validated with `test-bindgroup-debug`  
- ❌ **Uniform buffers FAIL in render passes** - `test-render-with-buffer` fails

The issue occurs specifically when calling `setBindGroup()` on a `RenderPassEncoder` with a bind group containing a uniform buffer, then submitting the command buffer.

### Root Cause

Likely a wgpu-native validation bug or version-specific issue. The buffer is never explicitly mapped by our code, but wgpu-native's internal validation reports it as mapped during queue submission.

### Impact

- **Compute Pipelines:** ✅ Not affected (Phase 3 validated)
- **Render Pipelines:** ⚠️ Cannot use uniform buffers currently
- **Workaround:** Use push constants or alternative approaches

### Tests Affected

- `test_advection_render.zig` - Skips uniform buffer writes
- `test-render-with-buffer` - Fails (diagnostic test)

### Mitigation Strategy

**Phase 5 Forward:**
- Focus on compute pipeline dispatch (unaffected)
- Use compute shaders for simulation kernels  
- Render passes can use textures and samplers (working)
- Consider push constants for small uniform data

### Future Resolution Options

1. **Update wgpu-native** - May be fixed in newer versions
2. **Mapped Buffer API** - Implement proper `mapAsync/getMappedRange/unmap` flow
3. **Push Constants** - Use for small uniform data
4. **Investigate Further** - File bug report with wgpu-native team

### Related Files

- `test_render_minimal.zig` - Working render pass (no buffers)
- `test_bindgroup_debug.zig` - Working uniform buffers (no render pass)
- `test_render_with_buffer.zig` - Failing case (uniform in render pass)
- `test_render_storage_buffer.zig` - Storage buffer alternative (untested)

### Diagnostic Commands

```bash
# Working render pass
zig build test-render-minimal

# Working uniform buffer bind group
zig build test-bindgroup-debug

# Failing case - uniform buffer in render pass  
zig build test-render-with-buffer
```

---

## Summary

This is an isolated issue that does not block Phase 5 progress. Compute pipelines (the core of our fluid simulation) are unaffected and fully functional.
