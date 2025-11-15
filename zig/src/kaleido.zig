const std = @import("std");
const util = @import("util.zig");
const grid = @import("grid.zig");

pub const Vec4 = util.Vec4;

pub const Mode = enum(u32) {
    Off = 0,
    Wedge = 1,
    MirrorH = 2,
    MirrorV = 3,
    MirrorQuad = 4,
    Spiral = 5,
};

pub const Uniforms = struct {
    enabled: bool = false,
    segments: u32 = 1,
    mode: Mode = .Off,
    angle_deg: f32 = 0.0,
    twist: f32 = 0.0,
    zoom: f32 = 1.0,
    blend: f32 = 1.0,
};

fn foldMirror(y: f32, period: f32) f32 {
    if (period <= 0.000001) return y;
    const kf = std.math.floor(y / period);
    const n: i64 = @intFromFloat(kf);
    const frac = y - kf * period; // [0, period)
    return if ((n & 1) == 0) frac else (period - frac);
}

inline fn posmod(x: f32, m: f32) f32 {
    if (m == 0) return x;
    const k = std.math.floor(x / m);
    return x - k * m;
}

pub fn apply(
    out: []Vec4,
    src: []const Vec4,
    w: usize,
    h: usize,
    uni: Uniforms,
) void {
    std.debug.assert(out.len == src.len and out.len == w * h);

    if (!uni.enabled or uni.mode == .Off or uni.segments == 0) {
        // Identity / passthrough (with optional blend)
        if (uni.blend >= 0.999) {
            var i: usize = 0;
            while (i < out.len) : (i += 1) out[i] = src[i];
            return;
        }
        var i: usize = 0;
        while (i < out.len) : (i += 1) {
            const s = src[i];
            out[i] = Vec4{
                .r = util.lerp(s.r, s.r, uni.blend),
                .g = util.lerp(s.g, s.g, uni.blend),
                .b = util.lerp(s.b, s.b, uni.blend),
                .a = s.a,
            };
        }
        return;
    }

    const angle = uni.angle_deg * std.math.pi / 180.0;
    const cos_a = @cos(angle);
    const sin_a = @sin(angle);

    const cx = (@as(f32, @floatFromInt(w)) - 1.0) * 0.5;
    const cy = (@as(f32, @floatFromInt(h)) - 1.0) * 0.5;
    const max_r = @sqrt(cx * cx + cy * cy);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            // Original coordinate
            const fx = @as(f32, @floatFromInt(x));
            const fy = @as(f32, @floatFromInt(y));

            // Normalized center
            const u = (fx - cx) / uni.zoom;
            const v = (fy - cy) / uni.zoom;

            // Rotate by angle
            const rx = u * cos_a - v * sin_a;
            const ry = u * sin_a + v * cos_a;

            var sx: f32 = rx + cx;
            var sy: f32 = ry + cy;

            switch (uni.mode) {
                .MirrorH => {
                    // Vertical symmetry around horizontal center line
                    const dy = @abs(ry);
                    sy = cy + dy;
                },
                .MirrorV => {
                    // Horizontal symmetry around vertical center line
                    const dx = @abs(rx);
                    sx = cx + dx;
                },
                .Wedge => {
                    // Facets: fold angle into wedge sector and mirror to center
                    const r = @sqrt(rx * rx + ry * ry);
                    const theta = std.math.atan2(ry, rx);
                    const seg = if (uni.segments == 0) 1 else uni.segments;
                    const phi = 2.0 * std.math.pi / @as(f32, @floatFromInt(seg));
                    var t = posmod(theta, phi); // [0, phi)
                    if (t > 0.5 * phi) t = phi - t; // mirror to [0, phi/2]
                    // Reconstruct
                    const cx2 = @cos(t);
                    const sy2 = @sin(t);
                    sx = cx + r * cx2;
                    sy = cy + r * sy2;
                },
                .MirrorQuad => {
                    // Quadrant symmetry: reflect both axes about center
                    const dx = @abs(rx);
                    const dy = @abs(ry);
                    sx = cx + dx;
                    sy = cy + dy;
                },
                .Spiral => {
                    // Rings create angular advance proportional to radius; twist adds extra
                    const r = @sqrt(rx * rx + ry * ry);
                    var theta = std.math.atan2(ry, rx);
                    const rings = @as(f32, @floatFromInt(if (uni.segments == 0) 1 else uni.segments));
                    const rnorm = if (max_r > 0) r / max_r else 0.0;
                    theta += rings * 2.0 * std.math.pi * rnorm + uni.twist * r;
                    const cx2 = @cos(theta);
                    const sy2 = @sin(theta);
                    sx = cx + r * cx2;
                    sy = cy + r * sy2;
                },
                .Off => {},
            }

            // Clamp sample space
            sx = util.clamp(sx, 0.0, @as(f32, @floatFromInt(w - 1)));
            sy = util.clamp(sy, 0.0, @as(f32, @floatFromInt(h - 1)));

            const src_col = grid.sampleBilinearVec4(src, w, h, sx, sy);
            const orig = src[grid.idx(x, y, w)];
            const b = util.saturate(uni.blend);
            out[grid.idx(x, y, w)] = Vec4{
                .r = util.lerp(orig.r, src_col.r, b),
                .g = util.lerp(orig.g, src_col.g, b),
                .b = util.lerp(orig.b, src_col.b, b),
                .a = orig.a,
            };
        }
    }
}
