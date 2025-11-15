// Input Handling - Pointer, Splat, Stroke Replay
// Extracted from 05-fluid-sim.js for better organization

function blit(dest) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

let pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, moved: false, color: [1, 0, 0] };
window.pointer = pointer; // Expose for stats panel
// Stroke tracking for right-click replay
let strokeEvents = [];
let strokeStartTime = 0;
let replayStartTime = 0;
let replayIndex = 0;

function startStroke(x, y) {
    strokeEvents = [];
    strokeStartTime = Date.now();
}

function pushStrokeEvent(x, y, dx, dy, color) {
    const t = Date.now() - strokeStartTime;
    strokeEvents.push({ t, x, y, dx, dy, color: color.slice(), mult: (typeof animationMultiplier === 'number' ? animationMultiplier : 1), radius: config.SPLAT_RADIUS });
}

// Called from mousemove path when drawing (stroke capture only)
function trackStrokeMove(e) {
    // pointer state already updated
    pushStrokeEvent(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
}

function replayStroke(broadcast = true) {
    if (!strokeEvents.length) { isReplayActive = false; return; }
    replayIndex = 0;
    replayStartTime = Date.now();
    isReplayActive = true;
    // Broadcast full stroke to multiplayer
    if (broadcast && typeof broadcastReplayStroke === 'function') {
        const norm = strokeEvents.map(ev => ({
            t: ev.t,
            x: ev.x / canvas.width,
            y: ev.y / canvas.height,
            dx: ev.dx / canvas.width,
            dy: ev.dy / canvas.height,
            color: ev.color,
            mult: ev.mult,
            radius: ev.radius
        }));
        try { broadcastReplayStroke(norm); } catch(_){}
    }
}

function processReplay() {
    if (!isReplayActive) return;
    const elapsed = Date.now() - replayStartTime;
    while (replayIndex < strokeEvents.length && strokeEvents[replayIndex].t <= elapsed) {
        const ev = strokeEvents[replayIndex++];
        if (typeof window.applyMultiSplatWith === 'function') {
            window.applyMultiSplatWith(ev.x, ev.y, ev.dx, ev.dy, ev.color, ev.mult, ev.radius);
        } else {
            const prevM = animationMultiplier; const prevR = config.SPLAT_RADIUS;
            animationMultiplier = ev.mult; config.SPLAT_RADIUS = ev.radius;
            multiSplat(ev.x, ev.y, ev.dx, ev.dy, ev.color, false);
            animationMultiplier = prevM; config.SPLAT_RADIUS = prevR;
        }
        if (typeof recRecordInteraction === 'function' && recEnabled) {
            try { recRecordInteraction(ev.x, ev.y, ev.dx, ev.dy, ev.color); } catch(_){}
        }
    }
    if (replayIndex >= strokeEvents.length) {
        // If right button still held, loop replay without rebroadcast
        if (isRightMouseDown) {
            replayStroke(false);
        } else {
            isReplayActive = false;
        }
    }
}

// Allow multiplayer to schedule a stroke replay with normalized events
window.scheduleStrokeReplay = function(normalizedEvents) {
    strokeEvents = (normalizedEvents || []).map(ev => ({
        t: ev.t || 0,
        x: (ev.x || 0) * canvas.width,
        y: (ev.y || 0) * canvas.height,
        dx: (ev.dx || 0) * canvas.width,
        dy: (ev.dy || 0) * canvas.height,
        color: Array.isArray(ev.color) ? ev.color.slice() : pointer.color.slice(),
        mult: Math.max(1, Math.round(ev.mult || 1)),
        radius: (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS
    }));
    replayStroke(false);
};

function multiSplat(x, y, dx, dy, color, shouldBroadcast) {
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;

    for (let i = 0; i < animationMultiplier; i++) {
        const angle = (Math.PI * 2 * i) / animationMultiplier;

        const relX = x - centerX;
        const relY = y - centerY;

        const rotatedX = relX * Math.cos(angle) - relY * Math.sin(angle);
        const rotatedY = relX * Math.sin(angle) + relY * Math.cos(angle);

        const finalX = rotatedX + centerX;
        const finalY = rotatedY + centerY;

        const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);

        splat(finalX, finalY, rotatedDx, rotatedDy, color);
    }

    if (shouldBroadcast && typeof broadcastSplat === 'function') {
        broadcastSplat(
            x / canvas.width,
            y / canvas.height,
            dx / canvas.width,
            dy / canvas.height,
            color,
            (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
            config.SPLAT_RADIUS
        );
    }
}

// Helper to apply a multiSplat with specific multiplier and radius, restoring after
window.applyMultiSplatWith = function(x, y, dx, dy, color, mult, radius) {
    const prevM = (typeof animationMultiplier === 'number') ? animationMultiplier : 1;
    const prevR = config.SPLAT_RADIUS;
    animationMultiplier = Math.max(1, Math.round(mult || 1));
    config.SPLAT_RADIUS = (typeof radius === 'number') ? radius : prevR;
    try { multiSplat(x, y, dx, dy, color, false); } finally {
        animationMultiplier = prevM;
        config.SPLAT_RADIUS = prevR;
    }
};

// Generate vibrant random color (avoids washed out/pale colors)
function generateVibrantColor() {
    // Use HSL to control saturation and lightness
    const hue = Math.random() * 360; // Full spectrum
    const sat = 0.7 + Math.random() * 0.3; // 70-100% saturation (vibrant)
    const light = 0.45 + Math.random() * 0.2; // 45-65% lightness (not too bright/dark)
    
    // Convert HSL to RGB
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = light - c / 2;
    
    let r, g, b;
    if (hue < 60) { r = c; g = x; b = 0; }
    else if (hue < 120) { r = x; g = c; b = 0; }
    else if (hue < 180) { r = 0; g = c; b = x; }
    else if (hue < 240) { r = 0; g = x; b = c; }
    else if (hue < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    return [r + m, g + m, b + m];
}

function updateColor() {
    const stepEl = document.getElementById('stepPalette');
    const rndEl = document.getElementById('randomColor');
    if (stepEl && stepEl.checked) {
        const list = getStepColorList();
        if (list.length > 0) {
            const len = list.length;
            const idx = paletteStepIndex % len;
            const col = list[idx];
            paletteStepIndex = (paletteStepIndex + 1) % len;
            if (col) {
                const r = parseInt(col.slice(1, 3), 16) / 255;
                const g = parseInt(col.slice(3, 5), 16) / 255;
                const b = parseInt(col.slice(5, 7), 16) / 255;
                pointer.color = [r, g, b];
            }
            if (typeof updatePaletteStepIndicator === 'function') {
                updatePaletteStepIndicator();
            }
            return;
        }
    }
    if (rndEl && rndEl.checked) {
        pointer.color = generateVibrantColor();
        return;
    }
    const hex = document.getElementById('colorPicker').value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    pointer.color = [r, g, b];
}

// Expose globally for other scripts
window.generateVibrantColor = generateVibrantColor;

function splat(x, y, dx, dy, color) {
    const aspectRatio = canvas.width / canvas.height;
    
    splatProg.bind();
    gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
    gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform1f(splatProg.uniforms.radius, config.SPLAT_RADIUS);
    gl.uniform1f(splatProg.uniforms.velocityInfluence, config.VELOCITY_INFLUENCE || 22.0);
    
    // Write velocity at physics resolution (with isolation applied)
    gl.viewport(0, 0, simTexWidth, simTexHeight);
    gl.uniform1i(splatProg.uniforms.isVelocity, 1); // Velocity pass
    gl.uniform1i(splatProg.uniforms.uTarget, 0);
    gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
    blit(velocity.write.fbo);
    velocity.swap();
    
    // Write density at dye resolution (full radius for visual quality)
    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
    gl.uniform1i(splatProg.uniforms.isVelocity, 0); // Density pass
    gl.uniform1i(splatProg.uniforms.uTarget, 0);
    gl.uniform3fv(splatProg.uniforms.color, color);
    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
    blit(density.write.fbo);
    density.swap();
}

// Export
window.Input = {
    get pointer() { return pointer; },
    blit,
    splat,
    multiSplat,
    processReplay,
    updateColor,
    generateVibrantColor
};
