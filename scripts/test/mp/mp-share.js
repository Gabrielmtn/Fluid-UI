// Behaviour probe: settings shares — the opt-in circles inside a room.
// Answers: does a circle form, does a look delta reach ONLY that circle, does
// joining a second one leave the first, does a circle dissolve when its last
// member goes, and do Take Turns / forgery / stranger pairs behave?
const WebSocket = require('ws');
const HOST = process.env.MP_HOST || '127.0.0.1:1999';
const ROOM = process.env.MP_ROOM || 'SHAREA';
const PAIR = process.env.MP_PAIR || 'pub-SHRPR';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;

function ok(label, cond, detail) {
  (cond ? pass++ : fail++);
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
}

function connect(room, uid) {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://${HOST}/parties/fluid/${room}?uid=${uid}`);
    const c = { ws, uid, id: null, role: null, shares: null, looks: [], got: {} };
    ws.on('message', (b) => {
      const d = JSON.parse(b.toString());
      c.got[d.type] = (c.got[d.type] || 0) + 1;
      if (d.type === 'connected') { c.id = d.clientId; c.role = d.role; res(c); }
      if (d.type === 'share-state') c.shares = d.groups;
      if (d.type === 'share-look') c.looks.push(d);
    });
    ws.on('error', () => {});
  });
}
const S = (c, o) => { try { c.ws.send(JSON.stringify(o)); } catch {} };
// The circle a client believes it is in, as a set of short labels.
const mine = (c) => {
  const g = (c.shares || []).find(g => g.members.includes(c.id));
  return g || null;
};
const label = (cs, id) => { const c = cs.find(c => c.id === id); return c ? c.uid : id; };
const names = (cs, g) => g ? g.members.map(m => label(cs, m)).join('+') : '(none)';

