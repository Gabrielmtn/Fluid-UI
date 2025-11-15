const std = @import("std");
const util = @import("util.zig");
const grid = @import("grid.zig");

pub const Vec2 = util.Vec2;
pub const Vec4 = util.Vec4;

inline fn clampi(v: isize, lo: isize, hi: isize) usize {
    var x = v;
    if (x < lo) {
        x = lo;
    } else if (x > hi) {
        x = hi;
    }
    return @intCast(x);
}

pub fn advectScalar(
    dst: []f32,
    src: []const f32,
    vel: []const Vec2,
    w: usize,
    h: usize,
    dt: f32,
    dissipation: f32,
    stillness_fade: f32,
) void {
    std.debug.assert(dst.len == src.len and src.len == w * h);
    std.debug.assert(vel.len == w * h);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const id = grid.idx(x, y, w);
            const v = vel[id];
            // backtrace
            const px = @as(f32, @floatFromInt(x)) - v.x * dt;
            const py = @as(f32, @floatFromInt(y)) - v.y * dt;
            const sx = util.clamp(px, 0.0, @as(f32, @floatFromInt(w - 1)));
            const sy = util.clamp(py, 0.0, @as(f32, @floatFromInt(h - 1)));

            // bilinear sample
            const x0: usize = @intFromFloat(std.math.floor(sx));
            const y0: usize = @intFromFloat(std.math.floor(sy));
            const x1 = if (x0 + 1 < w) x0 + 1 else x0;
            const y1 = if (y0 + 1 < h) y0 + 1 else y0;
            const tx = sx - @as(f32, @floatFromInt(x0));
            const ty = sy - @as(f32, @floatFromInt(y0));

            const a = src[grid.idx(x0, y0, w)];
            const b = src[grid.idx(x1, y0, w)];
            const c = src[grid.idx(x0, y1, w)];
            const d = src[grid.idx(x1, y1, w)];
            const ab = util.lerp(a, b, tx);
            const cd = util.lerp(c, d, tx);
            var sample = util.lerp(ab, cd, ty);

            // Dissipation and optional stillness fade
            const speed = @sqrt(v.x * v.x + v.y * v.y);
            const still = if (stillness_fade > 0.0) util.lerp(1.0, 0.0, util.saturate((stillness_fade - speed) / stillness_fade)) else 1.0;
            sample *= dissipation * still;

            dst[id] = sample;
        }
    }

}

pub fn advectVec2(
    dst: []Vec2,
    src: []const Vec2,
    vel: []const Vec2,
    w: usize,
    h: usize,
    dt: f32,
    dissipation: f32,
    stillness_fade: f32,
) void {
    std.debug.assert(dst.len == src.len and src.len == w * h);
    std.debug.assert(vel.len == w * h);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const id = grid.idx(x, y, w);
            const v = vel[id];
            const px = @as(f32, @floatFromInt(x)) - v.x * dt;
            const py = @as(f32, @floatFromInt(y)) - v.y * dt;
            const sx = util.clamp(px, 0.0, @as(f32, @floatFromInt(w - 1)));
            const sy = util.clamp(py, 0.0, @as(f32, @floatFromInt(h - 1)));
            const s = grid.sampleBilinearVec2(src, w, h, sx, sy);
            const speed = @sqrt(v.x * v.x + v.y * v.y);
            const still = if (stillness_fade > 0.0) util.lerp(1.0, 0.0, util.saturate((stillness_fade - speed) / stillness_fade)) else 1.0;
            dst[id] = s.muls(dissipation * still);
        }
    }
}

pub fn advectVec4(
    dst: []Vec4,
    src: []const Vec4,
    vel: []const Vec2,
    w: usize,
    h: usize,
    dt: f32,
    dissipation: f32,
    stillness_fade: f32,
) void {
    std.debug.assert(dst.len == src.len and src.len == w * h);
    std.debug.assert(vel.len == w * h);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const id = grid.idx(x, y, w);
            const v = vel[id];
            const px = @as(f32, @floatFromInt(x)) - v.x * dt;
            const py = @as(f32, @floatFromInt(y)) - v.y * dt;
            const sx = util.clamp(px, 0.0, @as(f32, @floatFromInt(w - 1)));
            const sy = util.clamp(py, 0.0, @as(f32, @floatFromInt(h - 1)));
            var sample = grid.sampleBilinearVec4(src, w, h, sx, sy);
            const speed = @sqrt(v.x * v.x + v.y * v.y);
            const still = if (stillness_fade > 0.0) util.lerp(1.0, 0.0, util.saturate((stillness_fade - speed) / stillness_fade)) else 1.0;
            sample = sample.muls(dissipation * still);
            dst[id] = sample;
        }
    }
}

