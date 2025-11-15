# Complete JS-to-Zig Porting Plan
**Date:** November 12, 2025  
**Scope:** Port all features from JavaScript WebGL fluid simulation to Zig

---

## 📊 Feature Inventory from JavaScript Codebase

### Current JS Files Analysis (Total: ~384KB of code)

**01-config.js (26KB)**
- Palette management (default + custom)
- Color system (picker, random, stepping)
- Layer management (up to 10 layers)
- Canvas resizing/handles
- Mouse trail & cursor customization
- Pause/animation control
- Settings persistence hooks

**02-palettes.js (14KB)**
- 50+ curated color palettes
- Palette carousel UI
- Save/delete/edit palettes
- Color stepping through palettes
- Palette preview rendering

**03-recording.js (63KB)**
- Mouse position recording
- Replay system with fade effects
- Recording layers (drawable)
- Layer visibility/ordering
- Export/import recordings

**04-ui-interactions.js (84KB)**
- Slider management (30+ sliders)
- Checkbox controls
- Button handlers
- Dropdown menus
- Color picker integration
- Canvas drag handles
- Keyboard shortcuts
- Touch/mouse event handling

**05-fluid-sim.js (142KB)** - CORE SIMULATION
- WebGL context management
- Multiple shader programs:
  - Curl computation
  - Vorticity confinement
  - Divergence
  - Pressure (Jacobi/multi-grid)
  - Gradient subtraction
  - Advection
  - Splat
  - Display (various modes)
  - Bloom
  - Sunrays
  - Blur
- Texture management (ping-pong buffers)
- Framebuffer management
- Dynamic resolution
- Multiple dye layers
- Force application (splat)
- Obstacle support
- Performance monitoring

**06-multiplayer.js (14KB)**
- PartyKit WebSocket connection
- Player state synchronization
- Cursor sharing
- Splat replication

**08-stats-panel.js (9KB)**
- FPS counter
- Frame time graph
- Draggable stats display

**09-settings-manager.js (10KB)**
- localStorage persistence
- Settings validation
- Namespace management

**11-settings-interface.js (13KB)**
- Clean API for settings
- Bulk operations
- Type-safe patterns

**12-save-load.js (14KB)**
- Export settings to JSON
- Import settings from file
- Merge/replace modes

**13-mobile-mode.js (5KB)**
- Touch optimizations
- Mobile UI adaptations

---

## 🎯 Current Zig Implementation Status

### ✅ What We Have (Phase 1-7 Complete)

**Core Infrastructure:**
- ✅ GPU initialization (WebGPU/wgpu-native)
- ✅ Window management (Win32)
- ✅ Texture manager with split velocity pattern
- ✅ Compute pipeline compilation
- ✅ Command encoding and submission

**Simulation Kernels:**
- ✅ Advection (Semi-Lagrangian)
- ✅ Divergence computation
- ✅ Pressure solver (Jacobi iteration)
- ✅ Gradient subtraction
- ✅ Ping-pong buffering

**Performance:**
- ✅ 50 FPS sustained at 256x192
- ✅ Memory optimized (1.88 MB)
- ✅ Fixed timestep game loop

**Testing:**
- ✅ 18/20 tests passing
- ✅ Full integration validated

### ❌ What We're Missing (95% of features!)

**Rendering & Visualization:**
- ❌ Display shader (velocity/density visualization)
- ❌ Bloom effect
- ❌ Sunrays effect
- ❌ Multiple display modes
- ❌ Color mapping
- ❌ Blur shader

**Simulation Features:**
- ❌ Splat force application
- ❌ Curl visualization
- ❌ Vorticity confinement
- ❌ Multiple dye layers
- ❌ Obstacles
- ❌ Dynamic resolution scaling

**Input & Interaction:**
- ❌ Mouse splat integration
- ❌ Touch support
- ❌ Keyboard shortcuts
- ❌ Multiple splat modes

**UI System (100% missing):**
- ❌ All sliders (~30 parameters)
- ❌ Color picker
- ❌ Palette system
- ❌ Recording layers
- ❌ Settings panels
- ❌ Canvas resizing UI
- ❌ Stats display

**Persistence:**
- ❌ Settings save/load
- ❌ Palette management
- ❌ Recording export/import

**Multiplayer:**
- ❌ Network synchronization
- ❌ Player cursors
- ❌ Splat replication

---

