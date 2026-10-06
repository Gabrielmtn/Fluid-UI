// Behaviour probe: text over the wire (2026-09-15). Does the relay carry a
// painter's text lines and pours, and say who left (peer-left) so clients can
// drop what a departed peer brought? Since 2026-10-06 rooms have no turns:
// asking for them changes nothing, and nobody's text or walls are gated.
//   node scripts/test/mp/mp-text.js                  (partykit dev, :1999)
//   MP_HOST=127.0.0.1:8787 node scripts/test/mp/mp-text.js   (wrangler dev)
//   MP_HOST=swirltogether.com node scripts/test/mp/mp-text.js    (the live relay, wss)
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || process.argv[2] || '127.0.0.1:1999';
const ROOM = process.env.MP_ROOM || ('TX' + Math.random().toString(36).slice(2, 6).toUpperCase());
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

  // ── Turns are retired: asking changes nothing ──
  S(A, { type: 'turns', on: true, seconds: 60, mode: 'timer' });
  await wait(400);
  check(!(A.turn && A.turn.on) && !(B.turn && B.turn.on), 'asking for turns starts none (retired 2026-10-06)');
  let mA = mark(A);
  S(B, { type: 'text-line', data: Object.assign({}, LINE, { id: 7 }) });
  S(B, { type: 'text-pour', data: POUR });
  S(B, { type: 'text-line-remove', data: { id: 7 } });
  S(B, { type: 'collider-add', data: { lid: 3, seq: 0, total: 1, part: 'x', w: 1, h: 1 } });
  S(B, { type: 'collider-edit', data: { own: A.id, lid: 3, x: 0.1, y: 0.1, str: 0.4 } });
  S(B, { type: 'text-line', data: Object.assign({}, LINE, { own: A.id, id: 1, content: 'YOURS, EDITED' }) });
  await wait(400);
  check(got(A, 'text-line', mA).length === 2, 'B\'s text-lines (own, and an edit of A\'s) reach A');
  check(got(A, 'text-pour', mA).length === 1 && got(A, 'text-line-remove', mA).length === 1, 'and B\'s pour and remove');
  check(got(A, 'collider-add', mA).length === 1, 'and B\'s collider-add');
  const ce = got(A, 'collider-edit', mA)[0];
  check(!!ce && ce.clientId === B.id && ce.data.own === A.id, 'and B\'s edit of A\'s wall, stamped with the editor');

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
