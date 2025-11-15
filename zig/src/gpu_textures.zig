// GPU Texture Management for Fluid Simulation
const std = @import("std");
const gpu = @import("gpu_backend_real.zig");

pub const FluidTextures = struct {
    // Velocity textures - SPLIT into separate X and Y components (r32float each)
    // This is required because rg32float is not supported for storage textures!
    velocity_x_read: gpu.Texture,
    velocity_x_write: gpu.Texture,
    velocity_y_read: gpu.Texture,
    velocity_y_write: gpu.Texture,
    
    // Density textures (4 channels, RGBA8Unorm for display, can use filtering)
    density_read: gpu.Texture,
    density_write: gpu.Texture,
    
    // Pressure textures (1 channel, r32float)
    pressure_read: gpu.Texture,
    pressure_write: gpu.Texture,
    
    // Intermediate textures (1 channel, r32float)
    divergence: gpu.Texture,
    curl: gpu.Texture,
    
    // Texture views for shader access
    velocity_x_read_view: gpu.TextureView,
    velocity_x_write_view: gpu.TextureView,
    velocity_y_read_view: gpu.TextureView,
    velocity_y_write_view: gpu.TextureView,
    density_read_view: gpu.TextureView,
    density_write_view: gpu.TextureView,
    pressure_read_view: gpu.TextureView,
    pressure_write_view: gpu.TextureView,
    divergence_view: gpu.TextureView,
    curl_view: gpu.TextureView,
    
    device: *gpu.Device,
    
    pub fn init(device: *gpu.Device, sim_width: u32, sim_height: u32, dye_width: u32, dye_height: u32) !FluidTextures {
        std.log.info("🔥 Creating fluid textures (Phase 6 - split velocity pattern)...", .{});
        std.log.info("  Sim resolution: {}x{}", .{sim_width, sim_height});
        std.log.info("  Dye resolution: {}x{}", .{dye_width, dye_height});
        
        // Phase 6: Use r32float for all simulation textures (storage texture compatible!)
        // Velocity is split into separate X and Y component textures
        
        // === Velocity Textures (Split Components) ===
        std.log.info("  Creating velocity textures (split x/y components)...", .{});
        
        var velocity_x_read = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,  // For reading in shaders
            .storage_binding = true,  // For writing in compute shaders
        });
        errdefer velocity_x_read.deinit();
        
        var velocity_x_write = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        errdefer velocity_x_write.deinit();
        
        var velocity_y_read = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        errdefer velocity_y_read.deinit();
        
        var velocity_y_write = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        errdefer velocity_y_write.deinit();
        std.log.info("  ✅ velocity (x,y): {}x{} r32float (4 textures)", .{sim_width, sim_height});
        
        // === Density Textures (RGBA8Unorm for display) ===
        var density_read = try device.createTexture(dye_width, dye_height, .RGBA8Unorm, .{
            .texture_binding = true,
            .storage_binding = true,
            .render_attachment = true,  // Can render to it
        });
        errdefer density_read.deinit();
        
        var density_write = try device.createTexture(dye_width, dye_height, .RGBA8Unorm, .{
            .texture_binding = true,
            .storage_binding = true,
            .render_attachment = true,
        });
        errdefer density_write.deinit();
        std.log.info("  ✅ density: {}x{} rgba8unorm", .{dye_width, dye_height});
        
        // === Pressure Textures (r32float) ===
        var pressure_read = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        errdefer pressure_read.deinit();
        
        var pressure_write = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        errdefer pressure_write.deinit();
        std.log.info("  ✅ pressure: {}x{} r32float", .{sim_width, sim_height});
        
        // === Intermediate Textures (r32float) ===
        var divergence = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        errdefer divergence.deinit();
        
        var curl = try device.createTexture(sim_width, sim_height, .R32Float, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        errdefer curl.deinit();
        std.log.info("  ✅ intermediate: {}x{} r32float (divergence, curl)", .{sim_width, sim_height});
        
        // === Create Texture Views ===
        var velocity_x_read_view = try velocity_x_read.createView();
        errdefer velocity_x_read_view.deinit();
        
        var velocity_x_write_view = try velocity_x_write.createView();
        errdefer velocity_x_write_view.deinit();
        
        var velocity_y_read_view = try velocity_y_read.createView();
        errdefer velocity_y_read_view.deinit();
        
        var velocity_y_write_view = try velocity_y_write.createView();
        errdefer velocity_y_write_view.deinit();
        
        var density_read_view = try density_read.createView();
        errdefer density_read_view.deinit();
        
        var density_write_view = try density_write.createView();
        errdefer density_write_view.deinit();
        
        var pressure_read_view = try pressure_read.createView();
        errdefer pressure_read_view.deinit();
        
        var pressure_write_view = try pressure_write.createView();
        errdefer pressure_write_view.deinit();
        
        var divergence_view = try divergence.createView();
        errdefer divergence_view.deinit();
        
        var curl_view = try curl.createView();
        errdefer curl_view.deinit();
        
        std.log.info("  ✅ All texture views created", .{});
        
        // === Memory Usage ===
        const velocity_size = sim_width * sim_height * 4 * 4; // 4 textures, r32float = 4 bytes/pixel
        const density_size = dye_width * dye_height * 4 * 2; // 2 textures, rgba8unorm = 4 bytes/pixel
        const pressure_size = sim_width * sim_height * 4 * 2; // 2 textures, r32float = 4 bytes/pixel
        const intermediate_size = sim_width * sim_height * 4 * 2; // 2 textures, r32float = 4 bytes/pixel
        
        const total_size = velocity_size + density_size + pressure_size + intermediate_size;
        
        std.log.info("", .{});
        std.log.info("📈 Memory Usage (Phase 6 - optimized formats):", .{});
        std.log.info("  Velocity (x,y split): {d:.2} MB", .{@as(f64, @floatFromInt(velocity_size)) / 1024.0 / 1024.0});
        std.log.info("  Density (rgba8unorm): {d:.2} MB", .{@as(f64, @floatFromInt(density_size)) / 1024.0 / 1024.0});
        std.log.info("  Pressure (r32float): {d:.2} MB", .{@as(f64, @floatFromInt(pressure_size)) / 1024.0 / 1024.0});
        std.log.info("  Intermediate (r32float): {d:.2} MB", .{@as(f64, @floatFromInt(intermediate_size)) / 1024.0 / 1024.0});
        std.log.info("  ──────────────────────", .{});
        std.log.info("  Total: {d:.2} MB", .{@as(f64, @floatFromInt(total_size)) / 1024.0 / 1024.0});
        
        return FluidTextures{
            .velocity_x_read = velocity_x_read,
            .velocity_x_write = velocity_x_write,
            .velocity_y_read = velocity_y_read,
            .velocity_y_write = velocity_y_write,
            .density_read = density_read,
            .density_write = density_write,
            .pressure_read = pressure_read,
            .pressure_write = pressure_write,
            .divergence = divergence,
            .curl = curl,
            .velocity_x_read_view = velocity_x_read_view,
            .velocity_x_write_view = velocity_x_write_view,
            .velocity_y_read_view = velocity_y_read_view,
            .velocity_y_write_view = velocity_y_write_view,
            .density_read_view = density_read_view,
            .density_write_view = density_write_view,
            .pressure_read_view = pressure_read_view,
            .pressure_write_view = pressure_write_view,
            .divergence_view = divergence_view,
            .curl_view = curl_view,
            .device = device,
        };
    }
    
    pub fn deinit(self: *FluidTextures) void {
        // Clean up all resources
        self.velocity_x_read_view.deinit();
        self.velocity_x_write_view.deinit();
        self.velocity_y_read_view.deinit();
        self.velocity_y_write_view.deinit();
        self.density_read_view.deinit();
        self.density_write_view.deinit();
        self.pressure_read_view.deinit();
        self.pressure_write_view.deinit();
        self.divergence_view.deinit();
        self.curl_view.deinit();
        
        self.velocity_x_read.deinit();
        self.velocity_x_write.deinit();
        self.velocity_y_read.deinit();
        self.velocity_y_write.deinit();
        self.density_read.deinit();
        self.density_write.deinit();
        self.pressure_read.deinit();
        self.pressure_write.deinit();
        self.divergence.deinit();
        self.curl.deinit();
    }
    
    pub fn swapVelocity(self: *FluidTextures) void {
        // Swap both X and Y components
        std.mem.swap(gpu.Texture, &self.velocity_x_read, &self.velocity_x_write);
        std.mem.swap(gpu.TextureView, &self.velocity_x_read_view, &self.velocity_x_write_view);
        std.mem.swap(gpu.Texture, &self.velocity_y_read, &self.velocity_y_write);
        std.mem.swap(gpu.TextureView, &self.velocity_y_read_view, &self.velocity_y_write_view);
    }
    
    pub fn swapDensity(self: *FluidTextures) void {
        std.mem.swap(gpu.Texture, &self.density_read, &self.density_write);
        std.mem.swap(gpu.TextureView, &self.density_read_view, &self.density_write_view);
    }
    
    pub fn swapPressure(self: *FluidTextures) void {
        std.mem.swap(gpu.Texture, &self.pressure_read, &self.pressure_write);
        std.mem.swap(gpu.TextureView, &self.pressure_read_view, &self.pressure_write_view);
    }
};
