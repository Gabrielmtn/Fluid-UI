// Behaviour probe: the host's settings lock, and the identity the relay hands
// out with it. Answers: does anybody's lock reach anybody (since 2026-10-06
// nobody's does — a room shares its settings instead of locking them), does
// the relay stamp sender identity it can vouch for, and does a host handover
// leak the departing/promoted member's uid?
//
// Written 2026-08-26 alongside the fixes for all four, none of which had any
// coverage: settings-lock predates the take-turns hardening and rode the open
// relay path (the client only checked whether the RECEIVER was the host, never
// the sender), the default relay filled clientId in only when absent so a
// sender could name themselves anyone, and host-changed broadcast a uid — the
// lock re-admission key, and the credential the relay grants host on.
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || '127.0.0.1:1999';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(HOST);
const PROTO = LOCAL ? 'ws' : 'wss';
const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rnd = () => Array.from({ length: 6 }, () => AB[Math.floor(Math.random() * AB.length)]).join('');
const ROOM = process.env.MP_ROOM || (LOCAL ? 'LOCKAA' : rnd());
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;

function ok(label, cond, detail) {
  (cond ? pass++ : fail++);
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
}

function connect(room, uid) {
  return new Promise((res) => {
    const ws = new WebSocket(`${PROTO}://${HOST}/parties/fluid/${room}?uid=${uid}`);
    const c = { ws, uid, id: null, role: null, locks: [], hostChanges: [], splats: [] };
    ws.on('message', (b) => {
      const d = JSON.parse(b.toString());
      if (d.type === 'connected') { c.id = d.clientId; c.role = d.role; res(c); }
      if (d.type === 'settings-lock') c.locks.push(d);
      if (d.type === 'host-changed') c.hostChanges.push(d);
      if (d.type === 'splat') c.splats.push(d);
    });
    ws.on('error', () => {});
  });
}
const S = (c, o) => { try { c.ws.send(JSON.stringify(o)); } catch {} };

(async () => {
  console.log(`relay ${HOST}\n`);

  console.log('== a private room of 3 ==');
  const cs = [];
  for (let i = 0; i < 3; i++) cs.push(await connect(ROOM, `lock-uid-${i}`));
  await wait(300);
  const [host, g1, g2] = cs;
  ok('host is the first to connect', host.role === 'host', `roles ${cs.map(c => c.role).join(',')}`);

  console.log('\n== a GUEST tries to lock everyone\'s settings ==');
  S(g1, { type: 'settings-lock', locked: true, snapshot: { colors: ['forged'] } });
  await wait(300);
  ok('the host never sees it', host.locks.length === 0, `${host.locks.length} received`);
  ok('the other guest never sees it', g2.locks.length === 0, `${g2.locks.length} received`);

  console.log('\n== the HOST locks ==');
  S(host, { type: 'settings-lock', locked: true, snapshot: { colors: ['real'] } });
  await wait(300);
  ok('nobody is gated: the look lock is retired (2026-10-06)', g1.locks.length === 0 && g2.locks.length === 0,
    `g1 ${g1.locks.length}, g2 ${g2.locks.length}`);

  console.log('\n== a guest forges another member\'s identity on a paint message ==');
  S(g1, { type: 'splat', clientId: host.id, data: { x: 0.5, y: 0.5, dx: 0, dy: 0, color: [1, 0, 0] } });
  await wait(300);
  const seen = g2.splats[g2.splats.length - 1];
  ok('the relay restamps it with the real sender', !!seen && seen.clientId === g1.id,
    seen ? `claimed ${seen.clientId === host.id ? 'host' : 'sender'}` : 'nothing arrived');

  console.log('\n== the host leaves and the role transfers ==');
  host.ws.close();
  await wait(500);
  const hc = g1.hostChanges[g1.hostChanges.length - 1];
  ok('a host-changed is announced', !!hc);
  // The uids here are readable strings (lock-uid-N), so a leaked one is
  // unmistakable next to a PartyKit connection id.
  const uids = cs.map(c => c.uid);
  ok('it does NOT carry anyone\'s uid', !!hc && !uids.includes(hc.hostId), hc ? String(hc.hostId) : '');
  ok('it names a live connection id', !!hc && [g1.id, g2.id].includes(hc.hostId));

  console.log(`\n${pass} passed, ${fail} failed`);
  cs.forEach(c => { try { c.ws.close(); } catch {} });
  process.exit(fail ? 1 : 0);
})();
