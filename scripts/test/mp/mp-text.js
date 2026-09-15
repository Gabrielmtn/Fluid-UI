// Behaviour probe: text over the wire (2026-09-15). Does the relay carry a
// painter's text lines and pours, gate them to the brush holder while turns
// run, count them as holder activity for the Call-and-return backstop, and
// say who left (peer-left) so clients can drop what a departed peer brought?
//   node scripts/test/mp/mp-text.js                  (partykit dev, :1999)
//   MP_HOST=127.0.0.1:8787 node scripts/test/mp/mp-text.js   (wrangler dev)
//   MP_HOST=swirltogether.com node scripts/test/mp/mp-text.js    (the live relay, wss)
// BACKSTOP=1 adds the slow check (~70 s): a text-line from the holder at
// 0.6 × STROKE_IDLE_MS keeps the brush past the original deadline.
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || process.argv[2] || '127.0.0.1:1999';
const ROOM = process.env.MP_ROOM || ('TX' + Math.random().toString(36).slice(2, 6).toUpperCase());
const IDLE_MS = Number(process.env.IDLE_MS || 45000);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
let fails = 0;
const check = (ok, msg) => { log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

// ws:// for a local relay, wss:// for a deployed one (the client's rule).
const PROTO = /^(localhost|127\.|10\.|192\.168\.)/.test(HOST) ? 'ws' : 'wss';

function connect(uid) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${PROTO}://${HOST}/parties/fluid/${ROOM}?uid=${uid}`);
    const c = { uid, ws, id: null, turn: null, msgs: [] };
    ws.on('message', (b) => {
      const d = JSON.parse(b.toString());
      c.msgs.push(d);
      if (d.type === 'connected') { c.id = d.clientId; c.role = d.role; res(c); }
      if (d.type === 'turn-state') c.turn = d;
    });
    ws.on('error', rej);
    ws.on('close', (code) => { c.closed = code; });
  });
}
const S = (c, o) => c.ws.send(JSON.stringify(o));
const got = (c, type, since) => c.msgs.filter((m, i) => i >= (since || 0) && m.type === type);
const mark = (c) => c.msgs.length;

const LINE = { id: 1, rev: 'r1', content: 'HELLO', fontSize: 64, color: '#00ffcc', cx: 0.5, cy: 0.5, cw: 800, ch: 600, col: 1, cm: 'deflect', cs: 1 };
const POUR = { look: { content: 'HI', fontSize: 48, color: '#fe0101' }, cw: 800, ch: 600, pours: [[0.4, 0.5, 1, 0], [0.42, 0.5, 0.5, 8]] };

