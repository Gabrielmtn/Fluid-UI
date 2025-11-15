const std = @import("std");
const windows = std.os.windows;

// Define missing Windows structures for Zig 0.15
const MSG = extern struct {
    hWnd: ?windows.HWND,
    message: windows.UINT,
    wParam: windows.WPARAM,
    lParam: windows.LPARAM,
    time: windows.DWORD,
    pt: windows.POINT,
    lPrivate: windows.DWORD,
};

const BITMAPINFOHEADER = extern struct {
    biSize: windows.DWORD,
    biWidth: windows.LONG,
    biHeight: windows.LONG,
    biPlanes: windows.WORD,
    biBitCount: windows.WORD,
    biCompression: windows.DWORD,
    biSizeImage: windows.DWORD,
    biXPelsPerMeter: windows.LONG,
    biYPelsPerMeter: windows.LONG,
    biClrUsed: windows.DWORD,
    biClrImportant: windows.DWORD,
};

const RGBQUAD = extern struct {
    rgbBlue: windows.BYTE,
    rgbGreen: windows.BYTE,
    rgbRed: windows.BYTE,
    rgbReserved: windows.BYTE,
};

const BITMAPINFO = extern struct {
    bmiHeader: BITMAPINFOHEADER,
    bmiColors: [1]RGBQUAD,
};

