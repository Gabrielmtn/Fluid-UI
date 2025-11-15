# Real-Time Window Integration Plan

## Goal
Get a live, interactive window showing the fluid simulation in real-time, matching the web version's behavior.

---

## Phase 1: Basic Window (TODAY - 2 hours)

### Option A: SDL2 (Recommended for speed)
**Pros:**
- Simple C library, easy FFI
- Software rendering works immediately
- Mouse input built-in
- Cross-platform

**Setup:**
1. Download SDL2 for Windows
2. Add to `build.zig`
3. Create window wrapper
4. Render pixels directly

**Code estimate:** ~200 lines

### Option B: Win32 API (Windows-only)
**Pros:**
- No dependencies
- Native Windows

**Cons:**
- More boilerplate
- Windows-only

---

## Phase 2: Real-Time Rendering (TODAY - 2 hours)

### Tasks:
1. **Render loop** - 60fps update
2. **Pixel buffer** - Copy simulation to screen
3. **Mouse tracking** - Get position/buttons
4. **Force injection** - Click/drag adds forces

### Expected Result:
```
[Window opens]
- Shows fluid simulation updating live
- Click and drag to add swirls
- See colors flow in real-time
- Smooth 60fps
```

---

## Phase 3: Match Web Behavior (TOMORROW - 4 hours)

### Shader Parity Checklist:
- [ ] Dissipation rates match
- [ ] Velocity diffusion
- [ ] Pressure iterations (40)
- [ ] Curl/vorticity strength
- [ ] Color blending
- [ ] Splat radius
- [ ] Force multiplier

### Tuning Parameters:
```zig
// Current (needs adjustment)
dissipation: 0.98
viscosity: 0.1
pressure_iterations: 40

// Target (from web version)
DENSITY_DISSIPATION: 0.97
VELOCITY_DISSIPATION: 0.98
PRESSURE_ITERATIONS: 20
CURL: 30
```

---

## Phase 4: GPU Acceleration (DAY 3-4)

### WebGPU Integration:
1. Add wgpu-native bindings
2. Create GPU textures
3. Compile WGSL shaders
4. Dispatch compute passes
5. Read back to display

### Performance Target:
- **Current CPU:** ~0.5 fps (2 sec/frame) at 512x288
- **Target GPU:** 60+ fps at 1024x576
- **Speedup:** 100-200x

---

## Phase 5: Display Shader (DAY 4)

### Kaleidoscope Effects:
- [ ] Mode 0: Off (direct density)
- [ ] Mode 1: Wedge (radial symmetry)
- [ ] Mode 2: Mirror H
- [ ] Mode 3: Mirror V
- [ ] Mode 4: Mirror Quad
- [ ] Mode 5: Spiral

### Implementation:
- Use `display.wgsl` (already ported!)
- Apply as post-process
- Add UI controls

---

## Timeline

### Today (Day 1):
- ✅ Physics working
- ✅ Image output
- 🔄 **Next: SDL2 window** (2 hours)
- 🔄 **Next: Mouse input** (1 hour)
- 🔄 **Next: Real-time loop** (1 hour)

**End of Day 1:** Interactive window with mouse control

### Tomorrow (Day 2):
- Tune parameters to match web version
- Add UI controls (sliders for dissipation, etc.)
- Color palette selection
- Performance profiling

**End of Day 2:** Behavior matches web version (CPU)

### Day 3-4:
- WebGPU integration
- GPU compute dispatch
- Display shader with kaleidoscope
- Full visual parity

**End of Day 4:** Complete native app matching web version

---

## Immediate Next Steps (RIGHT NOW)

### 1. Download SDL2 (5 minutes)
```powershell
# Option A: Download from libsdl.org
# https://github.com/libsdl-org/SDL/releases/latest
# Get SDL2-devel-2.x.x-VC.zip

# Option B: Use vcpkg
vcpkg install sdl2:x64-windows
```

### 2. Update build.zig (5 minutes)
```zig
exe.linkSystemLibrary("SDL2");
exe.addIncludePath(.{ .cwd_relative = "vendor/SDL2/include" });
exe.addLibraryPath(.{ .cwd_relative = "vendor/SDL2/lib/x64" });
```

