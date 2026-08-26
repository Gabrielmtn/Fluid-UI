// Does the "N artists here" count stay truthful as people arrive and leave?
const WebSocket = require('ws');
const HOST = '127.0.0.1:1999', ROOM = process.env.MP_ROOM || 'CNTAAA';
const wait = ms => new Promise(r => setTimeout(r, ms));
const cs = [];
function connect(i) {
  return new Promise(res => {
    const ws = new WebSocket(`ws://${HOST}/parties/fluid/${ROOM}?uid=cnt-${i}`);
    const c = { i, ws, counts: [] }; cs[i] = c;
    ws.on('message', b => { const d = JSON.parse(b.toString());
      if (d.type === 'connected') res(c);
      if (d.type === 'client-count') c.counts.push(d.count); });
    ws.on('error', () => {});
  });
}
(async () => {
  for (let i = 0; i < 8; i++) { await connect(i); await wait(120); }
  await wait(400);
  console.log('after 8 joins, c1 last saw count =', cs[1].counts.at(-1), '(true = 8)');
  cs[7].ws.close(); await wait(600);
  console.log('after 1 leave,  c1 last saw count =', cs[1].counts.at(-1), '(true = 7)');
  cs[6].ws.close(); cs[5].ws.close(); await wait(800);
  console.log('after 3 leaves, c1 last saw count =', cs[1].counts.at(-1), '(true = 5)');
  console.log('c1 full count history:', cs[1].counts.join(','));
  cs.forEach(c => { try { c.ws.close(); } catch {} });
  await wait(300); process.exit(0);
})();