(async () => {
  console.log(`relay ${HOST}\n`);

  // ── Private room, 4 people ─────────────────────────────────────────
  console.log('== a private room of 4 ==');
  const cs = [];
  for (let i = 0; i < 4; i++) cs.push(await connect(ROOM, `sh${i}`));
  await wait(300);
  ok('host is the first to connect', cs[0].role === 'host', `roles ${cs.map(c => c.role).join(',')}`);

  console.log('\n== a NON-host opens a share ==');
  S(cs[1], { type: 'share-open' });
  await wait(300);
  ok('everyone is told about it', cs.every(c => (c.shares || []).length === 1),
    cs.map(c => (c.shares || []).length).join(','));
  ok('it holds only its opener', names(cs, mine(cs[1])) === 'sh1', names(cs, mine(cs[1])));
  ok('nobody else is in it', !mine(cs[0]) && !mine(cs[2]) && !mine(cs[3]));
  const gid = cs[1].shares[0].id;

  console.log('\n== someone joins it ==');
  S(cs[2], { type: 'share-join', group: gid });
  await wait(300);
  ok('the circle is now two', names(cs, mine(cs[2])) === 'sh1+sh2', names(cs, mine(cs[2])));
  ok('the opener anchors it', cs[2].shares[0].members[0] === cs[1].id);

  console.log('\n== a look delta is routed, not broadcast ==');
  const before = cs.map(c => c.looks.length);
  S(cs[1], { type: 'share-look', snapshot: { sliders: { curl: 30 } } });
  await wait(300);
  ok('the other member gets it', cs[2].looks.length === before[2] + 1);
  ok('the sender does not echo', cs[1].looks.length === before[1]);
  ok('the rest of the room never sees it',
    cs[0].looks.length === before[0] && cs[3].looks.length === before[3]);
  ok('it is stamped with the sender', cs[2].looks.slice(-1)[0].clientId === cs[1].id);

  console.log('\n== someone outside any circle tries to push a look ==');
  const b2 = cs.map(c => c.looks.length);
  S(cs[0], { type: 'share-look', snapshot: { sliders: { curl: 99 } } });
  await wait(300);
  ok('it goes nowhere', cs.every((c, i) => c.looks.length === b2[i]));

  console.log('\n== a second circle opens, and a member switches to it ==');
  S(cs[3], { type: 'share-open' });
  await wait(250);
  ok('two circles coexist', (cs[0].shares || []).length === 2, `${(cs[0].shares || []).length}`);
  const gid2 = cs[3].shares.find(g => g.members.includes(cs[3].id)).id;
  S(cs[2], { type: 'share-join', group: gid2 });
  await wait(300);
  ok('joining the second leaves the first', names(cs, mine(cs[2])) === 'sh3+sh2', names(cs, mine(cs[2])));
  ok('the first circle keeps its opener',
    names(cs, (cs[0].shares || []).find(g => g.id === gid)) === 'sh1');

  console.log('\n== leaving ==');
  S(cs[2], { type: 'share-leave' });
  await wait(300);
  ok('the leaver is in nothing', !mine(cs[2]));
  ok('both circles survive with one each', (cs[0].shares || []).length === 2,
    (cs[0].shares || []).map(g => names(cs, g)).join(' | '));
  const quiet = cs[0].got['share-state'];
  S(cs[2], { type: 'share-leave' }); // nothing to leave
  await wait(250);
  ok('leaving nothing announces nothing', cs[0].got['share-state'] === quiet);

  console.log('\n== the last member of a circle disconnects ==');
  cs[3].ws.close();
  await wait(500);
  ok('the circle dissolves', (cs[0].shares || []).length === 1,
    (cs[0].shares || []).map(g => names(cs, g)).join(' | '));
  ok('the other circle is untouched', names(cs, (cs[0].shares || [])[0]) === 'sh1');

  console.log('\n== a forged roster from a peer ==');
  const seen = cs[0].got['share-state'];
  S(cs[2], { type: 'share-state', groups: [{ id: 'fake', members: [cs[0].id, cs[2].id] }] });
  await wait(300);
  ok('never relayed', cs[0].got['share-state'] === seen);

  console.log('\n== Take Turns takes the room over ==');
  S(cs[1], { type: 'share-look', snapshot: { sliders: { curl: 1 } } }); // c1 alone: no mates
  S(cs[2], { type: 'share-join', group: gid });
  await wait(250);
  ok('c2 is back in c1\'s circle', names(cs, mine(cs[2])) === 'sh1+sh2', names(cs, mine(cs[2])));
  S(cs[0], { type: 'turns', on: true, seconds: 60, mode: 'timer' });
  await wait(400);
  ok('turning turns ON announces the dissolved circles', (cs[2].shares || []).length === 0,
    JSON.stringify(cs[2].shares));
  const b3 = cs.map(c => c.looks.length);
  S(cs[1], { type: 'share-look', snapshot: { sliders: { curl: 7 } } });
  S(cs[2], { type: 'share-open' });
  await wait(350);
  ok('share looks are refused while turns run', cs[2].looks.length === b3[2]);
  S(cs[0], { type: 'turns', on: false });
  await wait(350);
  ok('and they are still gone when turns end', (cs[0].shares || []).length === 0,
    JSON.stringify(cs[0].shares));
  S(cs[1], { type: 'share-open' });
  await wait(300);
  ok('sharing works again afterwards', (cs[0].shares || []).length === 1,
    (cs[0].shares || []).map(g => names(cs, g)).join(' | '));

  cs.forEach(c => { try { c.ws.close(); } catch {} });

  // ── Stranger pair: no host privilege anywhere in this feature ───────
  console.log('\n== a stranger pair (cap 2, no real host) ==');
  const ps = [await connect(PAIR, 'pr0'), await connect(PAIR, 'pr1')];
  await wait(300);
  S(ps[1], { type: 'share-open' }); // the GUEST opens it
  await wait(300);
  ok('the guest can open a share', (ps[0].shares || []).length === 1,
    (ps[0].shares || []).map(g => names(ps, g)).join(' | '));
  const pgid = ps[1].shares[0].id;
  S(ps[0], { type: 'share-join', group: pgid });
  await wait(300);
  ok('the host joins it', names(ps, mine(ps[0])) === 'pr1+pr0', names(ps, mine(ps[0])));
  const pb = ps[0].looks.length;
  S(ps[1], { type: 'share-look', snapshot: { sliders: { density: 0.5 } } });
  await wait(300);
  ok('looks flow guest → host', ps[0].looks.length === pb + 1);
  const pb2 = ps[1].looks.length;
  S(ps[0], { type: 'share-look', snapshot: { sliders: { density: 0.9 } } });
  await wait(300);
  ok('and host → guest (it is two-way)', ps[1].looks.length === pb2 + 1);
  ps[0].ws.close();
  await wait(500);
  ok('a partner leaving empties the circle for the survivor',
    !(ps[1].shares || []).some(g => g.members.length > 1),
    JSON.stringify(ps[1].shares));
  ps.forEach(c => { try { c.ws.close(); } catch {} });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
