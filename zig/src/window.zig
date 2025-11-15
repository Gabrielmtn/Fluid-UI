const std = @import("std");
const gpu = @import("gpu.zig");

// Window abstraction - stub for now
// TODO: Integrate GLFW or Win32 windowing
pub const Window = struct {
    width: u32,
    height: u32,
    title: []const u8,
    should_close_flag: bool,
    
    pub fn init(width: u32, height: u32, title: []const u8) !Window {
        std.log.info("✓ Window (stub): {d}x{d} '{s}'", .{width, height, title});
        return Window{
            .width = width,
            .height = height,
            .title = title,
            .should_close_flag = false,
        };
    }
    
    pub fn deinit(self: *Window) void {
        _ = self;
    }
    
    pub fn pollEvents(self: *Window) void {
        _ = self;
    }
    
    pub fn shouldClose(self: *Window) bool {
        return self.should_close_flag;
    }
};

// Input state
pub const MouseButton = enum {
    left,
    right,
    middle,
};

pub const InputState = struct {
    mouse_x: f32,
    mouse_y: f32,
    mouse_down: bool,
    mouse_button: MouseButton,
    
    pub fn init() InputState {
        return InputState{
            .mouse_x = 0,
            .mouse_y = 0,
            .mouse_down = false,
            .mouse_button = .left,
        };
    }
    
    pub fn update(self: *InputState, window: *Window) void {
        _ = self;
        _ = window;
        // TODO: Query GLFW for mouse state
    }
};