## 🏗️ Architectural Decisions Based on Zig Patterns

### Memory Management Strategy

**1. Allocator Hierarchy**
```zig
App {
    gpa: GeneralPurposeAllocator,           // Base allocator
    frame_arena: ArenaAllocator,             // Frame-local data (reset each frame)
    persistent_arena: ArenaAllocator,        // Long-lived UI data
    splat_pool: Pool(Splat),                 // Frequently created objects
    particle_pool: Pool(Particle),           // Particle system
}
```

**2. Pre-allocated Buffers**
```zig
const MAX_SPLATS_PER_FRAME = 128;
const MAX_UI_COMMANDS = 4096;

splat_buffer: [MAX_SPLATS_PER_FRAME]Splat,
ui_commands: [MAX_UI_COMMANDS]UICommand,
```

**3. No Frame Allocations in Hot Paths**
- All render commands pre-allocated
- GPU buffers created at init
- Staging buffers pooled

### Compute Architecture

**1. Pipeline System**
```zig
const PipelineManager = struct {
    advection: ComputePipeline,
    divergence: ComputePipeline,
    pressure: ComputePipeline,
    gradient: ComputePipeline,
    curl: ComputePipeline,
    vorticity: ComputePipeline,
    splat: ComputePipeline,
    display: RenderPipeline,
    bloom: RenderPipeline,
    sunrays: RenderPipeline,
    blur: ComputePipeline,
};
```

**2. Bind Group Management**
```zig
const BindGroupCache = struct {
    // Pre-created bind groups for common operations
    advection_velocity: BindGroup,
    pressure_iteration: BindGroup,
    display_density: BindGroup,
    // ... etc
    
    pub fn rebuildForResolution(self: *Self, textures: *FluidTextures) !void {
        // Recreate bind groups when resolution changes
    }
};
```

### Data Layout Optimization

**1. Structure of Arrays for Particles**
```zig
const ParticleSystem = struct {
    positions: [][2]f32,      // Cache-friendly: all X,Y together
    velocities: [][2]f32,
    colors: []u32,            // Packed RGBA
    lifetimes: []f32,
    
    // Or use MultiArrayList:
    // particles: std.MultiArrayList(Particle),
};
```

**2. Simulation Grid (Compile-time Specialization)**
```zig
fn FluidSimulation(comptime W: u32, comptime H: u32) type {
    return struct {
        // Fixed-size grids allow aggressive optimization
        // Compiler can unroll loops, eliminate bounds checks
    };
}
```

### UI System Architecture

**1. Immediate Mode UI (Dear ImGui via zgui)**
```zig
const UI = struct {
    imgui_ctx: *zgui.Context,
    
    pub fn render(self: *UI, sim: *FluidSimulation) !void {
        zgui.begin("Controls", .{});
        
        // Sliders
        _ = zgui.sliderFloat("Pressure", &sim.pressure, 0.0, 1.0);
        _ = zgui.sliderFloat("Curl", &sim.curl_strength, 0.0, 50.0);
        
        // Color picker
        _ = zgui.colorPicker4("Splat Color", &sim.splat_color);
        
        zgui.end();
    }
};
```

**2. Settings Persistence**
```zig
const Settings = struct {
    // Use zig-ini or custom binary format
    // Serialize to file on change
    // Deserialize at startup
    
    pub fn save(self: *Settings, allocator: Allocator) !void {
        // Write to ~/.fluid-sim/settings.ini
    }
    
    pub fn load(allocator: Allocator) !Settings {
        // Read from file or use defaults
    }
};
```

### Shader Management

**1. Compile Shaders at Build Time**
```zig
// build.zig
const shaders = [_][]const u8{
    "advection", "divergence", "pressure", "gradient",
    "curl", "vorticity", "splat", "display",
    "bloom", "sunrays", "blur",
};

for (shaders) |name| {
    const wgsl_path = b.fmt("shaders/{s}.wgsl", .{name});
    // Can validate/optimize at build time
}
```

**2. Shader Hot Reload (Debug Build)**
```zig
if (comptime builtin.mode == .Debug) {
    // Watch shader files, reload on change
}
```

### Networking (WebSocket for Multiplayer)