(async () => {
  const A = await connect('text-A-' + Date.now());
  const B = await connect('text-B-' + Date.now());
  log(`room ${ROOM}: A=${A.id} (${A.role}) B=${B.id} (${B.role})`);
  await wait(300);

  // ── Free painting: everything relays, stamped with the sender ──
  let mB = mark(B);
  S(A, { type: 'text-line', data: LINE });
  S(A, { type: 'text-pour', data: POUR });
  S(A, { type: 'text-line-remove', data: { id: 1 } });
  await wait(400);
  const l = got(B, 'text-line', mB)[0], p = got(B, 'text-pour', mB)[0], r = got(B, 'text-line-remove', mB)[0];
  check(!!l && l.clientId === A.id && l.data.content === 'HELLO', 'free: text-line relays, stamped with the sender');
  check(!!p && p.clientId === A.id && p.data.pours.length === 2, 'free: text-pour relays with its pours');
  check(!!r && r.clientId === A.id && r.data.id === 1, 'free: text-line-remove relays');
  check(got(A, 'text-line', 0).length === 0, 'free: no echo back to the sender');

  // ── Take turns (A holds): B is a watcher ──
  S(A, { type: 'turns', on: true, seconds: 60, mode: 'timer' });
  await wait(400);
  check(A.turn && A.turn.on && A.turn.holder === A.id, 'turns on, A holds');
  let mA = mark(A);
  S(B, { type: 'text-line', data: Object.assign({}, LINE, { id: 7 }) });
  S(B, { type: 'text-pour', data: POUR });
  S(B, { type: 'text-line-remove', data: { id: 7 } });
  S(B, { type: 'collider-add', data: { lid: 3, seq: 0, total: 1, part: 'x', w: 1, h: 1 } });
  S(B, { type: 'collider-edit', data: { own: A.id, lid: 3, x: 0.1, y: 0.1, str: 0.4 } });
  S(B, { type: 'text-line', data: Object.assign({}, LINE, { own: A.id, id: 1, content: 'NOT YOURS' }) });
  await wait(400);
  check(got(A, 'text-line', mA).length === 0, 'turns: a watcher\'s text-line (own or an edit of A\'s) is dropped');
  check(got(A, 'text-pour', mA).length === 0, 'turns: a watcher\'s text-pour is dropped');
  check(got(A, 'text-line-remove', mA).length === 0, 'turns: a watcher\'s text-line-remove is dropped');
  check(got(A, 'collider-add', mA).length === 0, 'turns: a watcher\'s collider-add is dropped (unchanged)');
  check(got(A, 'collider-edit', mA).length === 0, 'turns: a watcher\'s collider-edit (an edit of A\'s wall) is dropped');
  mB = mark(B);
  S(A, { type: 'text-line', data: LINE });
  S(A, { type: 'text-pour', data: POUR });
  S(A, { type: 'collider-edit', data: { own: B.id, lid: 5, x: 0.2, y: 0.2, str: 0.6 } });
  await wait(400);
  check(got(B, 'text-line', mB).length === 1 && got(B, 'text-pour', mB).length === 1, 'turns: the holder\'s text relays');
  const ce = got(B, 'collider-edit', mB)[0];
  check(!!ce && ce.clientId === A.id && ce.data.own === B.id, 'turns: the holder\'s edit of B\'s wall reaches B, stamped with the editor');

  // Pass: now B's text relays and A's does not.
  S(A, { type: 'turn-pass' });
  await wait(400);
  check(A.turn.holder === B.id, 'pass → B holds');
  mA = mark(A); mB = mark(B);
  S(B, { type: 'text-line', data: Object.assign({}, LINE, { id: 7 }) });
  S(A, { type: 'text-line', data: Object.assign({}, LINE, { id: 2 }) });
  await wait(400);
  check(got(A, 'text-line', mA).length === 1, 'after the pass: B\'s text-line reaches A');
  check(got(B, 'text-line', mB).length === 0, 'after the pass: A\'s text-line is dropped');

  // ── Call and return: a text-line from the holder counts as activity ──
  S(A, { type: 'turns', on: false });
  await wait(300);
  if (process.env.BACKSTOP) {
    S(A, { type: 'turns', on: true, seconds: 60, mode: 'stroke' });
    await wait(400);
    check(A.turn && A.turn.mode === 'stroke' && A.turn.holder === A.id, 'call and return on, A holds');
    const at = Math.round(IDLE_MS * 0.6);
    log(`waiting ${at}ms, then A types a line (backstop should extend)`);
    await wait(at);
    S(A, { type: 'text-line', data: Object.assign({}, LINE, { id: 9, rev: 'r9' }) });
    await wait(IDLE_MS - at + 2000);
    check(A.turn.holder === A.id, `A still holds ${((IDLE_MS + 2000) / 1000).toFixed(0)} s in, because they typed`);
    S(A, { type: 'turns', on: false });
    await wait(300);
  } else {
    log('(BACKSTOP=1 for the slow call-and-return activity check)');
  }

  // ── Forgery: a client cannot author peer-left ──
  mB = mark(B);
  S(A, { type: 'peer-left', id: B.id });
  await wait(300);
  check(got(B, 'peer-left', mB).length === 0, 'a client-sent peer-left is dropped (server-authored)');

  // ── peer-left: who left, by connection id, never the uid ──
  mA = mark(A);
  B.ws.close();
  await wait(700);
  const pl = got(A, 'peer-left', mA)[0];
  check(!!pl && pl.id === B.id, 'B closes → A hears peer-left with B\'s connection id');
  check(!!pl && !('clientId' in pl), 'peer-left carries no clientId (the client\'s forgery test)');
  check(!!pl && JSON.stringify(pl).indexOf(B.uid) < 0, 'peer-left never carries the uid');

  A.ws.close();
  await wait(300);
  log(fails ? `DONE with ${fails} failure(s)` : 'DONE all checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('probe error', e); process.exit(2); });