// Win32 window for real-time rendering - no external dependencies
pub const Window = struct {
    hwnd: windows.HWND,
    hdc: windows.HDC,
    width: u32,
    height: u32,
    pixels: []u8,
    allocator: std.mem.Allocator,
    should_close: bool,
    mouse_x: i32,
    mouse_y: i32,
    mouse_pressed: bool,
    
    const user32 = struct {
        extern "user32" fn CreateWindowExA(
            dwExStyle: windows.DWORD,
            lpClassName: [*:0]const u8,
            lpWindowName: [*:0]const u8,
            dwStyle: windows.DWORD,
            X: c_int,
            Y: c_int,
            nWidth: c_int,
            nHeight: c_int,
            hWndParent: ?windows.HWND,
            hMenu: ?windows.HMENU,
            hInstance: windows.HINSTANCE,
            lpParam: ?windows.LPVOID,
        ) callconv(.winapi) ?windows.HWND;
        
        extern "user32" fn RegisterClassA(lpWndClass: *const WNDCLASSA) callconv(.winapi) windows.ATOM;
        extern "user32" fn DefWindowProcA(hWnd: windows.HWND, Msg: windows.UINT, wParam: windows.WPARAM, lParam: windows.LPARAM) callconv(.winapi) windows.LRESULT;
        extern "user32" fn PeekMessageA(lpMsg: *MSG, hWnd: ?windows.HWND, wMsgFilterMin: windows.UINT, wMsgFilterMax: windows.UINT, wRemoveMsg: windows.UINT) callconv(.winapi) windows.BOOL;
        extern "user32" fn TranslateMessage(lpMsg: *const MSG) callconv(.winapi) windows.BOOL;
        extern "user32" fn DispatchMessageA(lpMsg: *const MSG) callconv(.winapi) windows.LRESULT;
        extern "user32" fn GetDC(hWnd: ?windows.HWND) callconv(.winapi) ?windows.HDC;
        extern "user32" fn ReleaseDC(hWnd: ?windows.HWND, hDC: windows.HDC) callconv(.winapi) c_int;
        extern "user32" fn GetCursorPos(lpPoint: *windows.POINT) callconv(.winapi) windows.BOOL;
        extern "user32" fn ScreenToClient(hWnd: windows.HWND, lpPoint: *windows.POINT) callconv(.winapi) windows.BOOL;
        extern "user32" fn GetAsyncKeyState(vKey: c_int) callconv(.winapi) windows.SHORT;
        extern "user32" fn ShowWindow(hWnd: windows.HWND, nCmdShow: c_int) callconv(.winapi) windows.BOOL;
        extern "user32" fn UpdateWindow(hWnd: windows.HWND) callconv(.winapi) windows.BOOL;
    };
    
    const gdi32 = struct {
        extern "gdi32" fn StretchDIBits(
            hdc: windows.HDC,
            xDest: c_int,
            yDest: c_int,
            DestWidth: c_int,
            DestHeight: c_int,
            xSrc: c_int,
            ySrc: c_int,
            SrcWidth: c_int,
            SrcHeight: c_int,
            lpBits: *const anyopaque,
            lpbmi: *const BITMAPINFO,
            iUsage: windows.UINT,
            rop: windows.DWORD,
        ) callconv(.winapi) c_int;
    };
    
    const WM_DESTROY = 0x0002;
    const WM_CLOSE = 0x0010;
    const WS_OVERLAPPEDWINDOW = 0x00CF0000;
    const CW_USEDEFAULT = @as(c_int, @bitCast(@as(u32, 0x80000000)));
    const PM_REMOVE = 0x0001;
    const SW_SHOW = 5;
    const VK_LBUTTON = 0x01;
    const DIB_RGB_COLORS = 0;
    const SRCCOPY = 0x00CC0020;
    
    var g_should_close: bool = false;
    
    fn windowProc(hwnd: windows.HWND, msg: windows.UINT, wparam: windows.WPARAM, lparam: windows.LPARAM) callconv(.winapi) windows.LRESULT {
        switch (msg) {
            WM_DESTROY, WM_CLOSE => {
                g_should_close = true;
                return 0;
            },
            else => return user32.DefWindowProcA(hwnd, msg, wparam, lparam),
        }
    }
    
    const WNDCLASSA = extern struct {
        style: windows.UINT = 0,
        lpfnWndProc: *const fn(windows.HWND, windows.UINT, windows.WPARAM, windows.LPARAM) callconv(.winapi) windows.LRESULT,
        cbClsExtra: c_int = 0,
        cbWndExtra: c_int = 0,
        hInstance: windows.HINSTANCE,
        hIcon: ?windows.HICON = null,
        hCursor: ?windows.HCURSOR = null,
        hbrBackground: ?windows.HBRUSH = null,
        lpszMenuName: ?[*:0]const u8 = null,
        lpszClassName: [*:0]const u8,
    };
    
    pub fn init(allocator: std.mem.Allocator, width: u32, height: u32, title: []const u8) !Window {
        const hInstance = @as(windows.HINSTANCE, @ptrFromInt(@intFromPtr(windows.kernel32.GetModuleHandleW(null))));
        
        // Register window class
        const class_name = "FluidSimWindow";
        const wc = WNDCLASSA{
            .lpfnWndProc = windowProc,
            .hInstance = hInstance,
            .lpszClassName = class_name,
        };
        _ = user32.RegisterClassA(&wc);
        
        // Create window
        const title_z = try allocator.dupeZ(u8, title);
        defer allocator.free(title_z);
        
        const hwnd = user32.CreateWindowExA(
            0,
            class_name,
            title_z.ptr,
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            @intCast(width),
            @intCast(height),
            null,
            null,
            hInstance,
            null,
        ) orelse return error.WindowCreationFailed;
        
        _ = user32.ShowWindow(hwnd, SW_SHOW);
        _ = user32.UpdateWindow(hwnd);
        
        const hdc = user32.GetDC(hwnd) orelse return error.GetDCFailed;
        
        // Allocate pixel buffer (BGRA format)
        const pixel_count = width * height * 4;
        const pixels = try allocator.alloc(u8, pixel_count);
        @memset(pixels, 0);
        
        std.log.info("✓ Win32 window created: {d}x{d}", .{width, height});
        
        g_should_close = false;
        
        return Window{
            .hwnd = hwnd,
            .hdc = hdc,
            .width = width,
            .height = height,
            .pixels = pixels,
            .allocator = allocator,
            .should_close = false,
            .mouse_x = 0,
            .mouse_y = 0,
            .mouse_pressed = false,
        };
    }
    
    pub fn deinit(self: *Window) void {
        _ = user32.ReleaseDC(self.hwnd, self.hdc);
        self.allocator.free(self.pixels);
    }
    
    pub fn pollEvents(self: *Window) void {
        var msg: MSG = undefined;
        while (user32.PeekMessageA(&msg, null, 0, 0, PM_REMOVE) != 0) {
            _ = user32.TranslateMessage(&msg);
            _ = user32.DispatchMessageA(&msg);
        }
        
        self.should_close = g_should_close;
        
        // Update mouse state
        var point: windows.POINT = undefined;
        _ = user32.GetCursorPos(&point);
        _ = user32.ScreenToClient(self.hwnd, &point);
        
        self.mouse_x = point.x;
        self.mouse_y = point.y;
        self.mouse_pressed = (user32.GetAsyncKeyState(VK_LBUTTON) & @as(c_int, 0x8000)) != 0;
    }
    
    pub fn shouldClose(self: *Window) bool {
        return self.should_close;
    }
    
    pub fn present(self: *Window) void {
        // Set up bitmap info
        var bmi = std.mem.zeroes(BITMAPINFO);
        bmi.bmiHeader.biSize = @sizeOf(BITMAPINFOHEADER);
        bmi.bmiHeader.biWidth = @intCast(self.width);
        bmi.bmiHeader.biHeight = -@as(i32, @intCast(self.height)); // Negative for top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = 0; // BI_RGB
        
        // Draw pixels to window
        _ = gdi32.StretchDIBits(
            self.hdc,
            0, 0,
            @intCast(self.width),
            @intCast(self.height),
            0, 0,
            @intCast(self.width),
            @intCast(self.height),
            self.pixels.ptr,
            &bmi,
            DIB_RGB_COLORS,
            SRCCOPY,
        );
    }
    
    pub fn getMouseState(self: *Window) struct { x: i32, y: i32, pressed: bool } {
        return .{
            .x = self.mouse_x,
            .y = self.mouse_y,
            .pressed = self.mouse_pressed,
        };
    }
};