**1. Use websocket.zig**
```zig
const NetworkManager = struct {
    allocator: Allocator,
    conn: *ws.Conn,
    frame_arena: ArenaAllocator,
    
    pub fn sendSplat(self: *Self, splat: Splat) !void {
        const frame_alloc = self.frame_arena.allocator();
        defer _ = self.frame_arena.reset(.retain_capacity);
        
        // Serialize with MessagePack (2-3× smaller than JSON)
        var buffer: [256]u8 = undefined;
        var stream = std.io.fixedBufferStream(&buffer);
        var packer = msgpack.serializer(stream.writer());
        
        try packer.serialize(splat);
        try self.conn.write(stream.getWritten());
    }
};
```

---

## 📋 Multi-Phase Incremental Refactoring Plan

### Phase 8: Foundation Refactoring (Week 1)
**Goal:** Restructure existing code to follow Zig patterns

**8.1: Memory Management Overhaul**
- ✅ Create allocator hierarchy
- ✅ Add frame arena with retain limits
- ✅ Implement splat pool
- ✅ Pre-allocate all frame buffers
- ✅ Remove any frame-local allocations from hot paths

**8.2: Separate Concerns**
```
fluid_sim/
├── src/
│   ├── main.zig                  # Entry point
│   ├── app.zig                   # App struct, main loop
│   ├── simulation/
│   │   ├── simulation.zig        # Core fluid sim
│   │   ├── textures.zig          # Texture management (refactor gpu_textures.zig)
│   │   ├── pipelines.zig         # Pipeline management (refactor gpu_pipelines.zig)
│   │   └── kernels.zig           # Kernel dispatch logic
│   ├── renderer/
│   │   ├── renderer.zig          # Graphics abstraction
│   │   ├── display.zig           # Display shader
│   │   ├── effects.zig           # Bloom, sunrays, blur
│   │   └── shader_manager.zig    # Shader loading/compilation
│   ├── input/
│   │   ├── input.zig             # Input handling
│   │   ├── splat.zig             # Splat creation
│   │   └── mouse.zig             # Mouse tracking
│   ├── ui/
│   │   ├── ui.zig                # UI system (zgui)
│   │   ├── controls.zig          # Slider/button logic
│   │   ├── palette.zig           # Color palette system
│   │   └── settings.zig          # Settings UI
│   ├── network/
│   │   ├── network.zig           # Multiplayer sync
│   │   └── protocol.zig          # Message format
│   └── util/
│       ├── color.zig             # Color utilities
│       ├── math.zig              # Math helpers
│       └── pool.zig              # Pool allocator
```

**8.3: Introduce zgpu & zig-gamedev**
- ✅ Add dependencies to build.zig.zon
- ✅ Migrate from raw wgpu to zgpu abstractions
- ✅ Use zmath for SIMD math operations
- ✅ Integrate zgui for UI

**8.4: Fixed Timestep Game Loop**
- ✅ Implement accumulator pattern
- ✅ Add interpolation for rendering
- ✅ Separate simulation tick (60Hz) from render (variable)

**Deliverables:**
- Restructured codebase
- Frame arena with zero allocations in hot path
- zgpu integration
- Fixed timestep loop

**Success Criteria:**
- All existing tests still pass
- No performance regression
- Code compiles with new structure

---

### Phase 9: Core Simulation Features (Week 2)
**Goal:** Complete the Navier-Stokes solver with all missing features

**9.1: Curl & Vorticity**
- ✅ Port `curl_split.wgsl` (already created!)
- ✅ Create vorticity confinement shader
- ✅ Add curl strength parameter
- ✅ Wire into simulation step

**9.2: Splat System**
- ✅ Create `splat.wgsl` compute shader
- ✅ Implement splat pool allocator
- ✅ Add force application
- ✅ Support multiple splat shapes (point, line, brush)
- ✅ Color blending modes

**9.3: Multi-Resolution Support**
- ✅ Dynamic texture recreation
- ✅ Bind group cache invalidation
- ✅ UI for resolution control
- ✅ Performance scaling

**9.4: Multiple Dye Layers**
- ✅ Extend texture manager for N layers
- ✅ Layer compositing
- ✅ Independent advection per layer

**Deliverables:**
- Complete fluid simulation matching JS feature set
- Splat system working with mouse input
- Vorticity confinement for turbulent flow
- Dynamic resolution scaling

**Success Criteria:**
- Visual output matches JS version
- 60 FPS at default resolution
- Stable simulation behavior

---

### Phase 10: Rendering & Effects (Week 3)
**Goal:** Port all visual effects and display modes

