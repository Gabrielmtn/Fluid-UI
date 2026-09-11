// Behaviour probe: "Call and return" (stroke mode) on the relay — the mode
// pins turnMs to 0 and puts no deadline on the wire, the idle BACKSTOP passes
// the brush when the holder sends no paint for STROKE_IDLE_MS (and a paint
// message pushes it out), turn-pass still works, and the settings-share
// messages removed on 2026-09-11 are inert. Takes ~2.5 minutes because it
// waits out the real backstop twice. IDLE_MS must match STROKE_IDLE_MS in
// party/index.ts.
//   node scripts/test/mp/mp-callreturn.js            (partykit dev, :1999)
//   MP_HOST=127.0.0.1:8787 node scripts/test/mp/mp-callreturn.js   (wrangler dev)
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || process.argv[2] || '127.0.0.1:1999';
const ROOM = process.env.MP_ROOM || 'CRPROB';
const IDLE_MS = Number(process.env.IDLE_MS || 45000);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
let fails = 0;
const check = (ok, msg) => { log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

function connect(uid) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://${HOST}/parties/fluid/${ROOM}?uid=${uid}`);
    const c = { uid, ws, id: null, hello: null, turn: null, got: {}, shareStates: 0 };
    ws.on('message', (b) => {
      const d = JSON.parse(b.toString());
      c.got[d.type] = (c.got[d.type] || 0) + 1;
      if (d.type === 'connected') { c.id = d.clientId; c.role = d.role; c.hello = d; res(c); }
      if (d.type === 'turn-state') c.turn = d;
      if (d.type === 'share-state') c.shareStates++;
    });
    ws.on('error', rej);
    ws.on('close', (code) => { c.closed = code; });
  });
}
const S = (c, o) => c.ws.send(JSON.stringify(o));
const holderOf = (c) => c.turn && c.turn.holder;

(async () => {
  const A = await connect('probe-A-' + Date.now());
  const B = await connect('probe-B-' + Date.now());
  log(`connected A=${A.id} (${A.role}) B=${B.id} (${B.role})`);
  check(A.role === 'host', 'A is host');
  check(!('shares' in A.hello), 'connected hello carries no shares field');

  // share messages must be inert now
  S(A, { type: 'share-open' });
  await wait(400);
  check(A.shareStates === 0 && B.shareStates === 0, 'share-open produces no share-state');

  // timer mode via slider seconds
  S(A, { type: 'turns', on: true, seconds: 45, mode: 'timer' });
  await wait(400);
  check(A.turn && A.turn.on && A.turn.mode === 'timer' && A.turn.turnMs === 45000, `timer mode turnMs=${A.turn && A.turn.turnMs}`);
  check(holderOf(A) === A.id, 'A holds first');
  S(A, { type: 'turns', on: false });
  await wait(300);

  // stroke mode = call and return
  S(A, { type: 'turns', on: true, seconds: 60, mode: 'stroke' });
  await wait(400);
  check(A.turn && A.turn.on && A.turn.mode === 'stroke' && A.turn.turnMs === 0, 'stroke mode: turnMs pinned to 0');
  check(A.turn.deadline === null, 'stroke mode: no deadline on the wire (no clock for the player)');
  check(holderOf(B) === A.id, 'B sees A holding');

  // A paints once at ~IDLE_MS*0.6, which must extend the idle backstop.
  const paintAt = Math.round(IDLE_MS * 0.6);
  log(`waiting ${paintAt}ms then A paints one dab (backstop should extend)`);
  await wait(paintAt);
  S(A, { type: 'splat', data: { x: 0.5, y: 0.5, dx: 0, dy: 0, color: [1, 0, 0], dabs: [[0.5, 0.5, 0, 0, 0.01]] } });
  await wait(IDLE_MS - paintAt + 2000); // now past the ORIGINAL deadline
  check(holderOf(A) === A.id, `A still holds ${((IDLE_MS + 2000) / 1000).toFixed(0)}s after turn start because they painted`);

  log(`waiting for the extended backstop (${IDLE_MS}ms after the dab)`);
  await wait(paintAt + 3000); // past dab-time + IDLE_MS
  check(holderOf(A) === B.id && holderOf(B) === B.id, 'backstop passed the brush to B after A went idle');

  // B never paints: pure AFK path
  log(`B never paints; expecting a pass back to A after ${IDLE_MS}ms`);
  await wait(IDLE_MS + 3000);
  check(holderOf(A) === A.id, 'AFK backstop passed the brush back to A');

  // explicit pass still works
  S(A, { type: 'turn-pass' });
  await wait(400);
  check(holderOf(A) === B.id, 'turn-pass still works');

  S(A, { type: 'turns', on: false });
  await wait(300);
  check(A.turn && !A.turn.on, 'turns off');

  A.ws.close(); B.ws.close();
  await wait(300);
  log(fails ? `DONE with ${fails} failure(s)` : 'DONE all checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('probe error', e); process.exit(2); });
