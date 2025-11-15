const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const enable_coverage = b.option(bool, "coverage", "Enable llvm coverage (if llvm-profdata/llvm-cov available)") orelse false;
    _ = enable_coverage; // currently informational; set LLVM_PROFILE_FILE in shell if desired

    // Root unit tests aggregating all submodules (Zig 0.15 API)
    const root_mod = b.createModule(.{
        .root_source_file = b.path("src/root_tests.zig"),
        .target = target,
        .optimize = optimize,
    });
    const unit_tests = b.addTest(.{ .root_module = root_mod });

    // When coverage requested, allow profile dumps via LLVM_PROFILE_FILE.

    const run_tests = b.addRunArtifact(unit_tests);

    // Note: Zig 0.15 Build API lacks addEnvPair; for coverage, set LLVM_PROFILE_FILE in the shell when invoking tests.

    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_tests.step);

    // Main executable
    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    const exe = b.addExecutable(.{
        .name = "fluid-sim",
        .root_module = exe_mod,
    });
    
    // Link wgpu-native library
    exe.addLibraryPath(b.path("lib/wgpu"));
    exe.linkSystemLibrary("wgpu_native");
    
    // Copy DLL to output directory
    const install_dll = b.addInstallFile(
        b.path("lib/wgpu/wgpu_native.dll"),
        "bin/wgpu_native.dll"
    );
    b.getInstallStep().dependOn(&install_dll.step);
    
    b.installArtifact(exe);
    
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }
    
    const run_step = b.step("run", "Run the fluid simulation");
    run_step.dependOn(&run_cmd.step);
    
    // GPU test executable
    const test_gpu_mod = b.createModule(.{
        .root_source_file = b.path("test_gpu.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    const test_gpu_exe = b.addExecutable(.{
        .name = "test-gpu",
        .root_module = test_gpu_mod,
    });
    
    test_gpu_exe.addLibraryPath(b.path("lib/wgpu"));
    test_gpu_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_gpu_exe);
    
    const run_test_gpu = b.addRunArtifact(test_gpu_exe);
    run_test_gpu.step.dependOn(b.getInstallStep());
    
    const test_gpu_step = b.step("test-gpu", "Test GPU initialization");
    test_gpu_step.dependOn(&run_test_gpu.step);
    
    // Texture test executable
    const test_textures_mod = b.createModule(.{
        .root_source_file = b.path("test_textures.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    const test_textures_exe = b.addExecutable(.{
        .name = "test-textures",
        .root_module = test_textures_mod,
    });
    
    test_textures_exe.addLibraryPath(b.path("lib/wgpu"));
    test_textures_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_textures_exe);
    
    const run_test_textures = b.addRunArtifact(test_textures_exe);
    run_test_textures.step.dependOn(b.getInstallStep());
    
    const test_textures_step = b.step("test-textures", "Test GPU texture creation");
    test_textures_step.dependOn(&run_test_textures.step);
    
    // Format test executable
    const test_formats_mod = b.createModule(.{
        .root_source_file = b.path("test_formats.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    const test_formats_exe = b.addExecutable(.{
        .name = "test-formats",
        .root_module = test_formats_mod,
    });
    
    test_formats_exe.addLibraryPath(b.path("lib/wgpu"));
    test_formats_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_formats_exe);
    
    const run_test_formats = b.addRunArtifact(test_formats_exe);
    run_test_formats.step.dependOn(b.getInstallStep());
    
    const test_formats_step = b.step("test-formats", "Test GPU texture formats");
    test_formats_step.dependOn(&run_test_formats.step);
    
    // Texture manager test
    const test_texture_manager_mod = b.createModule(.{
        .root_source_file = b.path("test_texture_manager.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    const test_texture_manager_exe = b.addExecutable(.{
        .name = "test-texture-manager",
        .root_module = test_texture_manager_mod,
    });
    
    test_texture_manager_exe.addLibraryPath(b.path("lib/wgpu"));
    test_texture_manager_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_texture_manager_exe);
    
    const run_test_texture_manager = b.addRunArtifact(test_texture_manager_exe);
    run_test_texture_manager.step.dependOn(b.getInstallStep());
    
    const test_texture_manager_step = b.step("test-texture-manager", "Test GPU texture manager");
    test_texture_manager_step.dependOn(&run_test_texture_manager.step);
    
    // Pipeline test executable
    const test_pipelines_mod = b.createModule(.{
        .root_source_file = b.path("test_pipelines.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    const test_pipelines_exe = b.addExecutable(.{
        .name = "test-pipelines",
        .root_module = test_pipelines_mod,
    });
    
    test_pipelines_exe.addLibraryPath(b.path("lib/wgpu"));
    test_pipelines_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_pipelines_exe);
    
    const run_test_pipelines = b.addRunArtifact(test_pipelines_exe);
    run_test_pipelines.step.dependOn(b.getInstallStep());
    
    const test_pipelines_step = b.step("test-pipelines", "Test GPU compute pipelines");
    test_pipelines_step.dependOn(&run_test_pipelines.step);

    // Command encoding smoke test (Phase 4)
    const test_encode_mod = b.createModule(.{
        .root_source_file = b.path("test_encode.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_encode_exe = b.addExecutable(.{
        .name = "test-encode",
        .root_module = test_encode_mod,
    });
    test_encode_exe.addLibraryPath(b.path("lib/wgpu"));
    test_encode_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_encode_exe);
    const run_test_encode = b.addRunArtifact(test_encode_exe);
    run_test_encode.step.dependOn(b.getInstallStep());
    const test_encode_step = b.step("test-encode", "Phase 4: Command encoding smoke test");
    test_encode_step.dependOn(&run_test_encode.step);

    // Sampler API test
    const test_sampler_mod = b.createModule(.{
        .root_source_file = b.path("test_sampler.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_sampler_exe = b.addExecutable(.{
        .name = "test-sampler",
        .root_module = test_sampler_mod,
    });
    test_sampler_exe.addLibraryPath(b.path("lib/wgpu"));
    test_sampler_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_sampler_exe);
    const run_test_sampler = b.addRunArtifact(test_sampler_exe);
    run_test_sampler.step.dependOn(b.getInstallStep());
    const test_sampler_step = b.step("test-sampler", "Phase 4: Sampler API test");
    test_sampler_step.dependOn(&run_test_sampler.step);

    // Advection dispatch test
    const test_advection_mod = b.createModule(.{
        .root_source_file = b.path("test_advection_dispatch.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_advection_exe = b.addExecutable(.{
        .name = "test-advection",
        .root_module = test_advection_mod,
    });
    test_advection_exe.addLibraryPath(b.path("lib/wgpu"));
    test_advection_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_advection_exe);
    const run_test_advection = b.addRunArtifact(test_advection_exe);
    run_test_advection.step.dependOn(b.getInstallStep());
    const test_advection_step = b.step("test-advection", "Phase 4: Advection dispatch test");
    test_advection_step.dependOn(&run_test_advection.step);

    // Advection render pass test
    const test_advection_render_mod = b.createModule(.{
        .root_source_file = b.path("test_advection_render.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_advection_render_exe = b.addExecutable(.{
        .name = "test-advection-render",
        .root_module = test_advection_render_mod,
    });
    test_advection_render_exe.addLibraryPath(b.path("lib/wgpu"));
    test_advection_render_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_advection_render_exe);
    const run_test_advection_render = b.addRunArtifact(test_advection_render_exe);
    run_test_advection_render.step.dependOn(b.getInstallStep());
    const test_advection_render_step = b.step("test-advection-render", "Phase 4: Advection render pass test");
    test_advection_render_step.dependOn(&run_test_advection_render.step);

    // Minimal render pass test (no buffers, no bind groups)
    const test_render_minimal_mod = b.createModule(.{
        .root_source_file = b.path("test_render_minimal.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_render_minimal_exe = b.addExecutable(.{
        .name = "test-render-minimal",
        .root_module = test_render_minimal_mod,
    });
    test_render_minimal_exe.addLibraryPath(b.path("lib/wgpu"));
    test_render_minimal_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_render_minimal_exe);
    const run_test_render_minimal = b.addRunArtifact(test_render_minimal_exe);
    run_test_render_minimal.step.dependOn(b.getInstallStep());
    const test_render_minimal_step = b.step("test-render-minimal", "Phase 4: Minimal render pass test");
    test_render_minimal_step.dependOn(&run_test_render_minimal.step);

    // Bind group debug test
    const test_bindgroup_debug_mod = b.createModule(.{
        .root_source_file = b.path("test_bindgroup_debug.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_bindgroup_debug_exe = b.addExecutable(.{
        .name = "test-bindgroup-debug",
        .root_module = test_bindgroup_debug_mod,
    });
    test_bindgroup_debug_exe.addLibraryPath(b.path("lib/wgpu"));
    test_bindgroup_debug_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_bindgroup_debug_exe);
    const run_test_bindgroup_debug = b.addRunArtifact(test_bindgroup_debug_exe);
    run_test_bindgroup_debug.step.dependOn(b.getInstallStep());
    const test_bindgroup_debug_step = b.step("test-bindgroup-debug", "Debug: Isolate bind group buffer mapping issue");
    test_bindgroup_debug_step.dependOn(&run_test_bindgroup_debug.step);

    // Render pass with uniform buffer test
    const test_render_with_buffer_mod = b.createModule(.{
        .root_source_file = b.path("test_render_with_buffer.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_render_with_buffer_exe = b.addExecutable(.{
        .name = "test-render-with-buffer",
        .root_module = test_render_with_buffer_mod,
    });
    test_render_with_buffer_exe.addLibraryPath(b.path("lib/wgpu"));
    test_render_with_buffer_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_render_with_buffer_exe);
    const run_test_render_with_buffer = b.addRunArtifact(test_render_with_buffer_exe);
    run_test_render_with_buffer.step.dependOn(b.getInstallStep());
    const test_render_with_buffer_step = b.step("test-render-with-buffer", "Debug: Render pass with uniform buffer");
    test_render_with_buffer_step.dependOn(&run_test_render_with_buffer.step);

    // Phase 5: Compute dispatch with bind groups
    const test_compute_dispatch_mod = b.createModule(.{
        .root_source_file = b.path("test_compute_dispatch.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_compute_dispatch_exe = b.addExecutable(.{
        .name = "test-compute-dispatch",
        .root_module = test_compute_dispatch_mod,
    });
    test_compute_dispatch_exe.addLibraryPath(b.path("lib/wgpu"));
    test_compute_dispatch_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_compute_dispatch_exe);
    const run_test_compute_dispatch = b.addRunArtifact(test_compute_dispatch_exe);
    run_test_compute_dispatch.step.dependOn(b.getInstallStep());
    const test_compute_dispatch_step = b.step("test-compute-dispatch", "Phase 5: Compute dispatch with bind groups");
    test_compute_dispatch_step.dependOn(&run_test_compute_dispatch.step);

    // Phase 6: Advection kernel test
    const test_advection_kernel_mod = b.createModule(.{
        .root_source_file = b.path("test_advection_kernel.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_advection_kernel_exe = b.addExecutable(.{
        .name = "test-advection-kernel",
        .root_module = test_advection_kernel_mod,
    });
    test_advection_kernel_exe.addLibraryPath(b.path("lib/wgpu"));
    test_advection_kernel_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_advection_kernel_exe);
    const run_test_advection_kernel = b.addRunArtifact(test_advection_kernel_exe);
    run_test_advection_kernel.step.dependOn(b.getInstallStep());
    const test_advection_kernel_step = b.step("test-advection-kernel", "Phase 6: Advection kernel with bind groups");
    test_advection_kernel_step.dependOn(&run_test_advection_kernel.step);

    // Phase 6: rg32float storage test
    const test_rg32float_storage_mod = b.createModule(.{
        .root_source_file = b.path("test_rg32float_storage.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_rg32float_storage_exe = b.addExecutable(.{
        .name = "test-rg32float-storage",
        .root_module = test_rg32float_storage_mod,
    });
    test_rg32float_storage_exe.addLibraryPath(b.path("lib/wgpu"));
    test_rg32float_storage_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_rg32float_storage_exe);
    const run_test_rg32float_storage = b.addRunArtifact(test_rg32float_storage_exe);
    run_test_rg32float_storage.step.dependOn(b.getInstallStep());
    const test_rg32float_storage_step = b.step("test-rg32float-storage", "Phase 6: Test rg32float storage support");
    test_rg32float_storage_step.dependOn(&run_test_rg32float_storage.step);

    // Phase 6: Advection with split velocity (production test)
    const test_advection_split_mod = b.createModule(.{
        .root_source_file = b.path("test_advection_split.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_advection_split_exe = b.addExecutable(.{
        .name = "test-advection-split",
        .root_module = test_advection_split_mod,
    });
    test_advection_split_exe.addLibraryPath(b.path("lib/wgpu"));
    test_advection_split_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_advection_split_exe);
    const run_test_advection_split = b.addRunArtifact(test_advection_split_exe);
    run_test_advection_split.step.dependOn(b.getInstallStep());
    const test_advection_split_step = b.step("test-advection-split", "Phase 6: Advection with split velocity (FluidTextures integration)");
    test_advection_split_step.dependOn(&run_test_advection_split.step);

    // Phase 6: Velocity swap test (ping-pong buffering)
    const test_velocity_swap_mod = b.createModule(.{
        .root_source_file = b.path("test_velocity_swap.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_velocity_swap_exe = b.addExecutable(.{
        .name = "test-velocity-swap",
        .root_module = test_velocity_swap_mod,
    });
    test_velocity_swap_exe.addLibraryPath(b.path("lib/wgpu"));
    test_velocity_swap_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_velocity_swap_exe);
    const run_test_velocity_swap = b.addRunArtifact(test_velocity_swap_exe);
    run_test_velocity_swap.step.dependOn(b.getInstallStep());
    const test_velocity_swap_step = b.step("test-velocity-swap", "Phase 6: Test velocity swap (ping-pong pattern)");
    test_velocity_swap_step.dependOn(&run_test_velocity_swap.step);

    // Phase 6: Complete simulation step test
    const test_simulation_step_mod = b.createModule(.{
        .root_source_file = b.path("test_simulation_step.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_simulation_step_exe = b.addExecutable(.{
        .name = "test-simulation-step",
        .root_module = test_simulation_step_mod,
    });
    test_simulation_step_exe.addLibraryPath(b.path("lib/wgpu"));
    test_simulation_step_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(test_simulation_step_exe);
    const run_test_simulation_step = b.addRunArtifact(test_simulation_step_exe);
    run_test_simulation_step.step.dependOn(b.getInstallStep());
    const test_simulation_step_step = b.step("test-simulation-step", "Phase 6: Complete simulation step (all kernels)");
    test_simulation_step_step.dependOn(&run_test_simulation_step.step);

    // Phase 8: App structure test
    const test_app_mod = b.createModule(.{
        .root_source_file = b.path("src/app.zig"),
        .target = target,
        .optimize = optimize,
    });
    const test_app_exe = b.addTest(.{
        .root_module = test_app_mod,
    });
    test_app_exe.addLibraryPath(b.path("lib/wgpu"));
    test_app_exe.linkSystemLibrary("wgpu_native");
    const run_test_app = b.addRunArtifact(test_app_exe);
    const test_app_step = b.step("test-app", "Phase 8: Test App structure with allocator hierarchy");
    test_app_step.dependOn(&run_test_app.step);

    // Phase 8: FluidSimulation module test
    // For now, keep it simple - just test directly without complex module setup
    // The FluidSimulation module will be properly integrated in the main app
    const test_fluid_sim_step = b.step("test-fluid-sim", "Phase 8: FluidSimulation tests (see main app integration)");
    test_fluid_sim_step.dependOn(&run_tests.step); // For now, use main test suite

    // Phase 7: Complete GPU Fluid Simulation Application
    const fluid_sim_app_mod = b.createModule(.{
        .root_source_file = b.path("fluid_sim_app.zig"),
        .target = target,
        .optimize = optimize,
    });
    const fluid_sim_app_exe = b.addExecutable(.{
        .name = "fluid-sim",
        .root_module = fluid_sim_app_mod,
    });
    fluid_sim_app_exe.addLibraryPath(b.path("lib/wgpu"));
    fluid_sim_app_exe.linkSystemLibrary("wgpu_native");
    b.installArtifact(fluid_sim_app_exe);
    const run_fluid_sim_app = b.addRunArtifact(fluid_sim_app_exe);
    run_fluid_sim_app.step.dependOn(b.getInstallStep());
    const fluid_sim_app_step = b.step("sim", "Phase 7: Run complete GPU fluid simulation application");
    fluid_sim_app_step.dependOn(&run_fluid_sim_app.step);

    // Optional: coverage HTML report if llvm tools are present
    const coverage_step = b.step("coverage", "Generate coverage report (requires llvm-profdata/llvm-cov)");

    // Try to locate llvm-profdata and llvm-cov
    const profdata_tool: ?[]const u8 = b.findProgram(&[_][]const u8{"llvm-profdata"}, &[_][]const u8{}) catch null;
    const cov_tool: ?[]const u8 = b.findProgram(&[_][]const u8{"llvm-cov"}, &[_][]const u8{}) catch null;

    // Ensure tests run before coverage
    coverage_step.dependOn(&run_tests.step);

    if (profdata_tool != null and cov_tool != null) {
        // Merge all profraw files into a single .profdata
        const merge = b.addSystemCommand(&[_][]const u8{
            profdata_tool.?, "merge", "-sparse",
            b.pathJoin(&[_][]const u8{ "zig-out", "coverage", "default_*.profraw" }),
            "-o", b.pathJoin(&[_][]const u8{ "zig-out", "coverage", "default.profdata" }),
        });
        coverage_step.dependOn(&merge.step);
    }
}
