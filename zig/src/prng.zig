const std = @import("std");

// PCG32 PRNG - deterministic across platforms
pub const PCG32 = struct {
    state: u64,
    inc: u64,

    pub fn init(seed: u64, seq: u64) PCG32 {
        var s = PCG32{ .state = 0, .inc = (seq << 1) | 1 }; // inc must be odd
        _ = s.nextU32(); // advance once with zero state
        s.state +%= seed;
        _ = s.nextU32();
        return s;
    }

    pub fn nextU32(self: *PCG32) u32 {
        const oldstate = self.state;
        self.state = oldstate *% 6364136223846793005 +% self.inc;
        const xorshifted: u32 = @intCast(((((oldstate >> 18) ^ oldstate) >> 27) & 0xFFFF_FFFF));
        const rot: u32 = @intCast(oldstate >> 59);
        const shift_r: u5 = @intCast(rot);
        const shift_l: u5 = @intCast((0 -% rot) & 31);
        return (xorshifted >> shift_r) | (xorshifted << shift_l);
    }

    pub fn nextF32(self: *PCG32) f32 {
        const v = self.nextU32();
        // Scale to [0,1)
        return @as(f32, @floatFromInt(v)) / 4294967296.0;
    }
};
