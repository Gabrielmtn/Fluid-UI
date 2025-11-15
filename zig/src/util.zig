const std = @import("std");

pub const Vec2 = struct {
    x: f32,
    y: f32,
    pub inline fn add(a: Vec2, b: Vec2) Vec2 { return .{ .x = a.x + b.x, .y = a.y + b.y }; }
    pub inline fn sub(a: Vec2, b: Vec2) Vec2 { return .{ .x = a.x - b.x, .y = a.y - b.y }; }
    pub inline fn muls(a: Vec2, s: f32) Vec2 { return .{ .x = a.x * s, .y = a.y * s }; }
    pub inline fn len(a: Vec2) f32 { return @sqrt(a.x * a.x + a.y * a.y); }
};

pub const Vec4 = struct {
    r: f32,
    g: f32,
    b: f32,
    a: f32,
    pub inline fn add(a: Vec4, b: Vec4) Vec4 { return .{ .r = a.r + b.r, .g = a.g + b.g, .b = a.b + b.b, .a = a.a + b.a }; }
    pub inline fn muls(a: Vec4, s: f32) Vec4 { return .{ .r = a.r * s, .g = a.g * s, .b = a.b * s, .a = a.a * s }; }
};

pub inline fn clamp(x: f32, lo: f32, hi: f32) f32 {
    return if (x < lo) lo else if (x > hi) hi else x;
}

pub inline fn saturate(x: f32) f32 { return clamp(x, 0.0, 1.0); }

pub inline fn lerp(a: f32, b: f32, t: f32) f32 { return a + (b - a) * t; }

pub inline fn ilerp(a: f32, b: f32, v: f32) f32 { return (v - a) / (b - a); }

pub fn fnv1a64(bytes: []const u8) u64 {
    var hash: u64 = 1469598103934665603; // FNV offset basis
    const prime: u64 = 1099511628211;
    for (bytes) |c| {
        hash = hash ^ @as(u64, c);
        hash = hash * prime;
    }
    return hash;
}

pub fn hashF32Slice(slice: []const f32) u64 {
    var h: u64 = 1469598103934665603;
    const prime: u64 = 1099511628211;
    for (slice) |f| {
        const u: u32 = @bitCast(f);
        var i: u32 = 0;
        while (i < 4) : (i += 1) {
            const shift: u5 = @intCast(i * 8);
            const byte: u8 = @intCast((u >> shift) & 0xFF);
            h = (h ^ @as(u64, byte)) * prime;
        }
    }
    return h;
}
