const std = @import("std");
const gpu = @import("gpu.zig");
const gpu_sim = @import("gpu_sim.zig");
const window = @import("window.zig");
const win32_window = @import("win32_window.zig");
const kernels = @import("kernels.zig");
const util = @import("util.zig");
const grid = @import("grid.zig");
const kaleido = @import("kaleido.zig");
const prng = @import("prng.zig");
const image = @import("image.zig");
const config_mod = @import("config.zig");

const Vec2 = util.Vec2;
const Vec4 = util.Vec4;

// Render simulation density to window pixels
fn renderToWindow(win: *win32_window.Window, density: []const Vec4, sim_width: usize, sim_height: usize) void {
    const scale_x = @as(f32, @floatFromInt(sim_width)) / @as(f32, @floatFromInt(win.width));
    const scale_y = @as(f32, @floatFromInt(sim_height)) / @as(f32, @floatFromInt(win.height));
    
    var y: u32 = 0;
    while (y < win.height) : (y += 1) {
        var x: u32 = 0;
        while (x < win.width) : (x += 1) {
            // Sample from simulation grid
            const sim_x = @as(usize, @intFromFloat(@as(f32, @floatFromInt(x)) * scale_x));
            const sim_y = @as(usize, @intFromFloat(@as(f32, @floatFromInt(y)) * scale_y));
            
            if (sim_x < sim_width and sim_y < sim_height) {
                const idx = sim_y * sim_width + sim_x;
                const color = density[idx];
                
                // Boost brightness for visibility (3x like in image output)
                const boosted_r = @min(color.r * 3.0, 1.0);
                const boosted_g = @min(color.g * 3.0, 1.0);
                const boosted_b = @min(color.b * 3.0, 1.0);
                
                // Convert to BGRA bytes
                const pixel_idx = (y * win.width + x) * 4;
                win.pixels[pixel_idx + 0] = @intFromFloat(@min(@max(boosted_b * 255.0, 0.0), 255.0)); // B
                win.pixels[pixel_idx + 1] = @intFromFloat(@min(@max(boosted_g * 255.0, 0.0), 255.0)); // G
                win.pixels[pixel_idx + 2] = @intFromFloat(@min(@max(boosted_r * 255.0, 0.0), 255.0)); // R
                win.pixels[pixel_idx + 3] = 255; // A
            }
        }
    }
}

