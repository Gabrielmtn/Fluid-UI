const std = @import("std");
const Pool = @import("../util/pool.zig").Pool;

/// Represents a single force splat applied to the fluid
pub const Splat = struct {
    // Position in normalized coordinates [0, 1]
    x: f32,
    y: f32,
    
    // Velocity delta
    dx: f32,
    dy: f32,
    
    // Splat properties
    radius: f32,
    force: f32,
    
    // Color (RGB)
    color: [3]f32,
    
    // Lifetime tracking
    age: f32,
    lifetime: f32,
    
    /// Create a new splat
    pub fn init(x: f32, y: f32, dx: f32, dy: f32, radius: f32, color: [3]f32) Splat {
        return .{
            .x = x,
            .y = y,
            .dx = dx,
            .dy = dy,
            .radius = radius,
            .force = 1.0,
            .color = color,
            .age = 0.0,
            .lifetime = 0.1, // Default: 100ms splat lifetime
        };
    }
    
    /// Update splat age
    pub fn update(self: *Splat, dt: f32) bool {
        self.age += dt;
        return self.age < self.lifetime;
    }
    
    /// Check if splat is expired
    pub fn isExpired(self: *Splat) bool {
        return self.age >= self.lifetime;
    }
    
    /// Get interpolation factor (0.0 = new, 1.0 = expired)
    pub fn getFade(self: *Splat) f32 {
        return std.math.clamp(self.age / self.lifetime, 0.0, 1.0);
    }
};

/// Manages a pool of splats with automatic lifecycle
/// 
/// Design:
/// - Uses Pool allocator for O(1) create/destroy
/// - Active splats tracked in array
/// - Automatic expiration and cleanup
/// - Statistics for debugging
pub const SplatSystem = struct {
    const Self = @This();
    const SplatList = std.ArrayList(*Splat);
    
    // === Resources ===
    pool: Pool(Splat),
    active_splats: SplatList,
    allocator: std.mem.Allocator,
    
    // === Configuration ===
    max_splats: usize,
    default_radius: f32,
    default_lifetime: f32,
    
    // === Statistics ===
    total_created: u64,
    total_expired: u64,
    peak_active: usize,
    
    /// Initialize splat system
    pub fn init(allocator: std.mem.Allocator, max_splats: usize) !Self {
        var pool = Pool(Splat).init(allocator);
        errdefer pool.deinit();
        
        var active_splats = SplatList.init(allocator);
        errdefer active_splats.deinit();
        
        try active_splats.ensureTotalCapacity(max_splats);
        
        return Self{
            .pool = pool,
            .active_splats = active_splats,
            .allocator = allocator,
            .max_splats = max_splats,
            .default_radius = 0.011,
            .default_lifetime = 0.1,
            .total_created = 0,
            .total_expired = 0,
            .peak_active = 0,
        };
    }
    
    pub fn deinit(self: *Self) void {
        // Clear all active splats (returns them to pool)
        for (self.active_splats.items) |splat| {
            self.pool.destroy(splat);
        }
        self.active_splats.deinit();
        self.pool.deinit();
    }
    
    /// Create a new splat
    /// Returns null if max_splats limit reached
    pub fn createSplat(
        self: *Self,
        x: f32,
        y: f32,
        dx: f32,
        dy: f32,
        radius: f32,
        color: [3]f32,
    ) !?*Splat {
        // Check limit
        if (self.active_splats.items.len >= self.max_splats) {
            return null;
        }
        
        // Get from pool (O(1))
        var splat = try self.pool.create();
        splat.* = Splat.init(x, y, dx, dy, radius, color);
        splat.lifetime = self.default_lifetime;
        
        // Track
        try self.active_splats.append(splat);
        self.total_created += 1;
        
        if (self.active_splats.items.len > self.peak_active) {
            self.peak_active = self.active_splats.items.len;
        }
        
        return splat;
    }
    
    /// Update all active splats and expire old ones
    /// Returns number of expired splats
    pub fn update(self: *Self, dt: f32) usize {
        var expired_count: usize = 0;
        var i: usize = 0;
        
        while (i < self.active_splats.items.len) {
            const splat = self.active_splats.items[i];
            
            if (!splat.update(dt)) {
                // Expired - remove and return to pool
                _ = self.active_splats.swapRemove(i);
                self.pool.destroy(splat);
                expired_count += 1;
                self.total_expired += 1;
                // Don't increment i - we swapped the last element here
            } else {
                i += 1;
            }
        }
        
        return expired_count;
    }
    
    /// Get all active splats
    pub fn getActiveSplats(self: *Self) []const *Splat {
        return self.active_splats.items;
    }
    
    /// Get number of active splats
    pub fn getActiveCount(self: *Self) usize {
        return self.active_splats.items.len;
    }
    
    /// Clear all active splats
    pub fn clear(self: *Self) void {
        for (self.active_splats.items) |splat| {
            self.pool.destroy(splat);
        }
        self.active_splats.clearRetainingCapacity();
    }
    
    /// Set default splat properties
    pub fn setDefaultRadius(self: *Self, radius: f32) void {
        self.default_radius = std.math.clamp(radius, 0.001, 0.5);
    }
    
    pub fn setDefaultLifetime(self: *Self, lifetime: f32) void {
        self.default_lifetime = std.math.clamp(lifetime, 0.01, 5.0);
    }
    
    /// Get statistics
    pub fn getStats(self: *Self) SplatStats {
        return .{
            .active_count = self.active_splats.items.len,
            .pool_capacity = self.pool.total_capacity,
            .pool_allocated = self.pool.allocated_count,
            .total_created = self.total_created,
            .total_expired = self.total_expired,
            .peak_active = self.peak_active,
        };
    }
    
    /// Format for logging
    pub fn format(
        self: *Self,
        comptime fmt: []const u8,
        options: std.fmt.FormatOptions,
        writer: anytype,
    ) !void {
        _ = fmt;
        _ = options;
        const stats = self.getStats();
        try writer.print(
            "SplatSystem(active={}, pool={}/{}, created={}, expired={}, peak={})",
            .{
                stats.active_count,
                stats.pool_allocated,
                stats.pool_capacity,
                stats.total_created,
                stats.total_expired,
                stats.peak_active,
            },
        );
    }
};