pub fn divergence(dst: []f32, vel: []const Vec2, w: usize, h: usize) void {
    std.debug.assert(dst.len == w * h);
    std.debug.assert(vel.len == w * h);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const xm = clampi(@as(isize, @intCast(x)) - 1, 0, @as(isize, @intCast(w)) - 1);
            const xp = clampi(@as(isize, @intCast(x)) + 1, 0, @as(isize, @intCast(w)) - 1);
            const ym = clampi(@as(isize, @intCast(y)) - 1, 0, @as(isize, @intCast(h)) - 1);
            const yp = clampi(@as(isize, @intCast(y)) + 1, 0, @as(isize, @intCast(h)) - 1);
            const vL = vel[grid.idx(xm, y, w)];
            const vR = vel[grid.idx(xp, y, w)];
            const vB = vel[grid.idx(x, ym, w)];
            const vT = vel[grid.idx(x, yp, w)];
            const div = 0.5 * ((vR.x - vL.x) + (vT.y - vB.y));
            dst[grid.idx(x, y, w)] = div;
        }
    }
}

pub fn curl(dst: []f32, vel: []const Vec2, w: usize, h: usize) void {
    std.debug.assert(dst.len == w * h);
    std.debug.assert(vel.len == w * h);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const xm = clampi(@as(isize, @intCast(x)) - 1, 0, @as(isize, @intCast(w)) - 1);
            const xp = clampi(@as(isize, @intCast(x)) + 1, 0, @as(isize, @intCast(w)) - 1);
            const ym = clampi(@as(isize, @intCast(y)) - 1, 0, @as(isize, @intCast(h)) - 1);
            const yp = clampi(@as(isize, @intCast(y)) + 1, 0, @as(isize, @intCast(h)) - 1);
            const vL = vel[grid.idx(xm, y, w)];
            const vR = vel[grid.idx(xp, y, w)];
            const vB = vel[grid.idx(x, ym, w)];
            const vT = vel[grid.idx(x, yp, w)];
            // scalar vorticity (2D): dVy/dx - dVx/dy
            const dvydx = 0.5 * (vR.y - vL.y);
            const dvxdy = 0.5 * (vT.x - vB.x);
            dst[grid.idx(x, y, w)] = dvydx - dvxdy;
        }
    }
}

pub fn pressureJacobi(
    dst: []f32,
    prev_p: []const f32,
    div: []const f32,
    w: usize,
    h: usize,
    alpha: f32, // usually -dx^2
    inv_beta: f32, // usually 1/4
) void {
    std.debug.assert(dst.len == prev_p.len and dst.len == w * h);
    std.debug.assert(div.len == w * h);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const xm = clampi(@as(isize, @intCast(x)) - 1, 0, @as(isize, @intCast(w)) - 1);
            const xp = clampi(@as(isize, @intCast(x)) + 1, 0, @as(isize, @intCast(w)) - 1);
            const ym = clampi(@as(isize, @intCast(y)) - 1, 0, @as(isize, @intCast(h)) - 1);
            const yp = clampi(@as(isize, @intCast(y)) + 1, 0, @as(isize, @intCast(h)) - 1);

            const pL = prev_p[grid.idx(xm, y, w)];
            const pR = prev_p[grid.idx(xp, y, w)];
            const pB = prev_p[grid.idx(x, ym, w)];
            const pT = prev_p[grid.idx(x, yp, w)];
            const b = div[grid.idx(x, y, w)];
            const p = (pL + pR + pB + pT + alpha * b) * inv_beta;
            dst[grid.idx(x, y, w)] = p;
        }
    }

    // Boundary condition: zero pressure on borders
    if (h > 0) {
        var x2: usize = 0;
        while (x2 < w) : (x2 += 1) {
            dst[grid.idx(x2, 0, w)] = 0.0;
            dst[grid.idx(x2, h - 1, w)] = 0.0;
        }
    }
    if (w > 0) {
        var y2: usize = 0;
        while (y2 < h) : (y2 += 1) {
            dst[grid.idx(0, y2, w)] = 0.0;
            dst[grid.idx(w - 1, y2, w)] = 0.0;
        }
    }
}