// Simulation state
const SimState = struct {
    allocator: std.mem.Allocator,
    width: usize,
    height: usize,
    dt: f32,
    
    // Configuration parameters
    density_dissipation: f32,
    velocity_dissipation: f32,
    pressure_iterations: u32,
    curl_strength: f32,
    
    velocity_read: []Vec2,
    velocity_write: []Vec2,
    density_read: []Vec4,
    density_write: []Vec4,
    divergence: []f32,
    curl: []f32,
    pressure_read: []f32,
    pressure_write: []f32,
    
    pub fn init(allocator: std.mem.Allocator, w: usize, h: usize, config: *const config_mod.Config) !SimState {
        const n = w * h;
        
        const vel_r = try allocator.alloc(Vec2, n);
        const vel_w = try allocator.alloc(Vec2, n);
        const den_r = try allocator.alloc(Vec4, n);
        const den_w = try allocator.alloc(Vec4, n);
        const div = try allocator.alloc(f32, n);
        const cur = try allocator.alloc(f32, n);
        const p_r = try allocator.alloc(f32, n);
        const p_w = try allocator.alloc(f32, n);
        
        // Initialize to zero
        @memset(vel_r, Vec2{.x=0,.y=0});
        @memset(vel_w, Vec2{.x=0,.y=0});
        @memset(den_r, Vec4{.r=0,.g=0,.b=0,.a=0});
        @memset(den_w, Vec4{.r=0,.g=0,.b=0,.a=0});
        @memset(div, 0);
        @memset(cur, 0);
        @memset(p_r, 0);
        @memset(p_w, 0);
        
        return SimState{
            .allocator = allocator,
            .width = w,
            .height = h,
            .dt = 0.016,
            
            // Use config values
            .density_dissipation = config.density_dissipation,
            .velocity_dissipation = config.velocity_dissipation,
            .pressure_iterations = config.pressure_iterations,
            .curl_strength = config.curl,
            
            .velocity_read = vel_r,
            .velocity_write = vel_w,
            .density_read = den_r,
            .density_write = den_w,
            .divergence = div,
            .curl = cur,
            .pressure_read = p_r,
            .pressure_write = p_w,
        };
    }
    
    pub fn deinit(self: *SimState) void {
        self.allocator.free(self.velocity_read);
        self.allocator.free(self.velocity_write);
        self.allocator.free(self.density_read);
        self.allocator.free(self.density_write);
        self.allocator.free(self.divergence);
        self.allocator.free(self.curl);
        self.allocator.free(self.pressure_read);
        self.allocator.free(self.pressure_write);
    }
    
    pub fn step(self: *SimState) void {
        const w = self.width;
        const h = self.height;
        
        // Advect velocity with proper dissipation
        kernels.advectVec2(
            self.velocity_write,
            self.velocity_read,
            self.velocity_read,
            w, h,
            self.dt,
            self.velocity_dissipation,
            0.0
        );
        std.mem.swap([]Vec2, &self.velocity_read, &self.velocity_write);
        
        // Apply vorticity confinement (curl/swirl)
        if (self.curl_strength > 0.0) {
            kernels.curl(self.curl, self.velocity_read, w, h);
            kernels.vorticityConfinement(self.velocity_read, self.curl, w, h, self.curl_strength, self.dt);
        }
        
        // Pressure projection
        kernels.divergence(self.divergence, self.velocity_read, w, h);
        
        // Jacobi iteration for pressure (use config iterations)
        var i: usize = 0;
        while (i < self.pressure_iterations) : (i += 1) {
            kernels.pressureJacobi(
                self.pressure_write,
                self.pressure_read,
                self.divergence,
                w, h,
                -1.0,
                0.25
            );
            std.mem.swap([]f32, &self.pressure_read, &self.pressure_write);
        }
        
        // Subtract pressure gradient
        kernels.gradientSubtract(self.velocity_read, self.pressure_read, w, h, 1.0);
        
        // Advect density with proper dissipation
        kernels.advectVec4(
            self.density_write,
            self.density_read,
            self.velocity_read,
            w, h,
            self.dt,
            self.density_dissipation,
            0.0
        );
        std.mem.swap([]Vec4, &self.density_read, &self.density_write);
    }
    
    // Add force with Gaussian splat (matching web version)
    pub fn addForce(self: *SimState, cx_f: f32, cy_f: f32, fx: f32, fy: f32, radius: f32) void {
        const w = self.width;
        const h = self.height;
        
        // Convert to grid coordinates
        const radius_px = radius * @as(f32, @floatFromInt(@max(w, h)));
        const cx = cx_f * @as(f32, @floatFromInt(w));
        const cy = cy_f * @as(f32, @floatFromInt(h));
        
        // Determine bounds
        const x_min = @max(0, @as(i32, @intFromFloat(cx - radius_px)));
        const x_max = @min(@as(i32, @intCast(w)), @as(i32, @intFromFloat(cx + radius_px)));
        const y_min = @max(0, @as(i32, @intFromFloat(cy - radius_px)));
        const y_max = @min(@as(i32, @intCast(h)), @as(i32, @intFromFloat(cy + radius_px)));
        
        var y: i32 = y_min;
        while (y < y_max) : (y += 1) {
            var x: i32 = x_min;
            while (x < x_max) : (x += 1) {
                const dx = @as(f32, @floatFromInt(x)) - cx;
                const dy = @as(f32, @floatFromInt(y)) - cy;
                const dist_sq = dx * dx + dy * dy;
                const r_sq = radius_px * radius_px;
                
                if (dist_sq < r_sq) {
                    // Gaussian falloff
                    const falloff = std.math.exp(-dist_sq / (r_sq * 0.5));
                    const idx = grid.idx(@intCast(x), @intCast(y), w);
                    self.velocity_read[idx].x += fx * falloff;
                    self.velocity_read[idx].y += fy * falloff;
                }
            }
        }
    }
    
    // Add density with Gaussian splat (matching web version)
    pub fn addDensity(self: *SimState, cx_f: f32, cy_f: f32, color: Vec4, radius: f32) void {
        const w = self.width;
        const h = self.height;
        
        // Convert to grid coordinates
        const radius_px = radius * @as(f32, @floatFromInt(@max(w, h)));
        const cx = cx_f * @as(f32, @floatFromInt(w));
        const cy = cy_f * @as(f32, @floatFromInt(h));
        
        // Determine bounds
        const x_min = @max(0, @as(i32, @intFromFloat(cx - radius_px)));
        const x_max = @min(@as(i32, @intCast(w)), @as(i32, @intFromFloat(cx + radius_px)));
        const y_min = @max(0, @as(i32, @intFromFloat(cy - radius_px)));
        const y_max = @min(@as(i32, @intCast(h)), @as(i32, @intFromFloat(cy + radius_px)));
        
        var y: i32 = y_min;
        while (y < y_max) : (y += 1) {
            var x: i32 = x_min;
            while (x < x_max) : (x += 1) {
                const dx = @as(f32, @floatFromInt(x)) - cx;
                const dy = @as(f32, @floatFromInt(y)) - cy;
                const dist_sq = dx * dx + dy * dy;
                const r_sq = radius_px * radius_px;
                
                if (dist_sq < r_sq) {
                    // Gaussian falloff
                    const falloff = std.math.exp(-dist_sq / (r_sq * 0.5));
                    const idx = grid.idx(@intCast(x), @intCast(y), w);
                    self.density_read[idx].r += color.r * falloff;
                    self.density_read[idx].g += color.g * falloff;
                    self.density_read[idx].b += color.b * falloff;
                    self.density_read[idx].a += color.a * falloff;
                }
            }
        }
    }
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();
    
    std.log.info("═══════════════════════════════════════", .{});
    std.log.info("  Fluid Simulation - REAL-TIME!", .{});
    std.log.info("  Interactive Window + Mouse Control", .{});
    std.log.info("═══════════════════════════════════════", .{});
    
    // Initialize GPU context
    var ctx = try gpu.GpuContext.init(allocator);
    defer ctx.deinit();
    
    // Load configuration (matching web version defaults)
    var config = try config_mod.Config.init(allocator);
    defer config.deinit();
    config.validate();
    config.print();
    
    const sim_width = config.sim_width;
    const sim_height = config.sim_height;
    
    std.log.info("\n🚀 Initializing GPU simulation...", .{});
    var gpu_simulation = try gpu_sim.GpuSimulation.init(allocator, &ctx, sim_width, sim_height);
    defer gpu_simulation.deinit();
    
    // Create GPU resources
    try gpu_simulation.createResources();
    
    // Create compute pipelines
    try gpu_simulation.createPipelines();
    
    // Create simulation with config
    std.log.info("\n💻 Creating fluid simulation...", .{});
    var sim = try SimState.init(allocator, sim_width, sim_height, &config);
    defer sim.deinit();
    
    // Create real-time window
    const window_width = config.display_width;
    const window_height = config.display_height;
    std.log.info("\n🪟 Opening window...", .{});
    var win = try win32_window.Window.init(allocator, window_width, window_height, "Fluid Simulation - Click and Drag!");
    defer win.deinit();
    
    std.log.info("\n▶ Starting real-time simulation...", .{});
    std.log.info("  Simulation: {d}x{d}", .{sim_width, sim_height});
    std.log.info("  Display: {d}x{d}", .{window_width, window_height});
    std.log.info("  Controls: Click and drag to add fluid!", .{});
    std.log.info("  Press X on window to exit\n", .{});
    
    // Mouse tracking
    var last_mouse_x: i32 = 0;
    var last_mouse_y: i32 = 0;
    var was_pressed = false;
    
    // Input state
    var input = config_mod.InputState.init();
    
    // FPS tracking
    var frame_times: [60]i128 = undefined;
    var frame_time_idx: usize = 0;
    var last_time = std.time.nanoTimestamp();
    
    // Main loop - real-time rendering
    var frame: usize = 0;
    while (!win.shouldClose()) : (frame += 1) {
        const frame_start = std.time.nanoTimestamp();
        
        // Poll events and get mouse state
        win.pollEvents();
        const mouse = win.getMouseState();
        
        // Handle mouse input with Gaussian splat
        if (mouse.pressed) {
            // Normalized coordinates [0, 1]
            const norm_x = @as(f32, @floatFromInt(@max(0, @min(mouse.x, @as(i32, @intCast(window_width)))))) / 
                          @as(f32, @floatFromInt(window_width));
            const norm_y = @as(f32, @floatFromInt(@max(0, @min(mouse.y, @as(i32, @intCast(window_height)))))) / 
                          @as(f32, @floatFromInt(window_height));
            
            // Calculate velocity from mouse movement
            if (was_pressed) {
                const dx = @as(f32, @floatFromInt(mouse.x - last_mouse_x)) * config.splat_force / @as(f32, @floatFromInt(window_width));
                const dy = @as(f32, @floatFromInt(mouse.y - last_mouse_y)) * config.splat_force / @as(f32, @floatFromInt(window_height));
                
                // Add force with Gaussian splat
                sim.addForce(norm_x, norm_y, dx, dy, config.splat_radius);
                
                // Cycle color
                input.cycleColorHue(2.0);
                
                const color = Vec4{
                    .r = input.current_color[0],
                    .g = input.current_color[1],
                    .b = input.current_color[2],
                    .a = 1.0,
                };
                
                // Add density with Gaussian splat
                sim.addDensity(norm_x, norm_y, color, config.splat_radius);
            }
        }
        
        last_mouse_x = mouse.x;
        last_mouse_y = mouse.y;
        was_pressed = mouse.pressed;
        
        // Step simulation
        sim.step();
        
        // Render density field to window pixels
        renderToWindow(&win, sim.density_read, sim_width, sim_height);
        
        // Present to screen
        win.present();
        
        // FPS tracking
        const frame_end = std.time.nanoTimestamp();
        frame_times[frame_time_idx] = frame_end - frame_start;
        frame_time_idx = (frame_time_idx + 1) % frame_times.len;
        
        // Log FPS every 60 frames
        if (frame % 60 == 0 and frame > 0) {
            var total_time: i128 = 0;
            for (frame_times) |t| total_time += t;
            const avg_time_ms = @as(f32, @floatFromInt(total_time)) / @as(f32, @floatFromInt(frame_times.len)) / 1_000_000.0;
            const fps = 1000.0 / avg_time_ms;
            std.log.info("Frame {d}: {d:.1} fps ({d:.2} ms/frame)", .{frame, fps, avg_time_ms});
        }
        
        // Cap at ~60fps
        const elapsed = frame_end - last_time;
        const target_ns = 16_666_666; // 60fps
        if (elapsed < target_ns) {
            std.Thread.sleep(@intCast(target_ns - elapsed));
        }
        last_time = std.time.nanoTimestamp();
    }
    
    std.log.info("\n✅ Window Closed!", .{});
    std.log.info("  Total frames: {d}", .{frame});
    std.log.info("\n🎉 Real-Time Fluid Simulation Working!", .{});
    std.log.info("  ✓ Interactive window with mouse control", .{});
    std.log.info("  ✓ Real-time physics computation", .{});
    std.log.info("  ✓ Color cycling on mouse drag", .{});
    std.log.info("  ✓ Smooth rendering", .{});
    std.log.info("\n🚀 Next Steps:", .{});
    std.log.info("  • Tune parameters to match web version", .{});
    std.log.info("  • Add GPU acceleration (50-100x speedup)", .{});
    std.log.info("  • Implement kaleidoscope effects", .{});
    std.log.info("  • Add UI controls", .{});
}