/// Splat system statistics
pub const SplatStats = struct {
    active_count: usize,
    pool_capacity: usize,
    pool_allocated: usize,
    total_created: u64,
    total_expired: u64,
    peak_active: usize,
};

// ============================================================================
// Tests
// ============================================================================

test "Splat: initialization and properties" {
    const splat = Splat.init(0.5, 0.5, 0.1, 0.2, 0.015, [3]f32{ 1.0, 0.5, 0.0 });
    
    try std.testing.expectEqual(@as(f32, 0.5), splat.x);
    try std.testing.expectEqual(@as(f32, 0.5), splat.y);
    try std.testing.expectEqual(@as(f32, 0.1), splat.dx);
    try std.testing.expectEqual(@as(f32, 0.2), splat.dy);
    try std.testing.expectEqual(@as(f32, 0.015), splat.radius);
    try std.testing.expectEqual(@as(f32, 0.0), splat.age);
    try std.testing.expect(!splat.isExpired());
}

test "Splat: aging and expiration" {
    var splat = Splat.init(0.5, 0.5, 0.0, 0.0, 0.015, [3]f32{ 1.0, 0.0, 0.0 });
    splat.lifetime = 0.1; // 100ms
    
    try std.testing.expect(!splat.isExpired());
    
    // Update 50ms
    _ = splat.update(0.05);
    try std.testing.expect(!splat.isExpired());
    try std.testing.expectApproxEqAbs(@as(f32, 0.5), splat.getFade(), 0.01);
    
    // Update another 60ms (total 110ms, should expire)
    const still_alive = splat.update(0.06);
    try std.testing.expect(splat.isExpired());
    try std.testing.expect(!still_alive);
    try std.testing.expectEqual(@as(f32, 1.0), splat.getFade());
}

