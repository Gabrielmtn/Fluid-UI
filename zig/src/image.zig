const std = @import("std");
const util = @import("util.zig");

const Vec4 = util.Vec4;

// Simple BMP image writer for visualization
pub const BmpWriter = struct {
    allocator: std.mem.Allocator,
    width: u32,
    height: u32,
    pixels: []u8, // BGRA format
    
    pub fn init(allocator: std.mem.Allocator, width: u32, height: u32) !BmpWriter {
        const pixel_count = width * height * 4; // BGRA
        const pixels = try allocator.alloc(u8, pixel_count);
        @memset(pixels, 0);
        
        return BmpWriter{
            .allocator = allocator,
            .width = width,
            .height = height,
            .pixels = pixels,
        };
    }
    
    pub fn deinit(self: *BmpWriter) void {
        self.allocator.free(self.pixels);
    }
    
    pub fn setPixel(self: *BmpWriter, x: u32, y: u32, r: u8, g: u8, b: u8) void {
        if (x >= self.width or y >= self.height) return;
        
        // BMP is stored bottom-to-top
        const flipped_y = self.height - 1 - y;
        const idx = (flipped_y * self.width + x) * 4;
        
        self.pixels[idx + 0] = b; // B
        self.pixels[idx + 1] = g; // G
        self.pixels[idx + 2] = r; // R
        self.pixels[idx + 3] = 255; // A
    }
    
    pub fn setPixelFloat(self: *BmpWriter, x: u32, y: u32, color: Vec4) void {
        const r = @as(u8, @intFromFloat(@min(@max(color.r * 255.0, 0.0), 255.0)));
        const g = @as(u8, @intFromFloat(@min(@max(color.g * 255.0, 0.0), 255.0)));
        const b = @as(u8, @intFromFloat(@min(@max(color.b * 255.0, 0.0), 255.0)));
        self.setPixel(x, y, r, g, b);
    }
    
    pub fn clear(self: *BmpWriter, r: u8, g: u8, b: u8) void {
        var y: u32 = 0;
        while (y < self.height) : (y += 1) {
            var x: u32 = 0;
            while (x < self.width) : (x += 1) {
                self.setPixel(x, y, r, g, b);
            }
        }
    }
    
    pub fn writeToDisk(self: *BmpWriter, path: []const u8) !void {
        const file = try std.fs.cwd().createFile(path, .{});
        defer file.close();
        
        // BMP header - build in memory first
        const file_size: u32 = @intCast(54 + self.pixels.len);
        const pixel_data_offset: u32 = 54;
        
        var header: [54]u8 = undefined;
        var pos: usize = 0;
        
        // BMP file header (14 bytes)
        header[pos] = 'B'; pos += 1;
        header[pos] = 'M'; pos += 1;
        std.mem.writeInt(u32, header[pos..][0..4], file_size, .little); pos += 4;
        std.mem.writeInt(u32, header[pos..][0..4], 0, .little); pos += 4; // Reserved
        std.mem.writeInt(u32, header[pos..][0..4], pixel_data_offset, .little); pos += 4;
        
        // DIB header (40 bytes)
        std.mem.writeInt(u32, header[pos..][0..4], 40, .little); pos += 4; // Header size
        std.mem.writeInt(i32, header[pos..][0..4], @intCast(self.width), .little); pos += 4;
        std.mem.writeInt(i32, header[pos..][0..4], @intCast(self.height), .little); pos += 4;
        std.mem.writeInt(u16, header[pos..][0..2], 1, .little); pos += 2; // Color planes
        std.mem.writeInt(u16, header[pos..][0..2], 32, .little); pos += 2; // Bits per pixel
        std.mem.writeInt(u32, header[pos..][0..4], 0, .little); pos += 4; // Compression
        std.mem.writeInt(u32, header[pos..][0..4], @intCast(self.pixels.len), .little); pos += 4; // Image size
        std.mem.writeInt(i32, header[pos..][0..4], 2835, .little); pos += 4; // X ppm
        std.mem.writeInt(i32, header[pos..][0..4], 2835, .little); pos += 4; // Y ppm
        std.mem.writeInt(u32, header[pos..][0..4], 0, .little); pos += 4; // Colors in palette
        std.mem.writeInt(u32, header[pos..][0..4], 0, .little); pos += 4; // Important colors
        
        // Write header and pixel data
        try file.writeAll(&header);
        try file.writeAll(self.pixels);
        
        std.log.info("✓ Saved: {s}", .{path});
    }
};

// Render simulation state to image
pub fn renderDensityField(
    writer: *BmpWriter,
    density: []const Vec4,
    sim_width: usize,
    sim_height: usize,
) void {
    // Scale simulation to image size
    const scale_x = @as(f32, @floatFromInt(sim_width)) / @as(f32, @floatFromInt(writer.width));
    const scale_y = @as(f32, @floatFromInt(sim_height)) / @as(f32, @floatFromInt(writer.height));
    
    var y: u32 = 0;
    while (y < writer.height) : (y += 1) {
        var x: u32 = 0;
        while (x < writer.width) : (x += 1) {
            // Sample from simulation grid
            const sim_x = @as(usize, @intFromFloat(@as(f32, @floatFromInt(x)) * scale_x));
            const sim_y = @as(usize, @intFromFloat(@as(f32, @floatFromInt(y)) * scale_y));
            
            if (sim_x < sim_width and sim_y < sim_height) {
                const idx = sim_y * sim_width + sim_x;
                const color = density[idx];
                
                // Boost brightness for visibility
                const boosted = Vec4{
                    .r = @min(color.r * 3.0, 1.0),
                    .g = @min(color.g * 3.0, 1.0),
                    .b = @min(color.b * 3.0, 1.0),
                    .a = 1.0,
                };
                
                writer.setPixelFloat(x, y, boosted);
            }
        }
    }
}
