// Does one device keep one clientId across a reconnect? Everything peer-keyed
// on the client (cursors, peer walls, peer brush stamps) is keyed by clientId.
const WebSocket = require('ws');
const HOST = '127.0.0.1:1999', ROOM = 'IDAAAA';
const wait = ms => new Promise(r => setTimeout(r, ms));
function once(uid) {
  return new Promise(res => {
    const ws = new WebSocket(`ws://${HOST}/parties/fluid/${ROOM}?uid=${uid}`);
    ws.on('message', b => { const d = JSON.parse(b.toString());
      if (d.type === 'connected') res({ id: d.clientId, ws }); });
    ws.on('error', () => {});
  });
}
(async () => {
  const keep = await once('stay-put');       // a witness so the room never empties
  const a = await once('same-device'); console.log('connect 1 clientId:', a.id);
  a.ws.close(); await wait(500);
  const b = await once('same-device'); console.log('connect 2 clientId:', b.id);
  console.log('same device, same id across a reconnect?', a.id === b.id ? 'YES' : 'NO — new peer identity every reconnect');
  [keep, a, b].forEach(x => { try { x.ws.close(); } catch {} });
  await wait(300); process.exit(0);
})();