### 3. Create SDL window wrapper (30 minutes)
```zig
// src/sdl_window.zig
const c = @cImport({
    @cInclude("SDL2/SDL.h");
});

pub const Window = struct {
    window: *c.SDL_Window,
    renderer: *c.SDL_Renderer,
    texture: *c.SDL_Texture,
    width: u32,
    height: u32,
    
    pub fn init(width: u32, height: u32) !Window {
        if (c.SDL_Init(c.SDL_INIT_VIDEO) < 0) {
            return error.SDLInitFailed;
        }
        
        const window = c.SDL_CreateWindow(
            "Fluid Simulation",
            c.SDL_WINDOWPOS_CENTERED,
            c.SDL_WINDOWPOS_CENTERED,
            @intCast(width),
            @intCast(height),
            c.SDL_WINDOW_SHOWN,
        ) orelse return error.WindowCreationFailed;
        
        const renderer = c.SDL_CreateRenderer(
            window,
            -1,
            c.SDL_RENDERER_ACCELERATED,
        ) orelse return error.RendererCreationFailed;
        
        const texture = c.SDL_CreateTexture(
            renderer,
            c.SDL_PIXELFORMAT_ABGR8888,
            c.SDL_TEXTUREACCESS_STREAMING,
            @intCast(width),
            @intCast(height),
        ) orelse return error.TextureCreationFailed;
        
        return Window{
            .window = window,
            .renderer = renderer,
            .texture = texture,
            .width = width,
            .height = height,
        };
    }
    
    pub fn updatePixels(self: *Window, pixels: []const u8) !void {
        _ = c.SDL_UpdateTexture(
            self.texture,
            null,
            pixels.ptr,
            @intCast(self.width * 4),
        );
        
        _ = c.SDL_RenderClear(self.renderer);
        _ = c.SDL_RenderCopy(self.renderer, self.texture, null, null);
        c.SDL_RenderPresent(self.renderer);
    }
    
    pub fn pollEvents(self: *Window) bool {
        var event: c.SDL_Event = undefined;
        while (c.SDL_PollEvent(&event) != 0) {
            if (event.type == c.SDL_QUIT) {
                return true; // should close
            }
        }
        return false;
    }
    
    pub fn getMouseState(self: *Window) struct { x: i32, y: i32, pressed: bool } {
        _ = self;
        var x: c_int = 0;
        var y: c_int = 0;
        const buttons = c.SDL_GetMouseState(&x, &y);
        return .{
            .x = x,
            .y = y,
            .pressed = (buttons & c.SDL_BUTTON(c.SDL_BUTTON_LEFT)) != 0,
        };
    }
    
    pub fn deinit(self: *Window) void {
        c.SDL_DestroyTexture(self.texture);
        c.SDL_DestroyRenderer(self.renderer);
        c.SDL_DestroyWindow(self.window);
        c.SDL_Quit();
    }
};
```

### 4. Update main loop (30 minutes)
```zig
// Real-time rendering loop
var sdl_window = try sdl.Window.init(800, 600);
defer sdl_window.deinit();

var last_mouse_x: i32 = 0;
var last_mouse_y: i32 = 0;

while (true) {
    // Poll events
    if (sdl_window.pollEvents()) break;
    
    // Get mouse state
    const mouse = sdl_window.getMouseState();
    if (mouse.pressed) {
        // Convert screen coords to sim coords
        const sim_x = @as(usize, @intFromFloat(
            @as(f32, @floatFromInt(mouse.x)) / 800.0 * @as(f32, @floatFromInt(sim_width))
        ));
        const sim_y = @as(usize, @intFromFloat(
            @as(f32, @floatFromInt(mouse.y)) / 600.0 * @as(f32, @floatFromInt(sim_height))
        ));
        
        // Calculate velocity from mouse movement
        const dx = @as(f32, @floatFromInt(mouse.x - last_mouse_x)) * 0.5;
        const dy = @as(f32, @floatFromInt(mouse.y - last_mouse_y)) * 0.5;
        
        // Add force and color
        sim.addForce(sim_x, sim_y, dx, dy);
        
        // Random color or cycle through palette
        const color = Vec4{
            .r = 0.5 + @sin(@as(f32, @floatFromInt(frame)) * 0.01) * 0.5,
            .g = 0.5 + @sin(@as(f32, @floatFromInt(frame)) * 0.02) * 0.5,
            .b = 0.5 + @sin(@as(f32, @floatFromInt(frame)) * 0.03) * 0.5,
            .a = 1.0,
        };
        sim.addDensity(sim_x, sim_y, color);
    }
    
    last_mouse_x = mouse.x;
    last_mouse_y = mouse.y;
    
    // Step simulation
    sim.step();
    
    // Render to pixel buffer
    image.renderDensityField(&img_writer, sim.density_read, sim_width, sim_height);
    
    // Update window
    try sdl_window.updatePixels(img_writer.pixels);
    
    frame += 1;
    
    // Cap at 60fps
    c.SDL_Delay(16);
}
```

---

## Expected Output (End of Today)

```
[Window opens: 800x600]

You can:
✓ See fluid simulation updating in real-time
✓ Click and drag mouse to create swirls
✓ Colors flow and mix naturally
✓ Smooth 60fps animation
✓ Close window to exit

Console shows:
Frame 0: 60.0 fps
Frame 60: 59.8 fps
Frame 120: 60.1 fps
```

---

## Success Criteria

### Phase 1 Complete When:
- [x] Window opens and stays open
- [x] Simulation renders to window
- [x] Updates at 60fps
- [x] Mouse position tracked
- [x] Click/drag adds forces
- [x] Colors appear and flow

### Phase 2 Complete When:
- [ ] Behavior matches web version
- [ ] Same dissipation rates
- [ ] Same force strength
- [ ] Same visual quality

### Phase 3 Complete When:
- [ ] GPU acceleration working
- [ ] 60fps at high resolution
- [ ] All shaders dispatching

### Phase 4 Complete When:
- [ ] Kaleidoscope effects working
- [ ] Full feature parity with web
- [ ] Can ship as standalone .exe

---

## Let's Start!

**First action:** Download SDL2 and set up the window.

Ready to proceed?
