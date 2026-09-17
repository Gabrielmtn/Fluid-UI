// Behaviour probe: phone brushes on the relay (2026-09-16). A pad joins with
// ?kind=pad (phone/phone.js); the relay must never make it the host, must
// hand a canvas the seat when one arrives, and must relay the pad's own
// messages (pad-hello / pad-info, its strokes and passes) like anyone's.
//   MP_HOST=127.0.0.1:8787 node scripts/test/mp/mp-pad.js     (wrangler dev)
//   node scripts/test/mp/mp-pad.js                            (partykit dev, :1999)
//   MP_HOST=swirltogether.com node scripts/test/mp/mp-pad.js  (the live relay, wss)
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || process.argv[2] || '127.0.0.1:1999';
// ws:// for a local relay, wss:// for a deployed one (the client's rule).
const PROTO = /^(localhost|127\.|10\.|192\.168\.)/.test(HOST) ? 'ws' : 'wss';
const ROOM = process.env.MP_ROOM || ('PD' + Math.random().toString(36).slice(2, 6).toUpperCase());
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
let fails = 0, passes = 0;
const check = (ok, msg, extra) => {
  if (ok) passes++; else fails++;
  log((ok ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};
const stamp = Date.now().toString(36);

function connect(name, uid, pad) {
  return new Promise((res, rej) => {
    const url = `${PROTO}://${HOST}/parties/fluid/${ROOM}?uid=${encodeURIComponent(uid)}` + (pad ? '&kind=pad' : '');
    const ws = new WebSocket(url);
    const c = { name, uid, ws, id: null, role: null, turn: null, msgs: [], hostChanged: [] };
    ws.on('message', (b) => {
      const d = JSON.parse(b.toString());
      c.msgs.push(d);
      if (d.type === 'connected') { c.id = d.clientId; c.role = d.role; res(c); }
      if (d.type === 'turn-state') c.turn = d;
      if (d.type === 'host-changed') c.hostChanged.push(d.hostId);
    });
    ws.on('error', rej);
    ws.on('close', (code) => { c.closed = code; });
  });
}
const S = (c, o) => c.ws.send(JSON.stringify(o));
const got = (c, type) => c.msgs.filter(m => m.type === type);
// wrangler dev never answers a client close frame (the socket sits in
// CLOSING), so a leave is a terminate: the server sees the TCP drop.
const drop = async (c) => { c.ws.terminate(); await wait(700); };

(async () => {
  log(`room ${ROOM} on ${HOST}`);

  // 1. A pad alone does not take the seat; the first canvas does.
  const P1 = await connect('P1', 'pad-1-' + stamp, true);
  check(P1.role === 'guest', 'a pad joining an empty room is a guest', P1.role);
  const D1 = await connect('D1', 'desk-1-' + stamp, false);
  check(D1.role === 'host', 'the first canvas after a pad becomes host', D1.role);

  // 2. The pad's messages relay, stamped with the sender, both ways.
  S(P1, { type: 'pad-hello', data: { v: 1, tag: 'abc' } });
  S(D1, { type: 'pad-info', data: { v: 1, w: 1500, h: 840, gate: false } });
  await wait(500);
  const hello = got(D1, 'pad-hello')[0];
  check(!!hello && hello.clientId === P1.id && hello.data && hello.data.tag === 'abc', 'pad-hello reaches the canvas, stamped with the pad id', hello && hello.clientId);
  const info = got(P1, 'pad-info')[0];
  check(!!info && info.clientId === D1.id && info.data.w === 1500, 'pad-info reaches the pad, stamped with the canvas id');
  S(P1, { type: 'splat', data: { x: 0.5, y: 0.5, dx: 0, dy: 0, color: [1, 0, 0], base: [1, 0, 0], mult: 1, radius: 0.011, dabs: [[0.5, 0.5, 10, 0, 0.011, 0.3, 0.3, 0]] } });
  S(P1, { type: 'cursor', data: { x: 0.5, y: 0.5 } });
  S(P1, { type: 'pointer-up' });
  await wait(500);
  check(got(D1, 'splat').some(m => m.clientId === P1.id && Array.isArray(m.data.dabs)), 'a pad stroke reaches the canvas');
  check(got(D1, 'cursor').some(m => m.clientId === P1.id), 'a pad cursor reaches the canvas');
  check(got(D1, 'pointer-up').some(m => m.clientId === P1.id), 'a pad pointer-up reaches the canvas');

  // 3. The canvas reloads: the pad does not inherit the room, the canvas gets it back.
  await drop(D1);
  const leftP1 = got(P1, 'peer-left').map(m => m.id);
  check(leftP1.includes(D1.id), 'the pad hears the canvas left (peer-left)', leftP1);
  check(!P1.hostChanged.includes(P1.id), 'the host seat is not handed to the pad', P1.hostChanged);
  const D1b = await connect('D1b', D1.uid, false);
  check(D1b.role === 'host', 'the same canvas back after a reload is host again', D1b.role);

  // 4. Host leaves with a pad that joined EARLIER than the other canvas: the canvas gets it.
  const D2 = await connect('D2', 'desk-2-' + stamp, false);
  check(D2.role === 'guest', 'a second canvas is a guest', D2.role);
  await drop(D1b);
  await wait(300);
  check(D2.hostChanged.includes(D2.id), 'host passes to the other canvas, not the older pad', D2.hostChanged);
  check(!P1.hostChanged.includes(P1.id), 'the pad never hears itself named host', P1.hostChanged);

  // 5. Same device id as the host, but a pad: still a guest, and the canvas stays host.
  const Psame = await connect('Psame', D2.uid, true);
  check(Psame.role === 'guest', 'a pad sharing the host device id is still a guest', Psame.role);
  await drop(Psame);

  // 6. Only pads left: the seat empties, and the next canvas takes it.
  await drop(D2);
  const P2 = await connect('P2', 'pad-2-' + stamp, true);
  check(P2.role === 'guest', 'a pad joining a pads-only room is a guest', P2.role);
  const D3 = await connect('D3', 'desk-3-' + stamp, false);
  check(D3.role === 'host', 'a canvas joining a pads-only room becomes host', D3.role);

  // 7. Turns: pads are in the rotation, the relay gates their paint like anyone's.
  S(D3, { type: 'turns', on: true, seconds: 60, mode: 'timer' });
  await wait(600);
  const order = D3.turn && D3.turn.order;
  check(!!order && order.includes(P1.id) && order.includes(P2.id) && order.includes(D3.id), 'pads are in the turn order', order);
  check(D3.turn && D3.turn.holder === D3.id, 'the host starts with the brush');
  const before = got(D3, 'splat').length;
  S(P2, { type: 'splat', data: { x: 0.2, y: 0.2, dabs: [[0.2, 0.2, 0, 0, 0.01]] } });
  await wait(400);
  check(got(D3, 'splat').length === before, 'a pad out of turn cannot paint (relay drops it)');
  // Pass until a pad holds it.
  for (let i = 0; i < 4 && !(D3.turn && [P1.id, P2.id].includes(D3.turn.holder)); i++) {
    S(D3, { type: 'turn-pass' });
    await wait(500);
  }
  const padHolder = [P1, P2].find(p => D3.turn && D3.turn.holder === p.id);
  check(!!padHolder, 'the brush reaches a pad', D3.turn && D3.turn.holder);
  if (padHolder) {
    const n0 = got(D3, 'splat').length;
    S(padHolder, { type: 'splat', data: { x: 0.3, y: 0.3, dabs: [[0.3, 0.3, 0, 0, 0.01]] } });
    await wait(400);
    check(got(D3, 'splat').length === n0 + 1, 'the pad holding the brush paints');
    S(padHolder, { type: 'turn-pass' });
    await wait(600);
    check(D3.turn && D3.turn.holder !== padHolder.id, 'the pad can pass the brush on', D3.turn && D3.turn.holder);
    // A pad cannot switch turns off: that is the host's.
    S(padHolder, { type: 'turns', on: false });
    await wait(400);
    check(D3.turn && D3.turn.on === true, 'a pad cannot stop turns');
  }
  S(D3, { type: 'turns', on: false });
  await wait(300);

  // 8. An ordinary client with no kind is unchanged: first in is host.
  const ROOM2 = ROOM + 'X';
  const plain = await new Promise((res, rej) => {
    const ws = new WebSocket(`${PROTO}://${HOST}/parties/fluid/${ROOM2}?uid=plain-${stamp}`);
    ws.on('message', (b) => { const d = JSON.parse(b.toString()); if (d.type === 'connected') res({ ws, role: d.role }); });
    ws.on('error', rej);
  });
  check(plain.role === 'host', 'a client without kind still hosts an empty room', plain.role);
  plain.ws.terminate();

  for (const c of [P1, P2, D3]) c.ws.terminate();
  await wait(300);
  log(`${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