test "SplatSystem: creation and destruction" {
    var system = try SplatSystem.init(std.testing.allocator, 100);
    defer system.deinit();
    
    try std.testing.expectEqual(@as(usize, 0), system.getActiveCount());
    
    const splat = try system.createSplat(0.5, 0.5, 0.1, 0.1, 0.015, [3]f32{ 1.0, 0.0, 0.0 });
    try std.testing.expect(splat != null);
    try std.testing.expectEqual(@as(usize, 1), system.getActiveCount());
    
    system.clear();
    try std.testing.expectEqual(@as(usize, 0), system.getActiveCount());
}

test "SplatSystem: automatic expiration" {
    var system = try SplatSystem.init(std.testing.allocator, 100);
    defer system.deinit();
    
    system.setDefaultLifetime(0.1); // 100ms
    
    // Create 3 splats
    _ = try system.createSplat(0.3, 0.3, 0.1, 0.1, 0.015, [3]f32{ 1.0, 0.0, 0.0 });
    _ = try system.createSplat(0.5, 0.5, 0.1, 0.1, 0.015, [3]f32{ 0.0, 1.0, 0.0 });
    _ = try system.createSplat(0.7, 0.7, 0.1, 0.1, 0.015, [3]f32{ 0.0, 0.0, 1.0 });
    
    try std.testing.expectEqual(@as(usize, 3), system.getActiveCount());
    
    // Update 50ms - all still alive
    _ = system.update(0.05);
    try std.testing.expectEqual(@as(usize, 3), system.getActiveCount());
    
    // Update another 60ms - all should expire
    const expired = system.update(0.06);
    try std.testing.expectEqual(@as(usize, 3), expired);
    try std.testing.expectEqual(@as(usize, 0), system.getActiveCount());
}

test "SplatSystem: max splats limit" {
    var system = try SplatSystem.init(std.testing.allocator, 3);
    defer system.deinit();
    
    // Create 3 splats - should all succeed
    const s1 = try system.createSplat(0.1, 0.1, 0.0, 0.0, 0.015, [3]f32{ 1.0, 0.0, 0.0 });
    const s2 = try system.createSplat(0.2, 0.2, 0.0, 0.0, 0.015, [3]f32{ 0.0, 1.0, 0.0 });
    const s3 = try system.createSplat(0.3, 0.3, 0.0, 0.0, 0.015, [3]f32{ 0.0, 0.0, 1.0 });
    
    try std.testing.expect(s1 != null);
    try std.testing.expect(s2 != null);
    try std.testing.expect(s3 != null);
    try std.testing.expectEqual(@as(usize, 3), system.getActiveCount());
    
    // 4th splat should fail (limit reached)
    const s4 = try system.createSplat(0.4, 0.4, 0.0, 0.0, 0.015, [3]f32{ 1.0, 1.0, 0.0 });
    try std.testing.expect(s4 == null);
    try std.testing.expectEqual(@as(usize, 3), system.getActiveCount());
}

test "SplatSystem: statistics tracking" {
    var system = try SplatSystem.init(std.testing.allocator, 10);
    defer system.deinit();
    
    system.setDefaultLifetime(0.1);
    
    // Create 5 splats
    for (0..5) |i| {
        const x = @as(f32, @floatFromInt(i)) / 10.0;
        _ = try system.createSplat(x, 0.5, 0.0, 0.0, 0.015, [3]f32{ 1.0, 0.0, 0.0 });
    }
    
    const stats1 = system.getStats();
    try std.testing.expectEqual(@as(usize, 5), stats1.active_count);
    try std.testing.expectEqual(@as(u64, 5), stats1.total_created);
    try std.testing.expectEqual(@as(usize, 5), stats1.peak_active);
    
    // Expire 3, create 2 more
    _ = system.update(0.11); // Expire all 5
    _ = try system.createSplat(0.1, 0.1, 0.0, 0.0, 0.015, [3]f32{ 0.0, 1.0, 0.0 });
    _ = try system.createSplat(0.2, 0.2, 0.0, 0.0, 0.015, [3]f32{ 0.0, 0.0, 1.0 });
    
    const stats2 = system.getStats();
    try std.testing.expectEqual(@as(usize, 2), stats2.active_count);
    try std.testing.expectEqual(@as(u64, 7), stats2.total_created);
    try std.testing.expectEqual(@as(u64, 5), stats2.total_expired);
    try std.testing.expectEqual(@as(usize, 5), stats2.peak_active);
}
