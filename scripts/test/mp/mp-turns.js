// Behaviour probe: 8-person take-turns rotation, host transfer, and what a
// WATCHER can still push into everyone's simulation while it is not their turn.
const WebSocket = require('ws');
const HOST = '127.0.0.1:1999', ROOM = process.env.MP_ROOM || 'TURNSA', N = 8;
const cs = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function connect(i) {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://${HOST}/parties/fluid/${ROOM}?uid=turn-uid-${i}`);
    const c = { i, ws, id: null, log: [], turn: null, got: {} };
    cs[i] = c;
    ws.on('message', (b) => {
      const d = JSON.parse(b.toString());
      c.got[d.type] = (c.got[d.type] || 0) + 1;
      if (d.type === 'connected') { c.id = d.clientId; c.role = d.role; res(c); }
      if (d.type === 'turn-state') c.turn = d;
      if (d.type === 'collider-add') c.log.push('collider-add from ' + d.clientId);
      if (d.type === 'brush-shape') c.log.push('brush-shape from ' + d.clientId);
      if (d.type === 'clear') c.log.push('clear from ' + d.clientId);
      if (d.type === 'host-changed') c.log.push('host-changed -> ' + d.hostId);
    });
    ws.on('error', () => {});
  });
}
const S = (c, o) => { try { c.ws.send(JSON.stringify(o)); } catch {} };

(async () => {
  for (let i = 0; i < N; i++) await connect(i);
  console.log(`connected ${N}; host = c${cs.findIndex(c => c.role === 'host')}`);

  console.log('\n== take turns, 1-minute turns, 8 people ==');
  S(cs[0], { type: 'turns', on: true, seconds: 60, mode: 'timer' });
  await wait(400);
  const t = cs[3].turn;
  console.log(`  turn-state: on=${t.on} order=${t.order.length} holder=${t.order.indexOf(t.holder)} turnMs=${t.turnMs}`);
  console.log(`  full rotation for 8 people = ${(t.turnMs * t.order.length) / 60000} minutes; last in line waits ${(t.turnMs * 7) / 60000} min for a first turn`);

  console.log('\n== a NON-holder tries to act while watching ==');
  const w = cs[5]; // definitely not the holder (holder is c0)
  const before = JSON.parse(JSON.stringify(cs[2].got));
  S(w, { type: 'splat', data: { x: 0.5, y: 0.5, dabs: [[0.5, 0.5, 1, 1, 0.01]] } });
  S(w, { type: 'clear' });
  S(w, { type: 'preset', data: { preset: { name: 'x' } } });
  S(w, { type: 'collider-add', data: { lid: 99, seq: 0, total: 1, w: 8, h: 8, rev: 'z', part: 'data:image/png;base64,AAAA' } });
  S(w, { type: 'collider-remove', data: { lid: 3 } });
  S(w, { type: 'brush-shape', data: { id: 'x', seq: 0, total: 1, part: 'y' } });
  S(w, { type: 'cursor', data: { x: 0.1, y: 0.1 } });
  S(w, { type: 'turn-state', on: false, order: [], holder: null }); // forgery attempt
  await wait(600);
  const d = (k) => (cs[2].got[k] || 0) - (before[k] || 0);
  ['splat', 'clear', 'preset', 'collider-add', 'collider-remove', 'brush-shape', 'cursor', 'turn-state']
    .forEach(k => console.log(`   ${k.padEnd(16)} ${d(k) ? 'RELAYED to watchers' : 'blocked'}`));

  console.log('\n== host (the current painter) leaves ==');
  cs[0].ws.close();
  await wait(700);
  console.log(`  c1 saw: ${cs[1].log.filter(l => l.startsWith('host-changed')).join(', ') || '(no host-changed)'}`);
  console.log(`  new rotation size = ${cs[1].turn.order.length}, holder index = ${cs[1].turn.order.indexOf(cs[1].turn.holder)}`);

  console.log('\n== pass the brush 8 times, timing the round trip ==');
  let holder = cs.find(c => c.ws.readyState === 1 && c.turn && c.turn.holder === c.id);
  for (let k = 0; k < 4; k++) {
    const h = cs.find(c => c.ws.readyState === 1 && c.turn && c.turn.holder === c.id);
    if (!h) { console.log('  no holder found'); break; }
    const t0 = Date.now();
    S(h, { type: 'turn-pass' });
    await wait(250);
    const nh = cs.find(c => c.ws.readyState === 1 && c.turn && c.turn.holder === c.id);
    console.log(`  pass ${k + 1}: c${h.i} -> ${nh ? 'c' + nh.i : '?'} (${Date.now() - t0}ms incl. 250ms settle)`);
  }

  cs.forEach(c => { try { c.ws.close(); } catch {} });
  await wait(300);
  process.exit(0);
})();
