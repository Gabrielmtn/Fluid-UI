// Loopback wire harness — BROWSER CONSOLE, not Node. Answers: does a peer see
// the stroke the painter painted? Paste this whole file into the console of a
// FOREGROUND tab (the frame loop must run), then:
//   await __lb.A()      paint a synthetic S-stroke locally; capture the wire
//                       messages on a fake socket; read the dye as a 64x64 grid
//   await __lb.B()      clear, replay those messages through the real receive
//                       path (__mpInboundProbe) at their original timing, read
//                       the dye again, and report how the drain paced the dabs
//   __lb.report()       correlation, dye ratio, roughness (filament detail)
// No relay needed. Settings must be the defaults for numbers to compare
// across runs (Settings → Clear, reload). Reference (2026-09-11, pane iGPU):
// additive 0.87 correlation / 0.89 dye, Gate 0.97 / 1.03 — before the
// velocity-clamp fix both read ~0.53 / 0.43.
(function () {
  const W = 64, H = 64;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function readDyeGrid() {
    // Bind a scratch FBO to the dye texture and read the whole thing as FLOAT.
    const fb = (typeof density !== 'undefined') ? (density.read || density) : null;
    if (!fb || !fb.texture) return null;
    const w = fb.width, h = fb.height;
    const scratch = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fb.texture, 0);
    const buf = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(scratch);
    // Box-downsample luminance to WxH (flip Y so row 0 is the top).
    const grid = new Float32Array(W * H);
    const cx = w / W, cy = h / H;
    for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
      let s = 0, n = 0;
      const x0 = Math.floor(gx * cx), x1 = Math.floor((gx + 1) * cx);
      const y0 = Math.floor((H - 1 - gy) * cy), y1 = Math.floor((H - gy) * cy);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4; s += 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; n++;
      }
      grid[gy * W + gx] = n ? s / n : 0;
    }
    return { grid, w, h };
  }
  function strokePath(i, n) {
    // S-curve across the canvas, ~70% width, in canvas CSS pixels.
    const r = canvas.getBoundingClientRect();
    const t = i / (n - 1);
    const x = r.left + r.width * (0.15 + 0.7 * t);
    const y = r.top + r.height * (0.5 + 0.22 * Math.sin(t * Math.PI * 2));
    return { x, y };
  }
  function pev(type, x, y, extra) {
    const e = new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : 0.5 }, extra || {}));
    return e;
  }
  async function paintStroke(ms, steps) {
    const c = canvas;
    if (!c.setPointerCapture.__stub) { c.setPointerCapture = function () {}; c.setPointerCapture.__stub = true; c.releasePointerCapture = function () {}; }
    const p0 = strokePath(0, steps);
    c.dispatchEvent(pev('pointerdown', p0.x, p0.y));
    const t0 = performance.now();
    for (let i = 1; i < steps; i++) {
      const target = t0 + (ms * i) / (steps - 1);
      while (performance.now() < target) await sleep(2);
      const p = strokePath(i, steps);
      c.dispatchEvent(pev('pointermove', p.x, p.y));
    }
    const pe = strokePath(steps - 1, steps);
    window.dispatchEvent(pev('pointerup', pe.x, pe.y));
  }
  const state = { sent: [], A: null, B: null, tA: 0 };
  window.__lb = {
    async A(opts) {
      opts = opts || {};
      const ms = opts.ms || 1200, steps = opts.steps || 72;
      // Fake socket: capture what the wire would carry.
      state.sent = [];
      window.__lbFakeSocket = { readyState: 1, send(s) { state.sent.push({ t: performance.now(), msg: JSON.parse(s) }); }, close() {} };
      partySocket = window.__lbFakeSocket; isMultiplayerEnabled = true; clientId = 'lb-local'; currentRoom = 'LBTEST';
      if (typeof clearCanvas === 'function') clearCanvas();
      await sleep(300);
      state.tA = performance.now();
      await paintStroke(ms, steps);
      await sleep(1800); // tail + settle
      state.A = readDyeGrid();
      const splats = state.sent.filter(m => m.msg.type === 'splat');
      const dabs = splats.reduce((n, m) => n + ((m.msg.data.dabs || []).length || 1), 0);
      return { messages: state.sent.length, splatMessages: splats.length, dabs, firstSend: splats.length ? Math.round(splats[0].t - state.tA) : null, lastSend: splats.length ? Math.round(splats[splats.length - 1].t - state.tA) : null, gridMean: state.A ? Array.from(state.A.grid).reduce((a, b) => a + b, 0) / (W * H) : null, dye: state.A && { w: state.A.w, h: state.A.h } };
    },
    async B() {
      // Detach the fake socket so the replayed dabs are not re-captured.
      partySocket = null; isMultiplayerEnabled = true;
      if (typeof clearCanvas === 'function') clearCanvas();
      if (window.__mpInboundProbe) window.__mpInboundProbe.reset();
      await sleep(300);
      const splats = state.sent.filter(m => m.msg.type === 'splat');
      const t0 = splats.length ? splats[0].t : 0;
      const base = performance.now();
      const applied = [];
      // Hook the receive path to log when each message is actually painted.
      const origDrain = window.__mpDrainInbound;
      window.__mpDrainInbound = function (budget) { const before = window.__mpInboundProbe.depth().messages; origDrain(budget); const after = window.__mpInboundProbe.depth().messages; if (before !== after) applied.push({ t: Math.round(performance.now() - base), n: before - after }); };
      splats.forEach((m) => {
        const d = JSON.parse(JSON.stringify(m.msg)); d.clientId = 'lb-peer';
        setTimeout(() => window.__mpInboundProbe.push(d), Math.max(0, m.t - t0));
      });
      const total = splats.length ? splats[splats.length - 1].t - t0 : 0;
      await sleep(total + 1800);
      window.__mpDrainInbound = origDrain;
      state.B = readDyeGrid();
      return { replayed: splats.length, spanMs: Math.round(total), applyEvents: applied.length, applyTimes: applied.slice(0, 40), gridMean: state.B ? Array.from(state.B.grid).reduce((a, b) => a + b, 0) / (W * H) : null };
    },
    report() {
      const A = state.A && state.A.grid, B = state.B && state.B.grid;
      if (!A || !B) return { error: 'run A and B first' };
      let sad = 0, sa = 0, sb = 0, dot = 0, aa = 0, bb = 0;
      for (let i = 0; i < A.length; i++) { sad += Math.abs(A[i] - B[i]); sa += A[i]; sb += B[i]; dot += A[i] * B[i]; aa += A[i] * A[i]; bb += B[i] * B[i]; }
      const corr = dot / Math.sqrt(aa * bb || 1);
      // Along-stroke profile: max luminance per column (the stroke is ~horizontal)
      const prof = (G) => { const out = []; for (let x = 0; x < W; x++) { let m = 0; for (let y = 0; y < H; y++) m = Math.max(m, G[y * W + x]); out.push(+m.toFixed(3)); } return out; };
      const pA = prof(A), pB = prof(B);
      // "spottiness": mean absolute second difference of the profile inside the stroke span
      const rough = (p) => { let s = 0, n = 0; for (let x = 10; x < W - 10; x++) { if (p[x] > 0.02) { s += Math.abs(p[x - 1] - 2 * p[x] + p[x + 1]); n++; } } return n ? +(s / n).toFixed(4) : 0; };
      return { meanAbsDiff: +(sad / A.length).toFixed(4), totalDyeA: +sa.toFixed(2), totalDyeB: +sb.toFixed(2), ratioBoverA: +(sb / (sa || 1)).toFixed(3), correlation: +corr.toFixed(4), roughnessA: rough(pA), roughnessB: rough(pB), profileA: pA, profileB: pB };
    },
    sent() { return state.sent.map(m => ({ t: Math.round(m.t - state.tA), type: m.msg.type, dabs: (m.msg.data && m.msg.data.dabs) ? m.msg.data.dabs.length : undefined, color: m.msg.data && m.msg.data.color })); },
    state
  };
  return 'harness installed';
})();
