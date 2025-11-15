const std = @import("std");
const util = @import("util.zig");
const grid = @import("grid.zig");
const kaleido = @import("kaleido.zig");

pub const Vec4 = util.Vec4;

pub const Framebuffer = struct {
    w: usize,
    h: usize,
    pixels: []Vec4,
};

pub const Renderer = struct {
    pub fn applyKaleido(dst: Framebuffer, src: Framebuffer, uni: kaleido.Uniforms) void {
        std.debug.assert(dst.w == src.w and dst.h == src.h);
        std.debug.assert(dst.pixels.len == src.pixels.len);
        kaleido.apply(dst.pixels, src.pixels, dst.w, dst.h, uni);
    }
};