// Apply vorticity confinement force
pub fn vorticityConfinement(vel_io: []Vec2, curl_field: []const f32, w: usize, h: usize, strength: f32, dt: f32) void {
    std.debug.assert(vel_io.len == w * h);
    std.debug.assert(curl_field.len == w * h);
    
    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const xm = clampi(@as(isize, @intCast(x)) - 1, 0, @as(isize, @intCast(w)) - 1);
            const xp = clampi(@as(isize, @intCast(x)) + 1, 0, @as(isize, @intCast(w)) - 1);
            const ym = clampi(@as(isize, @intCast(y)) - 1, 0, @as(isize, @intCast(h)) - 1);
            const yp = clampi(@as(isize, @intCast(y)) + 1, 0, @as(isize, @intCast(h)) - 1);
            
            const cL = @abs(curl_field[grid.idx(xm, y, w)]);
            const cR = @abs(curl_field[grid.idx(xp, y, w)]);
            const cB = @abs(curl_field[grid.idx(x, ym, w)]);
            const cT = @abs(curl_field[grid.idx(x, yp, w)]);
            
            const c = curl_field[grid.idx(x, y, w)];
            
            // Gradient of curl magnitude
            var dx = 0.5 * (cR - cL);
            var dy = 0.5 * (cT - cB);
            
            // Normalize
            const len = @sqrt(dx * dx + dy * dy);
            if (len > 0.00001) {
                dx /= len;
                dy /= len;
            }
            
            // Force = N × ω (perpendicular to gradient, scaled by curl)
            var v = vel_io[grid.idx(x, y, w)];
            v.x += dy * c * strength * dt;
            v.y += -dx * c * strength * dt;
            vel_io[grid.idx(x, y, w)] = v;
        }
    }
}

pub fn gradientSubtract(vel_io: []Vec2, p: []const f32, w: usize, h: usize, scale: f32) void {
    std.debug.assert(vel_io.len == w * h);
    std.debug.assert(p.len == w * h);

    var y: usize = 0;
    while (y < h) : (y += 1) {
        var x: usize = 0;
        while (x < w) : (x += 1) {
            const xm = clampi(@as(isize, @intCast(x)) - 1, 0, @as(isize, @intCast(w)) - 1);
            const xp = clampi(@as(isize, @intCast(x)) + 1, 0, @as(isize, @intCast(w)) - 1);
            const ym = clampi(@as(isize, @intCast(y)) - 1, 0, @as(isize, @intCast(h)) - 1);
            const yp = clampi(@as(isize, @intCast(y)) + 1, 0, @as(isize, @intCast(h)) - 1);

            const pL = p[grid.idx(xm, y, w)];
            const pR = p[grid.idx(xp, y, w)];
            const pB = p[grid.idx(x, ym, w)];
            const pT = p[grid.idx(x, yp, w)];

            var v = vel_io[grid.idx(x, y, w)];
            v.x -= 0.5 * (pR - pL) * scale;
            v.y -= 0.5 * (pT - pB) * scale;
            vel_io[grid.idx(x, y, w)] = v;
        }
    }

    // Enforce simple no-flux boundary conditions to stabilize projection
    if (h > 0) {
        var x2: usize = 0;
        while (x2 < w) : (x2 += 1) {
            var vt = vel_io[grid.idx(x2, 0, w)];
            vt.y = 0;
            vel_io[grid.idx(x2, 0, w)] = vt;
            var vb = vel_io[grid.idx(x2, h - 1, w)];
            vb.y = 0;
            vel_io[grid.idx(x2, h - 1, w)] = vb;
        }
    }
    if (w > 0) {
        var y2: usize = 0;
        while (y2 < h) : (y2 += 1) {
            var vl = vel_io[grid.idx(0, y2, w)];
            vl.x = 0;
            vel_io[grid.idx(0, y2, w)] = vl;
            var vr = vel_io[grid.idx(w - 1, y2, w)];
            vr.x = 0;
            vel_io[grid.idx(w - 1, y2, w)] = vr;
        }
    }
}
