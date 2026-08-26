// Two ordinary client connections to a random private room code, purely to ask
// the LIVE relay which feature set it is running. Both sockets close at the end
// (an emptied room wipes its own state), so nothing is left behind.
const WebSocket = require('ws');
const HOST = 'fluid-ui-multiplayer.gabrielmtn.partykit.dev';
const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM = Array.from({length: 6}, () => AB[Math.floor(Math.random()*AB.length)]).join('');
const wait = ms => new Promise(r => setTimeout(r, ms));
function connect(uid) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`wss://${HOST}/parties/fluid/${ROOM}?uid=${uid}`);
    const c = { ws, msgs: [] };
    const t = setTimeout(() => rej(new Error('timeout')), 12000);
    ws.on('message', b => { const d = JSON.parse(b.toString()); c.msgs.push(d);
      if (d.type === 'connected') { c.hello = d; clearTimeout(t); res(c); } });
    ws.on('error', e => { clearTimeout(t); rej(e); });
  });
}
const S = (c, o) => c.ws.send(JSON.stringify(o));
(async () => {
  console.log('probing LIVE relay', HOST, 'room', ROOM);
  const a = await connect('probe-a'), b = await connect('probe-b');
  console.log('  hello:', JSON.stringify(a.hello));
  console.log('  capacity reported:', a.hello.capacity, a.hello.capacity === 8 ? '(cap-8 private rooms: present)' : '(OLD relay — no capacity field)');

  S(a, { type: 'turns', on: true, seconds: 0, mode: 'stroke' });
  await wait(1200);
  const ts = b.msgs.filter(m => m.type === 'turn-state').pop();
  console.log('  turn-state:', ts ? JSON.stringify({on: ts.on, mode: ts.mode, turnMs: ts.turnMs, order: (ts.order||[]).length}) : 'NONE');
  console.log('  "One swirl each" (mode:"stroke"):', ts && ts.mode === 'stroke' ? 'LIVE' : 'NOT DEPLOYED — live relay predates it');

  const before = b.msgs.filter(m => m.type === 'turn-state').length;
  S(a, { type: 'turn-state', on: false, order: [], holder: null, clientId: 'forged' });
  await wait(1000);
  const after = b.msgs.filter(m => m.type === 'turn-state').length;
  console.log('  forged turn-state from a client:', after > before ? 'RELAYED (old relay — forgery possible)' : 'blocked');

  const pings = b.msgs.filter(m => m.type === 'ping').length;
  S(a, { type: 'ping' }); await wait(800);
  console.log('  heartbeat relayed to peers?', b.msgs.filter(m => m.type === 'ping').length > pings ? 'YES (old relay)' : 'no — swallowed, as the reaper build does');

  S(a, { type: 'turns', on: false });
  await wait(500);
  a.ws.close(); b.ws.close(); await wait(500); process.exit(0);
})().catch(e => { console.log('probe failed:', e.message); process.exit(1); });
