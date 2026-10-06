// The relay with turns and the look lock retired (2026-10-06), exercised
// in-process: party/index.ts compiled with esbuild and driven through a mock
// PartyKit room, so no relay server is needed. What it answers:
//
//   * a client from before the change (the Steam demo, a cached page) asking
//     to switch turns on or off, or to pass, is swallowed — by the host of a
//     private room as much as anyone: never relayed, no turn-state — and
//     nothing gates anyone's paint afterwards;
//   * a stranger's "shall we take turns?" invite is answered with a no (an
//     unanswered invite strands the old client on "Waiting for their answer");
//   * settings-lock is never relayed, even from the host;
//   * turn-look is never relayed;
//   * the relay stores no rotation, and a room stored with one (from before
//     the deploy) wakes without it;
//   * room-look, the new shared-settings message, rides the default relay:
//     stamped with the sender's id, to everyone else, not back to the sender;
//   * what stayed: a dirty restart rebuilds the room around the first one
//     back, and heartbeats keep the zombie-sweep alarm armed, which reaps a
//     silent pinger.
//
//   RELAY_DIR=<a copy of an older party/> runs the same checks against it.
//
//   node scripts/test/mp/relay-retired-turns.js        (~1 s)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..', '..');
let fails = 0, passes = 0;
function check(ok, msg, extra) {
    if (ok) passes++; else fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

async function build() {
    const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
    const out = path.join(os.tmpdir(), 'relay-retired-turns-' + process.pid + '.cjs');
    await esbuild.build({
        entryPoints: [path.join(process.env.RELAY_DIR || path.join(REPO, 'party'), 'index.ts')],
        bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent',
        external: ['partykit/server']
    });
    const mod = require(out);
    fs.unlinkSync(out);
    return mod.default || mod;
}

function mockRoom(id, stored) {
    const store = new Map(Object.entries(stored || {}));
    const conns = new Map();
    const alarm = { at: null };
    const room = {
        id,
        env: {},
        storage: {
            get: async (k) => store.get(k),
            put: async (k, v) => { if (typeof k === 'object') { for (const kk of Object.keys(k)) store.set(kk, k[kk]); } else store.set(k, v); },
            delete: async (k) => store.delete(k),
            deleteAll: async () => store.clear(),
            setAlarm: async (t) => { alarm.at = t; },
            deleteAlarm: async () => { alarm.at = null; },
            getAlarm: async () => alarm.at
        },
        context: { parties: { lobby: { get: () => ({ fetch: async () => ({ ok: true }) }) } } },
        getConnections: () => conns.values(),
        getConnection: (cid) => conns.get(cid),
        broadcast: (msg, without) => {
            for (const c of conns.values()) if (!(without || []).includes(c.id)) c.inbox.push(JSON.parse(msg));
        }
    };
    return { room, conns, store, alarm };
}

function mockConn(id) {
    return {
        id, state: null, inbox: [], closed: null,
        setState(s) { this.state = s; return s; },
        send(m) { this.inbox.push(JSON.parse(m)); },
        close(code, reason) { this.closed = { code, reason }; }
    };
}

async function join(server, mock, cid, uid, kind) {
    const c = mockConn(cid);
    mock.conns.set(cid, c);
    const url = 'https://relay.test/parties/fluid/' + mock.room.id + '?uid=' + uid + (kind ? '&kind=' + kind : '');
    await server.onConnect(c, { request: { url } });
    return c;
}
const say = (server, c, obj) => server.onMessage(JSON.stringify(obj), c);
const got = (c, type) => c.inbox.filter((m) => m.type === type);

(async () => {
    const Server = await build();

    // ── A private room: host A, guest B ───────────────────────────────
    {
        const mock = mockRoom('K7P2QX');
        const s = new Server(mock.room);
        await s.onStart();
        const a = await join(s, mock, 'conn-a', 'UIDA');
        const b = await join(s, mock, 'conn-b', 'UIDB');
        const hello = got(a, 'connected')[0] || {};
        check(hello.role === 'host', 'A is the host of the private room', hello.role);

        // Before anything else: with turns off, an old relay relayed the
        // host's lock to every guest.
        a.inbox.length = 0; b.inbox.length = 0;
        await say(s, a, { type: 'settings-lock', locked: true, snapshot: { sliders: { curl: 9 } } });
        check(got(b, 'settings-lock').length === 0, 'settings-lock from the host is not relayed');

        a.inbox.length = 0; b.inbox.length = 0;
        await say(s, a, { type: 'turns', on: true, seconds: 60, mode: 'timer' });
        await say(s, a, { type: 'turns', on: true, seconds: 0, mode: 'stroke' });
        const asked = { turnState: got(a, 'turn-state').length + got(b, 'turn-state').length, relayed: got(b, 'turns').length };
        check(asked.turnState === 0 && asked.relayed === 0, 'the host asking for Take turns or Call and return is swallowed: not relayed, no turn-state', asked);

        b.inbox.length = 0;
        await say(s, a, { type: 'splat', data: { x: 0.5, y: 0.5 } });
        await say(s, b, { type: 'stroke', data: { events: [] } });
        check(got(b, 'splat').length === 1 && got(a, 'stroke').length === 1, 'everyone\'s paint relays (nothing is gated)');

        a.inbox.length = 0; b.inbox.length = 0;
        await say(s, b, { type: 'turn-look', snapshot: { sliders: { curl: 9 } } });
        check(got(a, 'turn-look').length === 0, 'turn-look is not relayed');

        const look = { type: 'room-look', full: false, snapshot: { baseline: 7, sliders: { curl: 41 } }, clientId: 'forged-id' };
        await say(s, a, look);
        const rl = got(b, 'room-look');
        check(rl.length === 1 && rl[0].clientId === 'conn-a' && rl[0].snapshot.sliders.curl === 41, 'room-look reaches B, stamped with A\'s connection id (not the forged one)', rl[0]);
        check(got(a, 'room-look').length === 0, 'and is not echoed back to A');

        a.inbox.length = 0; b.inbox.length = 0;
        await say(s, a, { type: 'turns', on: false });
        await say(s, a, { type: 'turn-pass' });
        await say(s, b, { type: 'turn-pass' });
        const off = {
            turnState: got(a, 'turn-state').length + got(b, 'turn-state').length,
            relayed: got(a, 'turn-pass').length + got(b, 'turn-pass').length + got(b, 'turns').length
        };
        check(off.turnState === 0 && off.relayed === 0, 'turning turns off, or passing, is swallowed too', off);

        const turnKeys = [...mock.store.keys()].filter((k) => /^turn/.test(k));
        check(turnKeys.length === 0, 'the relay stores no rotation', turnKeys);

        // What stayed: the heartbeat reaper.
        mock.alarm.at = null;
        await say(s, b, { type: 'ping' });
        check(typeof mock.alarm.at === 'number' && mock.alarm.at > Date.now(), 'a heartbeat arms the zombie-sweep alarm', mock.alarm.at);
        b.state.lastSeen = Date.now() - 70000;     // B went silent (past REAP_SILENCE_MS)
        await s.onAlarm();
        check(!!b.closed && b.closed.code === 4003 && !a.closed, 'and the alarm reaps the pinger that went silent, nobody else', { a: a.closed, b: b.closed });
    }

    // ── A stranger pair ───────────────────────────────────────────────
    {
        const mock = mockRoom('pub-AB12CD');
        const s = new Server(mock.room);
        await s.onStart();
        const a = await join(s, mock, 'conn-p', 'UIDP');
        const b = await join(s, mock, 'conn-q', 'UIDQ');
        a.inbox.length = 0; b.inbox.length = 0;
        await say(s, a, { type: 'turn-invite', seconds: 60, mode: 'stroke' });
        const ans = got(a, 'turn-invite-result');
        check(ans.length === 1 && ans[0].accepted === false && !ans[0].reason, 'an old client\'s invite is answered with a plain no', ans[0]);
        check(got(b, 'turn-invite-offer').length === 0 && got(b, 'turn-invite').length === 0, 'and never reaches the partner');
        await say(s, b, { type: 'turn-invite-response', accept: true });
        check(got(a, 'turn-state').length === 0 && got(a, 'turn-invite-response').length === 0, 'an answer to it starts nothing and is not relayed');
    }

    // ── A room stored with turns on, from before the deploy ───────────
    // B, who was not holding the brush, is the first one back.
    {
        const mock = mockRoom('ZZ9QQQ', { turnsOn: true, turnQueue: ['UIDA', 'UIDB'], turnHolder: 'UIDA', turnMs: 60000, hostId: 'UIDA', members: ['UIDA', 'UIDB'] });
        const s = new Server(mock.room);
        await s.onStart();
        const b = await join(s, mock, 'conn-y', 'UIDB');
        const a = await join(s, mock, 'conn-x', 'UIDA');
        const roles = { b: (got(b, 'connected')[0] || {}).role, a: (got(a, 'connected')[0] || {}).role };
        check(roles.b === 'host' && roles.a === 'guest', 'a dirty restart rebuilds the room around the first one back', roles);
        check(got(a, 'turn-state').length === 0 && got(b, 'turn-state').length === 0, 'nobody is told turns are on');
        a.inbox.length = 0; b.inbox.length = 0;
        await say(s, b, { type: 'splat', data: {} });
        await say(s, a, { type: 'splat', data: {} });
        check(got(a, 'splat').length === 1 && got(b, 'splat').length === 1, 'and both paint, the old holder and the one who was waiting');
    }

    console.log(fails ? `DONE ${passes} passed, ${fails} FAILED` : `DONE all ${passes} checks passed`);
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
