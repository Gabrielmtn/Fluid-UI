// Behaviour probe: can a waiter whose keep-alives are LATE still be found?
// A waiter keeps its lobby "pin" socket open; the client re-announces every
// 40-50 s to refresh the lobby's waiting pointer, whose TTL is WAIT_TTL_MS.
// A backgrounded tab's throttled timers can slip a keep-alive past a short
// TTL, and then the next seeker mints a fresh room and the two never meet —
// the "we both pressed it and nothing happened" report. This probe holds a
// pin open, sends NO keep-alive for LATE_MS, then sends a second seeker and
// expects it to be paired into the waiter's room. It then closes the pin and
// checks a third seeker gets a fresh room (the pin's close clears the slot).
//   MP_HOST=127.0.0.1:8787 LATE_MS=75000 node scripts/test/mp/mp-lobby-ttl.js
// LATE_MS must sit between the keep-alive cadence and WAIT_TTL_MS to prove
// the margin; the default 75 s fails against the old 60 s TTL and passes
// against the 150 s one.
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || process.argv[2] || '127.0.0.1:1999';
const LATE_MS = Number(process.env.LATE_MS || 75000);
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

function seek(uid) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://${HOST}/parties/lobby/main?uid=${uid}`);
    const c = { uid, ws, matched: null };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'matchmake', uid })));
    ws.on('message', (b) => { const d = JSON.parse(b.toString()); if (d.type === 'matched') { c.matched = d; res(c); } });
    ws.on('error', rej);
  });
}

(async () => {
  const A = await seek('ttl-A-' + Date.now());
  check(A.matched.waiting === true, `A waits in ${A.matched.roomId} (pin kept open, no keep-alives)`);
  // A joins its room so the pub room exists and would vacate the lobby if A left.
  const roomA = new WebSocket(`ws://${HOST}/parties/fluid/${A.matched.roomId}?uid=${A.uid}`);
  await new Promise(r => roomA.on('open', r));
  log(`holding ${LATE_MS} ms with no keep-alive…`);
  await wait(LATE_MS);
  const B = await seek('ttl-B-' + Date.now());
  check(B.matched.waiting === false && B.matched.roomId === A.matched.roomId,
    `B paired into A's room after ${LATE_MS / 1000}s of silence (got ${B.matched.roomId}, waiting=${B.matched.waiting})`);
  B.ws.close();
  // A leaves: pin closes, room vacates → the slot must clear at once.
  A.ws.close(); roomA.close();
  await wait(800);
  const C = await seek('ttl-C-' + Date.now());
  check(C.matched.waiting === true && C.matched.roomId !== A.matched.roomId,
    `C gets a fresh room after A's pin closed (got ${C.matched.roomId}, waiting=${C.matched.waiting})`);
  C.ws.close();
  await wait(300);
  log(fails ? `DONE with ${fails} failure(s)` : 'DONE all checks passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('probe error', e); process.exit(2); });
