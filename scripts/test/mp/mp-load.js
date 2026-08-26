// 8-user multiplayer load probe against a local `partykit dev` relay.
// Mirrors the real client's wire shapes (js/06-multiplayer.js flushDabs /
// broadcastCursor / ping) so the numbers describe the actual product.
const WebSocket = require('ws');

const HOST = process.env.MP_HOST || '127.0.0.1:1999';
const ROOM = process.env.MP_ROOM || 'LOADAA';
const N = +(process.env.MP_N || 8);
const PAINTERS = +(process.env.MP_PAINTERS || 8);
const SECONDS = +(process.env.MP_SECONDS || 6);

// One flush = up to 96 dabs (DAB_MAX_PER_MSG), fired ~42x/sec at the
// 4000 dab/s BRUSH_DAB_BUDGET. Shape copied from flushDabs().
function splatMsg() {
  const dabs = [];
  for (let i = 0; i < 96; i++) {
    dabs.push([
      +(Math.random()).toFixed(4), +(Math.random()).toFixed(4),
      +(Math.random() * 40 - 20).toFixed(3), +(Math.random() * 40 - 20).toFixed(3),
      +(0.012).toFixed(5),
    ]);
  }
  return JSON.stringify({
    type: 'splat',
    data: { x: 0.5, y: 0.5, dx: 0.001, dy: 0.001, color: [1, 0, 0], mult: 1,
            radius: 0.012, sym: 'radial', dabs, tip: 0, angle: 0 },
    timestamp: Date.now(),
  });
}
const cursorMsg = () => JSON.stringify({ type: 'cursor', data: { x: Math.random(), y: Math.random() }, timestamp: Date.now() });

const clients = [];
let closed = [];

function connect(i, uid) {
  return new Promise((resolve) => {
    const url = `ws://${HOST}/parties/fluid/${ROOM}?uid=${uid}`;
    const ws = new WebSocket(url);
    const c = { i, uid, ws, rx: 0, rxBytes: 0, tx: 0, txBytes: 0, lat: [], connected: null, closeCode: null };
    clients[i] = c;
    const t = setTimeout(() => resolve({ c, outcome: 'timeout' }), 8000);
    ws.on('open', () => { c.openedAt = Date.now(); });
    ws.on('message', (buf) => {
      const s = buf.toString();
      c.rx++; c.rxBytes += Buffer.byteLength(s);
      let d; try { d = JSON.parse(s); } catch { return; }
      if (d.type === 'connected') { c.connected = d; clearTimeout(t); resolve({ c, outcome: 'connected' }); }
      if (d.type === 'splat' && d.timestamp) c.lat.push(Date.now() - d.timestamp);
      c.types = c.types || {}; c.types[d.type] = (c.types[d.type] || 0) + 1;
    });
    ws.on('close', (code) => { c.closeCode = code; closed.push({ i, code }); clearTimeout(t); resolve({ c, outcome: 'closed:' + code }); });
    ws.on('error', () => {});
  });
}

const send = (c, s) => { if (c.ws.readyState === 1) { c.ws.send(s); c.tx++; c.txBytes += Buffer.byteLength(s); } };

(async () => {
  console.log(`== connecting ${N} clients to ${HOST}/parties/fluid/${ROOM} ==`);
  const results = [];
  for (let i = 0; i < N; i++) results.push(await connect(i, 'dev-uid-' + i));
  results.forEach((r, i) => console.log(`  client ${i}: ${r.outcome}` + (r.c.connected ? ` role=${r.c.connected.role} total=${r.c.connected.totalClients} cap=${r.c.connected.capacity}` : '')));

  // Over-capacity probe: one more than the cap should be refused, not admitted.
  const over = await connect(N, 'dev-uid-over');
  console.log(`  client ${N} (over cap): ${over.outcome}`);

  console.log(`\n== ${PAINTERS} of ${N} painting flat-out for ${SECONDS}s ==`);
  const sizeOfSplat = Buffer.byteLength(splatMsg());
  console.log(`  one splat message = ${sizeOfSplat} B (relay cap 16384)`);
  const t0 = Date.now();
  clients.slice(0, N).forEach((c) => { c.rx = 0; c.rxBytes = 0; c.lat = []; c.types = {}; });

  const timers = [];
  for (let i = 0; i < PAINTERS; i++) {
    const c = clients[i];
    timers.push(setInterval(() => send(c, splatMsg()), 24));   // ~42 flushes/s
    timers.push(setInterval(() => send(c, cursorMsg()), 50));  // 20 cursor/s
  }
  for (let i = 0; i < N; i++) timers.push(setInterval(() => send(clients[i], JSON.stringify({ type: 'ping' })), 20000));

  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  timers.forEach(clearInterval);
  await new Promise((r) => setTimeout(r, 800)); // drain
  const dt = (Date.now() - t0) / 1000;

  let txAll = 0, rxAll = 0, rxBytesAll = 0, txBytesAll = 0;
  console.log('\n  per-client (rx = what this client must PARSE + apply):');
  for (let i = 0; i < N; i++) {
    const c = clients[i];
    txAll += c.tx; rxAll += c.rx; rxBytesAll += c.rxBytes; txBytesAll += c.txBytes;
    const lat = c.lat.slice().sort((a, b) => a - b);
    const p = (q) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] : -1;
    console.log(`   c${i}: rx ${c.rx} msgs (${(c.rx / dt).toFixed(0)}/s, ${(c.rxBytes / dt / 1024).toFixed(0)} KB/s)  splat-latency p50 ${p(0.5)}ms p95 ${p(0.95)}ms max ${lat[lat.length - 1] ?? -1}ms`);
  }
  const dabsPerSec = (clients[0].types?.splat || 0) / dt * 96;
  console.log(`\n  totals over ${dt.toFixed(1)}s: sent ${txAll} msgs (${(txBytesAll / 1024 / dt).toFixed(0)} KB/s in), delivered ${rxAll} msgs (${(rxBytesAll / 1024 / dt).toFixed(0)} KB/s out)`);
  console.log(`  fan-out ratio ${(rxAll / txAll).toFixed(2)}x`);
  console.log(`  a single client receives ~${dabsPerSec.toFixed(0)} peer dabs/sec (local budget for ITSELF is 4000/s)`);
  console.log(`  message-type mix at c0: ${JSON.stringify(clients[0].types)}`);

  // Oversize probe: does a too-big message really vanish silently?
  const big = JSON.stringify({ type: 'splat', data: { pad: 'x'.repeat(17000) }, timestamp: Date.now() });
  const before = clients[1].types.splat || 0;
  send(clients[0], big);
  await new Promise((r) => setTimeout(r, 600));
  console.log(`\n  oversize (${(Buffer.byteLength(big) / 1024).toFixed(1)} KB) message: ${((clients[1].types.splat || 0) > before) ? 'DELIVERED' : 'silently dropped'}; sender got ${clients[0].closeCode ? 'close ' + clients[0].closeCode : 'no feedback'}`);

  clients.forEach((c) => { try { c.ws.close(); } catch {} });
  await new Promise((r) => setTimeout(r, 400));
  process.exit(0);
})();