**10.1: Display Shader**
- ✅ Create `display.wgsl` fragment shader
- ✅ Velocity visualization modes
- ✅ Density visualization
- ✅ Pressure visualization
- ✅ Curl visualization
- ✅ Color mapping from palettes

**10.2: Bloom Effect**
- ✅ Port bloom shader pipeline
- ✅ Downsampling pass
- ✅ Gaussian blur
- ✅ Upsampling and combine
- ✅ Intensity control

**10.3: Sunrays Effect**
- ✅ Port sunrays shader
- ✅ Radial blur
- ✅ Weight calculation
- ✅ Integration with display

**10.4: Blur Shader**
- ✅ Separable Gaussian blur
- ✅ Variable kernel size
- ✅ Optimize with compute

**Deliverables:**
- All rendering effects working
- Multiple display modes
- Visual fidelity matching JS version

**Success Criteria:**
- Bloom looks identical to JS
- Sunrays work correctly
- No visual artifacts
- 60 FPS maintained with all effects enabled

---

### Phase 11: UI System (Week 4)
**Goal:** Complete user interface with all controls

**11.1: Dear ImGui Integration**
- ✅ Setup zgui
- ✅ Create main control panel
- ✅ Window docking/layout
- ✅ Theme matching original

**11.2: All Sliders**
```
Simulation:
- Pressure iterations
- Curl strength
- Dissipation (velocity, density)
- Time step
- Viscosity

Rendering:
- Bloom intensity/iterations
- Sunrays weight/decay
- Display brightness/saturation
- Resolution scale (sim, dye, visual)

Forces:
- Splat radius
- Splat force
- Color intensity
```

**11.3: Color System**
- ✅ Color picker
- ✅ Palette carousel
- ✅ Random color mode
- ✅ Stepping mode
- ✅ Custom palette creation

**11.4: Additional Controls**
- ✅ Pause/play
- ✅ Clear simulation
- ✅ Reset to defaults
- ✅ Preset selector

**Deliverables:**
- Complete UI with all JS features
- Responsive controls
- Visual feedback

**Success Criteria:**
- All parameters adjustable
- UI matches JS functionality
- Smooth interaction
- Settings persist correctly

---

### Phase 12: Settings & Persistence (Week 5)
**Goal:** Settings management and file I/O

**12.1: Settings System**
- ✅ Define Settings struct
- ✅ Serialization (INI or binary)
- ✅ Load/save from ~/.fluid-sim/
- ✅ Default profiles

**12.2: Export/Import**
- ✅ JSON export for compatibility
- ✅ File dialog (native or zgui)
- ✅ Merge vs replace modes
- ✅ Validation

**12.3: Palette Management**
- ✅ Save custom palettes
- ✅ Delete/rename palettes
- ✅ Export/import palettes
- ✅ Palette file format

**Deliverables:**
- Settings persist across sessions
- Export/import working
- Palette library management

**Success Criteria:**
- No data loss on restart
- Files are human-readable (JSON/INI)
- Import from JS settings works

---

### Phase 13: Input & Interaction (Week 6)
**Goal:** Complete mouse/keyboard/touch input

**13.1: Mouse Splat Integration**
- ✅ Mouse move → splat generation
- ✅ Click & drag trails
- ✅ Velocity calculation from mouse delta
- ✅ Color picker from palette

**13.2: Keyboard Shortcuts**
```
Space   - Pause/play
C       - Clear
R       - Random color
P       - Step palette
S       - Save screenshot
ESC     - Exit
```

**13.3: Touch Support (Windows/Cross-platform)**
- ✅ Multi-touch splats
- ✅ Gesture recognition
- ✅ Touch-friendly UI

**Deliverables:**
- Full input system
- Keyboard shortcuts
- Touch support

**Success Criteria:**
- Splats feel responsive
- No input lag
- Touch works on tablets

---

### Phase 14: Recording & Playback (Week 7)
**Goal:** Port recording layer system

**14.1: Recording System**
- ✅ Mouse position capture
- ✅ Timestamp recording
- ✅ Playback with interpolation
- ✅ Layer system

**14.2: Recording UI**
- ✅ Record button
- ✅ Playback controls
- ✅ Layer visibility
- ✅ Layer ordering

**14.3: Export/Import**
- ✅ Recording file format
- ✅ Export to file
- ✅ Import recordings

**Deliverables:**
- Recording system working
- Layers can be saved/loaded

