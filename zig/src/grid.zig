const std = @import("std");
const util = @import("util.zig");

pub const Vec2 = util.Vec2;
pub const Vec4 = util.Vec4;

pub fn idx(x: usize, y: usize, w: usize) usize {
    return y * w + x;
}

pub fn sampleBilinearVec2(buf: []const Vec2, w: usize, h: usize, fx: f32, fy: f32) Vec2 {
    // fx, fy in pixel space [0, w) [0, h)
    const x0i: usize = @intFromFloat(std.math.floor(fx));
    const y0i: usize = @intFromFloat(std.math.floor(fy));
    const x1i = if (x0i + 1 < w) x0i + 1 else x0i;
    const y1i = if (y0i + 1 < h) y0i + 1 else y0i;
    const tx: f32 = fx - @as(f32, @floatFromInt(x0i));
    const ty: f32 = fy - @as(f32, @floatFromInt(y0i));

    const a = buf[idx(x0i, y0i, w)];
    const b = buf[idx(x1i, y0i, w)];
    const c = buf[idx(x0i, y1i, w)];
    const d = buf[idx(x1i, y1i, w)];

    const ab = Vec2{ .x = util.lerp(a.x, b.x, tx), .y = util.lerp(a.y, b.y, tx) };
    const cd = Vec2{ .x = util.lerp(c.x, d.x, tx), .y = util.lerp(c.y, d.y, tx) };
    return Vec2{ .x = util.lerp(ab.x, cd.x, ty), .y = util.lerp(ab.y, cd.y, ty) };
}

pub fn sampleBilinearVec4(buf: []const Vec4, w: usize, h: usize, fx: f32, fy: f32) Vec4 {
    const x0i: usize = @intFromFloat(std.math.floor(fx));
    const y0i: usize = @intFromFloat(std.math.floor(fy));
    const x1i = if (x0i + 1 < w) x0i + 1 else x0i;
    const y1i = if (y0i + 1 < h) y0i + 1 else y0i;
    const tx: f32 = fx - @as(f32, @floatFromInt(x0i));
    const ty: f32 = fy - @as(f32, @floatFromInt(y0i));

    const a = buf[idx(x0i, y0i, w)];
    const b = buf[idx(x1i, y0i, w)];
    const c = buf[idx(x0i, y1i, w)];
    const d = buf[idx(x1i, y1i, w)];

    const ab = Vec4{ .r = util.lerp(a.r, b.r, tx), .g = util.lerp(a.g, b.g, tx), .b = util.lerp(a.b, b.b, tx), .a = util.lerp(a.a, b.a, tx) };
    const cd = Vec4{ .r = util.lerp(c.r, d.r, tx), .g = util.lerp(c.g, d.g, tx), .b = util.lerp(c.b, d.b, tx), .a = util.lerp(c.a, d.a, tx) };
    return Vec4{ .r = util.lerp(ab.r, cd.r, ty), .g = util.lerp(ab.g, cd.g, ty), .b = util.lerp(ab.b, cd.b, ty), .a = util.lerp(ab.a, cd.a, ty) };
}
