// Fluid Simulation Solver - Main Update Loop
// Extracted from 05-fluid-sim.js lines 1722-1978 - EXACT COPY

let lastTime = performance.now();
let lastDrawTimeMs = 0;
let fpsTimes = [];
// DEFAULT to 60 FPS, not uncapped!
window.fpsCap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 60;
window.__stats = window.__stats || {}; // { fps, frametime, lastCpuMs }
// REMOVED: Adaptive quality control - was interfering with FPS display

let perfLog = { advection: 0, divergence: 0, pressure: 0, gradient: 0, curl: 0, vorticity: 0, display: 0, total: 0, count: 0 };

function update() {
    const frameStart = performance.now();
    const cpuStart = performance.now();
    const nowMs = performance.now();
    
    // FPS Cap: Skip frame if not enough time has passed
    const cap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 0;
    
    // Debug: Log cap value once
    if (!window.__capLogged) {
        console.log(`🎯 Active FPS Cap: ${cap === 0 ? 'Uncapped' : cap}`);
        console.log(`   window.fpsCap = ${window.fpsCap}`);
        console.log(`   Cap from variable: ${cap}`);
        console.log(`   Type check: ${typeof window.fpsCap}`);
        console.log(`🖥️ Hardware: ${navigator.hardwareConcurrency || '?'} cores`);
        console.log(`📊 Display refresh: ${window.screen?.refreshRate || 'unknown'} Hz`);
        console.log(`🔧 Pressure iterations will be forced to 20`);
        window.__capLogged = true;
    }
    
    // Every 300 frames, log if frames are being skipped
    if (!window.__skipLog) window.__skipLog = 0;
    window.__skipLog++;
    if (window.__skipLog === 300) {
        console.log(`⏭️ FPS Cap Status: cap=${cap}, fpsCap=${window.fpsCap}, skipping frames: ${cap > 0 ? 'YES' : 'NO'}`);
        window.__skipLog = 0;
    }
    
    // FPS Cap: Skip frame if not enough time has passed
    if (cap > 0) {
        const desiredMs = 1000 / cap;
        const since = nowMs - lastDrawTimeMs;
        if (since < desiredMs) {
            requestAnimationFrame(update);
            return; // Skip this frame
        }
    }
    
    // Frame is running - update timestamp immediately
    lastDrawTimeMs = nowMs;
    
    // Log ONLY rendered frames (after cap check)
    if (!window.__frameLog) window.__frameLog = { times: [], count: 0 };
    window.__frameLog.times.push(nowMs);
    window.__frameLog.count++;
    if (window.__frameLog.count >= 60) {
        const times = window.__frameLog.times;
        const deltas = [];
        for (let i = 1; i < times.length; i++) {
            deltas.push(times[i] - times[i-1]);
        }
        const avgDelta = deltas.reduce((a,b) => a+b, 0) / deltas.length;
        const actualFPS = 1000 / avgDelta;
        console.log(`✅ RENDERED frame time: ${avgDelta.toFixed(2)}ms = ${actualFPS.toFixed(1)} FPS (cap=${cap})`);
        window.__frameLog = { times: [], count: 0 };
    }
    
    // Physics timestep: Cap at 16ms to prevent instability at low FPS
    // Without this cap, 30 FPS = 33ms timestep = simulation explodes!
    const dt = Math.min((nowMs - lastTime) / 1000, 0.016);
    lastTime = nowMs;
    if (window.kAnimateRot && window.kSpinSpeed) {
        window.kAngle = (window.kAngle || 0) + dt * window.kSpinSpeed * Math.PI / 180;
    }
    
    const targetWidth = canvasWrapper.clientWidth;
    const targetHeight = canvasWrapper.clientHeight;
    
    if (canvas.width !== targetWidth || canvas.height !== targetHeight || window.needsFramebufferReinit) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        trailCanvas.width = targetWidth;
        trailCanvas.height = targetHeight;
        initFramebuffers();
        exposeSimStats(); // Update stats after resize
        window.needsFramebufferReinit = false;
    }
    
    if (!isPaused) {
        if (pointer.moved) {
            multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color, false);
            pointer.moved = false;
        }
        
        // Process right-click replay events before recording and physics
        processReplay();
        
        if (recEnabled) {
            recUpdatePlayback();
        }
        
        advectionProg.bind();
        // Velocity advection at physics resolution
        gl.viewport(0, 0, simTexWidth, simTexHeight);
        gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1f(advectionProg.uniforms.dt, dt);
        
        // Velocity pass
        gl.uniform1i(advectionProg.uniforms.isDensity, 0);
        gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
        gl.uniform1i(advectionProg.uniforms.uSource, 0);
        gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(velocity.write.fbo);
        velocity.swap();
        
        // Density pass (advected by velocity field at sim resolution)
        gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
        gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(advectionProg.uniforms.isDensity, 1);
        gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
        gl.uniform1i(advectionProg.uniforms.uSource, 1);
        gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        blit(density.write.fbo);
        density.swap();
        
        curlProg.bind();
        gl.viewport(0, 0, simTexWidth, simTexHeight);
        gl.uniform2f(curlProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(curlProg.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(curl.fbo);
        
        vorticityProg.bind();
        gl.uniform2f(vorticityProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(vorticityProg.uniforms.uVelocity, 0);
        gl.uniform1i(vorticityProg.uniforms.uCurl, 1);
        gl.uniform1f(vorticityProg.uniforms.curl, config.CURL);
        gl.uniform1f(vorticityProg.uniforms.dt, dt);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, curl.texture);
        blit(velocity.write.fbo);
        velocity.swap();
        
        divergenceProg.bind();
        gl.uniform2f(divergenceProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(divergenceProg.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(divergence.fbo);
        
        clearProg.bind();
        gl.uniform1i(clearProg.uniforms.uTexture, 0);
        gl.uniform1f(clearProg.uniforms.value, config.PRESSURE_DISSIPATION);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        blit(pressure.write.fbo);
        pressure.swap();
        
        pressureProg.bind();
        gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(pressureProg.uniforms.uDivergence, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
        
        const pressureStart = performance.now();
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(pressureProg.uniforms.uPressure, 1);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
            blit(pressure.write.fbo);
            pressure.swap();
        }
        const pressureTime = performance.now() - pressureStart;
        
        // Log performance every 60 frames
        perfLog.pressure += pressureTime;
        perfLog.count++;
        if (perfLog.count >= 60) {
            console.log(`⚡ Pressure solver: ${(perfLog.pressure / perfLog.count).toFixed(2)}ms avg (${config.PRESSURE_ITERATIONS} iterations)`);
            perfLog.pressure = 0;
            perfLog.count = 0;
        }
        
        gradientProg.bind();
        gl.uniform2f(gradientProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(gradientProg.uniforms.uPressure, 0);
        gl.uniform1i(gradientProg.uniforms.uVelocity, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(velocity.write.fbo);
        velocity.swap();
    }
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    displayProg.bind();
    gl.uniform1i(displayProg.uniforms.uTexture, 0);
    gl.uniform1f(displayProg.uniforms.preserveOpacity, window.preserveFluidOpacity ? 1.0 : 0.0);
    gl.uniform1f(displayProg.uniforms.backgroundTransparency, window.backgroundTransparency || 0.0);
    gl.uniform1f(displayProg.uniforms.kaleidoEnabled, window.kaleidoEnabled ? 1.0 : 0.0);
    gl.uniform1f(displayProg.uniforms.segments, (window.kaleidoSegments || 1));
    gl.uniform1i(
        displayProg.uniforms.kMode,
        (typeof window.kaleidoMode === 'number' && isFinite(window.kaleidoMode)) ? window.kaleidoMode : 1
    );
    gl.uniform1f(displayProg.uniforms.kAngle, window.kAngle || 0.0);
    gl.uniform1f(displayProg.uniforms.kTwist, window.kTwist || 0.0);
    gl.uniform1f(displayProg.uniforms.kZoom, window.kZoom || 1.0);
    gl.uniform1f(
        displayProg.uniforms.kBlend,
        (typeof window.kBlend === 'number' && isFinite(window.kBlend)) ? window.kBlend : 1.0
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
    blit(null);
    
    // Draw occurred: update stats based on actual render cadence
    // (lastDrawTimeMs already set at start of update() for FPS cap)
    fpsTimes.push(lastDrawTimeMs);
    const oneSecondAgo = lastDrawTimeMs - 1000;
    fpsTimes = fpsTimes.filter(t => t > oneSecondAgo);
    const fpsVal = fpsTimes.length;
    let frametimeMs = 0;
    if (fpsTimes.length >= 2) {
        frametimeMs = fpsTimes[fpsTimes.length - 1] - fpsTimes[fpsTimes.length - 2];
    }
    const cpuMs = performance.now() - cpuStart;
    window.__stats = { fps: fpsVal, frametime: frametimeMs, lastCpuMs: cpuMs };
    
    // DIAGNOSTIC: Log every 120 frames to compare
    if (!window.__statsLogCount) window.__statsLogCount = 0;
    window.__statsLogCount++;
    if (window.__statsLogCount === 120) {
        const now = performance.now();
        const actualMs = window.__frameLog?.times?.length >= 2 
            ? (window.__frameLog.times[window.__frameLog.times.length - 1] - window.__frameLog.times[0]) / window.__frameLog.times.length
            : 0;
        const actualFPS = actualMs > 0 ? 1000 / actualMs : 0;
        
        console.log(`📊 FPS MISMATCH DIAGNOSTIC:`);
        console.log(`   ✅ RENDERED frames (from frame log): ${actualFPS.toFixed(1)} FPS`);
        console.log(`   ❌ window.__stats.fps (title bar uses): ${fpsVal} FPS`);
        console.log(`   📋 fpsTimes array length: ${fpsTimes.length}`);
        console.log(`   📋 fpsTimes oldest: ${fpsTimes[0]}, newest: ${fpsTimes[fpsTimes.length-1]}`);
        console.log(`   📋 Time range: ${(fpsTimes[fpsTimes.length-1] - fpsTimes[0]).toFixed(2)}ms`);
        console.log(`   🎯 Expected FPS from cap: ${cap || 'uncapped'}`);
        window.__statsLogCount = 0;
    }

    requestAnimationFrame(update);
}

// Export
window.Solver = {
    update
};