**Success Criteria:**
- Recordings replay accurately
- No performance impact when recording

---

### Phase 15: Multiplayer (Week 8)
**Goal:** Network synchronization

**15.1: WebSocket Client**
- ✅ Connect to server
- ✅ MessagePack protocol
- ✅ Delta compression

**15.2: State Sync**
- ✅ Splat replication
- ✅ Player cursors
- ✅ Client-side prediction
- ✅ Reconciliation

**15.3: Server (Optional)**
- ✅ Zig WebSocket server
- ✅ Player management
- ✅ State broadcast

**Deliverables:**
- Multiplayer working
- Low latency
- Smooth cursor display

**Success Criteria:**
- 100ms latency acceptable
- No desync issues
- Graceful disconnect handling

---

### Phase 16: Polish & Performance (Week 9)
**Goal:** Optimization and quality-of-life improvements

**16.1: SIMD Optimization**
- ✅ Use @Vector for particle updates
- ✅ SIMD math utilities (zmath)
- ✅ Profile and optimize hot paths

**16.2: GPU Optimization**
- ✅ Batch command submission
- ✅ Reduce bind group changes
- ✅ Optimize shader workgroup sizes
- ✅ GPU memory profiling

**16.3: Quality of Life**
- ✅ Better error messages
- ✅ Loading screen
- ✅ FPS limiter option
- ✅ V-sync toggle

**16.4: Profiling Integration**
- ✅ Tracy profiler (ztracy)
- ✅ GPU timeline
- ✅ Memory tracking

**Deliverables:**
- Optimized performance
- Professional polish

**Success Criteria:**
- 60 FPS @ 1920x1080
- <10ms frame time
- <50 MB memory usage

---

### Phase 17: Cross-Platform & Distribution (Week 10)
**Goal:** Build for all platforms, package for distribution

**17.1: Platform Support**
- ✅ Windows (working)
- ✅ Linux (X11/Wayland)
- ✅ macOS (Metal/WebGPU)
- ✅ Web (WASM via Emscripten)

**17.2: Build System**
- ✅ Cross-compilation tested
- ✅ CI/CD pipeline
- ✅ Release packaging

**17.3: Documentation**
- ✅ User guide
- ✅ Developer docs
- ✅ API reference

**Deliverables:**
- Binaries for all platforms
- Installer/package
- Complete documentation

**Success Criteria:**
- Single command to build for any platform
- No platform-specific bugs
- Professional documentation

---

## 🎯 Success Metrics

**Performance Targets:**
- 60 FPS @ 1920x1080 with all effects
- <50 MB RAM usage
- <1 second startup time
- <10ms frame time (p99)

**Feature Parity:**
- 100% of JS simulation features
- 100% of JS UI features
- All visual effects matching
- Settings persistence working

**Code Quality:**
- Zero memory leaks (testing.allocator)
- Zero crashes (error handling)
- <5% test coverage gaps
- All public APIs documented

**User Experience:**
- Smooth, responsive interaction
- Intuitive UI
- Settings persist correctly
- No visual glitches

---

## 🛠️ Tools & Dependencies

**Core:**
- Zig 0.15.2
- wgpu-native 0.19.4
- zig-gamedev (zgpu, zmath, zgui, zglfw)

**Additional:**
- websocket.zig (multiplayer)
- msgpack.zig (serialization)
- zig-ini or custom (settings)
- Tracy profiler (ztracy)

**Build:**
- glslangValidator (shader compilation)
- git (version control)
- CI/CD (GitHub Actions)

---

## 📚 Learning Resources

**Zig Patterns:**
- Allocator strategies
- Comptime programming
- Error handling
- Build system

**Graphics:**
- WebGPU API
- Compute shaders (WGSL)
- Render pipelines
- Texture management

**Game Dev:**
- Fixed timestep
- Input handling
- UI systems (ImGui)
- Networking

---

## 🚀 Getting Started with Phase 8

**Immediate Next Steps:**
1. Create new directory structure
2. Add zig-gamedev to build.zig.zon
3. Refactor existing code into modules
4. Implement frame arena
5. Run all tests to ensure no regression

**First PR should contain:**
- New directory structure
- Refactored code (no new features)
- All tests passing
- Documentation updates

---

**This plan transforms our working prototype into a production-quality application that matches and exceeds the original JavaScript version, following Zig best practices every step of the way.**
