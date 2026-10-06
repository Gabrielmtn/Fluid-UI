// Two ordinary client connections to a random private room code, purely to ask
// the LIVE relay which feature set it is running. Both sockets close at the end
// (an emptied room wipes its own state), so nothing is left behind. Run it
// after every deploy (npm run deploy:cf).
//   node scripts/test/mp/mp-prod-version.js            (swirltogether.com)
//   MP_HOST=127.0.0.1:8787 node scripts/test/mp/mp-prod-version.js
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || 'swirltogether.com';
const PROTO = /^(localhost|127\.|\[::1)/.test(HOST) ? 'ws' : 'wss';
const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM = Array.from({length: 6}, () => AB[Math.floor(Math.random()*AB.length)]).join('');
const wait = ms => new Promise(r => setTimeout(r, ms));
function connect(uid) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${PROTO}://${HOST}/parties/fluid/${ROOM}?uid=${uid}`);
    const c = { ws, msgs: [] };
    const t = setTimeout(() => rej(new Error('timeout')), 12000);
    ws.on('message', b => { const d = JSON.parse(b.toString()); c.msgs.push(d);
      if (d.type === 'connected') { c.hello = d; clearTimeout(t); res(c); } });
    ws.on('error', e => { clearTimeout(t); rej(e); });
  });
}
const S = (c, o) => c.ws.send(JSON.stringify(o));
(async () => {
  console.log('probing relay', HOST, 'room', ROOM);
  const a = await connect('probe-a-' + ROOM), b = await connect('probe-b-' + ROOM);
  console.log('  hello:', JSON.stringify(a.hello));
  console.log('  capacity reported:', a.hello.capacity, a.hello.capacity === 8 ? '(cap-8 private rooms: present)' : '(OLD relay — no capacity field)');

  // Shared settings (2026-10-06) ride the default relay: any build forwards them.
  S(a, { type: 'room-look', full: false, snapshot: { baseline: 7, sliders: { curl: 12 } } });
  await wait(800);
  const rl = b.msgs.filter(m => m.type === 'room-look').pop();
  console.log('  room-look relayed:', rl && rl.clientId ? 'yes, stamped with the sender' : 'NO');

  // Asked before turns: while turns run, an old relay drops the lock anyway.
  S(a, { type: 'settings-lock', locked: true, snapshot: { sliders: { curl: 1 } } });
  await wait(800);
  console.log('  look lock retired:', b.msgs.some(m => m.type === 'settings-lock') ? 'NOT DEPLOYED — the host lock still relays' : 'LIVE');

  // Turns and the look lock retired the same day: a relay with them still
  // live lets an older client switch turns on and gate everyone's paint.
  S(a, { type: 'turns', on: true, seconds: 0, mode: 'stroke' });
  await wait(1200);
  const ts = b.msgs.filter(m => m.type === 'turn-state').pop();
  console.log('  turns retired (2026-10-06):', ts && ts.on ? 'NOT DEPLOYED — this relay still starts turns' : 'LIVE');

  const before = b.msgs.filter(m => m.type === 'turn-state').length;
  S(a, { type: 'turn-state', on: false, order: [], holder: null, clientId: 'forged' });
  await wait(1000);
  const after = b.msgs.filter(m => m.type === 'turn-state').length;
  console.log('  forged turn-state from a client:', after > before ? 'RELAYED (old relay — forgery possible)' : 'blocked');

  const pings = b.msgs.filter(m => m.type === 'ping').length;
  S(a, { type: 'ping' }); await wait(800);
  console.log('  heartbeat relayed to peers?', b.msgs.filter(m => m.type === 'ping').length > pings ? 'YES (old relay)' : 'no — swallowed, as the reaper build does');

  // The rotation code itself went later the same day: the first retirement
  // still answered a host's "turns off" with a turn-state; this build
  // swallows it.
  const offBefore = a.msgs.filter(m => m.type === 'turn-state').length + b.msgs.filter(m => m.type === 'turn-state').length;
  S(a, { type: 'turns', on: false });
  await wait(800);
  const offAfter = a.msgs.filter(m => m.type === 'turn-state').length + b.msgs.filter(m => m.type === 'turn-state').length;
  console.log('  rotation code removed:', offAfter > offBefore ? 'NOT DEPLOYED — a turns off still gets a turn-state' : 'LIVE');
  a.ws.close(); b.ws.close(); await wait(500); process.exit(0);
})().catch(e => { console.log('probe failed:', e.message); process.exit(1); });
