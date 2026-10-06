import type * as Party from "partykit/server";
import {
  roomKind,
  capacityFor,
  uidFromRequestUrl,
  isPadRequest,
  internalSecret,
  MAX_MESSAGE_BYTES,
} from "./shared";

interface ConnState {
  uid: string;
  role: "host" | "guest";
  // A phone brush (?kind=pad): paints, but never hosts. See the election in
  // onConnect.
  pad?: boolean;
  // Liveness: stamped on every message. `pinger` marks a client that has
  // sent at least one heartbeat — only those may be reaped for silence
  // (old deployed clients never ping and must never be reaped).
  lastSeen?: number;
  pinger?: boolean;
}

// A pinger silent this long is presumed dead (client pings every ~20s, so
// this tolerates two missed beats plus jitter). Reaping drives the normal
// onClose cleanup: counts, host transfer, room reset.
const REAP_SILENCE_MS = 65_000;
const SWEEP_MIN_INTERVAL_MS = 10_000;

// Message types only this relay may author. A client-sent copy is a forgery,
// so the relay never forwards one (managed rooms; sys- rooms stay pure
// passthrough for the legacy sub-app). This relay no longer sends the turn-*
// ones (see RETIRED below), but a client from before 2026-10-06 still acts
// on them — a fake 'turn-state' would gate its painting — so a forged copy
// is dropped all the same.
const SERVER_AUTHORED = new Set([
  "connected",
  "client-count",
  "lock-state",
  "host-changed",
  "turn-state",
  "turn-invite-offer",
  "turn-invite-result",
  "turn-invite-sent",
  "peer-left",
]);

// RETIRED 2026-10-06: take turns, call and return, and the host's look lock
// ("everyone uses my look"). A room is now a set of people sharing one set
// of settings — clients send 'room-look' changes to each other through the
// default relay, so the relay needed nothing new for it. What it needed was
// to STOP: a client from before the change (the Steam demo, a cached page)
// can still ask for turns, and a rotation would silently drop every stroke
// from clients that no longer know turns exist. So the rotation is gone, and
// these requests from old clients are swallowed: never relayed, never
// answered with a turn-state. One exception: a stranger's "shall we take
// turns?" invite gets a plain no (see onMessage), because an unanswered one
// strands the old client on "Waiting for their answer…". Nothing waits on
// the rest: an old client only changes its turn state on a 'turn-state',
// and never gets one now.
const RETIRED = new Set([
  "turns",
  "turn-invite",
  "turn-invite-response",
  "turn-pass",
  "turn-look",
  "settings-lock",
]);

// The play-room party. One instance per room id (/parties/fluid/<id>).
//
// Behavior depends on the id prefix (see shared.roomKind):
//   - "public"  (pub-XXXXXX): matchmade 1:1 room — capacity 2, host + lock + allowlist.
//   - "private" (bare code) : invite room — capacity 8, host + lock + allowlist.
//   - "system"  (sys-...)   : pure passthrough relay, exactly like the original
//                              broadcast server (no capacity, host, or lock). Keeps
//                              the sub-app and any legacy bare-code client working.
export default class FluidPartyServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  // Getters (not field initializers) so they read this.room AFTER it is assigned.
  get kind() {
    return roomKind(this.room.id);
  }
  get capacity() {
    return capacityFor(this.room.id);
  }
  get managed() {
    return this.kind !== "system";
  }

  // Managed-room state (mirrored in room.storage; rehydrated in onStart).
  // A room stored before 2026-10-06 may still hold the retired rotation's
  // keys (turnsOn, turnQueue, ...): nothing reads them, and the deleteAll
  // when the room empties clears them.
  locked = false;
  hostId: string | null = null;
  members: Set<string> = new Set(); // uids ever admitted = the lock allowlist
  lastSweep = 0; // zombie-reap rate limit (in-memory; a wake just sweeps again)
  lastAlarmArm = 0;
  loaded = false;
  ready: Promise<void> | null = null;

  async onStart() {
    if (!this.managed) {
      this.loaded = true;
      return;
    }
    this.locked = (await this.room.storage.get<boolean>("locked")) || false;
    this.hostId = (await this.room.storage.get<string>("hostId")) || null;
    this.members = new Set((await this.room.storage.get<string[]>("members")) || []);
    this.loaded = true;
  }

  // Rehydrate from storage exactly once, sharing a single in-flight promise so
  // concurrent handlers (onConnect/onMessage/onClose) never run on stale state
  // after a hibernation/eviction wake, and never double-launch onStart.
  async ensureLoaded() {
    if (this.loaded) return;
    if (!this.ready) this.ready = this.onStart();
    await this.ready;
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // ── System / legacy rooms: pure passthrough relay (original behavior) ──
    if (!this.managed) {
      conn.send(
        JSON.stringify({
          type: "connected",
          clientId: conn.id,
          timestamp: Date.now(),
          totalClients: this.count(),
          roomKind: this.kind,
        })
      );
      this.broadcastClientCount();
      return;
    }

    await this.ensureLoaded();

    const uid = uidFromRequestUrl(ctx.request.url) || conn.id;
    const pad = isPadRequest(ctx.request.url);

    // Reap zombies BEFORE the capacity check: a dead-but-unreaped peer must
    // not make a cap-2 stranger room refuse a live newcomer as "full".
    this.lastSweep = 0;
    const reaped = await this.maybeSweep();

    // Capacity. Count "others + self" so it is correct whether or not
    // getConnections() already includes the just-accepted connection.
    const others = [...this.room.getConnections()]
      .filter((c) => c.id !== conn.id && !reaped.has(c.id)).length;
    if (others + 1 > this.capacity) {
      conn.close(4002, "full");
      return;
    }

    // Lock: a stranger (uid never previously admitted) is refused while locked.
    if (this.locked && !this.members.has(uid)) {
      conn.close(4001, "locked");
      return;
    }

    // Dirty-restart self-heal: a cleanly emptied room always resets this state
    // in onClose, so arriving FIRST in a room whose persisted state still names
    // a host means the previous instance died without closes
    // (redeploy/eviction). The named host may never return — rebuild around
    // this member instead of pinning the room on a ghost.
    if (others === 0 && this.hostId && this.hostId !== uid) this.hostId = pad ? null : uid;

    // Host election — synchronous compare-and-set on in-memory state (no await
    // between read and write, so two simultaneous first-joiners can't both win).
    // A phone brush never takes the seat: it has no canvas and no room
    // controls, and a computer that reloads while its phone stays connected
    // must get its room back, not find the phone holding it. So a pad leaves
    // an empty seat empty, and the next canvas to arrive takes it.
    if (!this.hostId && !pad) this.hostId = uid;
    const role: "host" | "guest" = !pad && uid === this.hostId ? "host" : "guest";
    conn.setState({ uid, role, pad } as ConnState);

    this.members.add(uid);
    // Persist BEFORE telling the client it's in: a member must be durably on the
    // allowlist before they rely on being re-admittable to a (future) locked room.
    await this.persist();

    conn.send(
      JSON.stringify({
        type: "connected",
        clientId: conn.id,
        timestamp: Date.now(),
        totalClients: this.count(),
        role,
        locked: this.locked,
        capacity: this.capacity,
        roomKind: this.kind,
      })
    );
    this.broadcastClientCount();
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (typeof message === "string" && new TextEncoder().encode(message).length > MAX_MESSAGE_BYTES) return;
    let data: any;
    try {
      data = JSON.parse(message as string);
    } catch {
      return;
    }
    if (!data) return;

    // Liveness: every message refreshes the sender's lastSeen; the first
    // heartbeat marks it reap-eligible (old clients never ping → never reaped).
    if (this.managed) {
      const prev = sender.state as ConnState | null;
      if (prev) {
        sender.setState({
          ...prev,
          lastSeen: Date.now(),
          pinger: prev.pinger || data.type === "ping",
        } as ConnState);
      }
      if (data.type === "ping") {
        await this.maybeSweep();
        // Keep the sweep alarm armed while heartbeats flow, so a zombie is
        // reaped even if the room goes otherwise silent.
        const now = Date.now();
        if (now - this.lastAlarmArm > 25_000) {
          this.lastAlarmArm = now;
          await this.syncAlarm();
        }
        return; // heartbeats are point-to-point — never relayed
      }
    } else if (data.type === "ping") {
      return; // sys- rooms: swallow rather than spam the passthrough relay
    }

    // Never relay a client-sent copy of a server-authored type (forgery).
    if (this.managed && SERVER_AUTHORED.has(data.type)) return;

    // ── Host-only reversible lock toggle (managed rooms only) ──
    if (data.type === "lock" && this.managed) {
      await this.ensureLoaded(); // host check must read durable state after any wake
      const st = sender.state as ConnState | null;
      const isHost = !!st && (st.role === "host" || st.uid === this.hostId);
      if (!isHost) return;
      this.locked = !!data.locked;
      await this.persist(); // commit the lock before announcing it
      this.room.broadcast(
        JSON.stringify({ type: "lock-state", locked: this.locked, timestamp: Date.now() })
      );
      return;
    }

    // ── Retired requests from old clients (see RETIRED) ──
    if (this.managed && RETIRED.has(data.type)) {
      // A stranger's invite always gets an answer — a silent drop strands the
      // old client on "Waiting for their answer…" — and this one reads "They
      // would rather keep painting together" there.
      if (data.type === "turn-invite" && this.kind === "public") {
        sender.send(JSON.stringify({ type: "turn-invite-result", accepted: false, timestamp: Date.now() }));
      }
      return;
    }

    // ── Default relay: stamp sender id/timestamp + broadcast to everyone else ──
    // clientId is FORCED, not filled in when absent. Trusting a sender-supplied
    // one made peer identity a free-text field: clients key real state on it —
    // collider-remove on `clientId|lid` (so a peer could delete another peer's
    // wall from every canvas), stroke-chunk reassembly on `clientId|sid`
    // first-chunk-wins (so a forged chunk could poison someone else's in-flight
    // stroke), plus remote cursors and gap-fill positions. The one routed type
    // (since removed) force-stamped for exactly this reason; the rest of the
    // types simply never got the same treatment.
    data.clientId = sender.id;
    if (!data.timestamp) data.timestamp = Date.now();
    this.room.broadcast(JSON.stringify(data), [sender.id]);
  }

  async onClose(conn: Party.Connection) {
    this.broadcastClientCount();
    if (!this.managed) return;
    // Say WHO left. Clients key everything a peer brought — walls, text
    // lines, cursors — on the connection id, and until this nothing ever
    // told them an id was gone: a departed painter's walls stayed in every
    // simulation, and a reconnect (new connection id) republished them
    // beside the old copies. Connection ids only, never the uid (see
    // host-changed below for why).
    this.room.broadcast(
      JSON.stringify({ type: "peer-left", id: conn.id, timestamp: Date.now() }),
      [conn.id]
    );
    await this.ensureLoaded(); // host-transfer / reset must act on durable state

    // Count remaining EXCLUDING the closing connection (robust to whether
    // getConnections() still enumerates it at onClose time).
    const remaining = [...this.room.getConnections()].filter((c) => c.id !== conn.id);

    if (remaining.length === 0) {
      // Room emptied: reset state so a future reuse of the id starts fresh, and
      // (for public rooms) clear any stale matchmaking waiter pointer.
      this.locked = false;
      this.hostId = null;
      this.members.clear();
      await this.room.storage.deleteAll();
      try {
        await this.room.storage.deleteAlarm();
      } catch {
        /* no alarm scheduled */
      }
      if (this.kind === "public") this.notifyLobbyVacate();
      return;
    }

    const st = conn.state as ConnState | null;

    // Host left but others remain → transfer host so lock/unlock stays usable.
    // Never to a phone brush (see the election in onConnect): with only pads
    // left the seat stays empty until a canvas joins.
    if (st && st.uid === this.hostId) {
      const next = remaining.find((c) => {
        const cs = c.state as ConnState | null;
        return !!cs && !cs.pad;
      });
      const nextState = next ? (next.state as ConnState | null) : null;
      this.hostId = nextState ? nextState.uid : null;
      await this.persist();
      if (this.hostId) {
        // Announce the new host by CONNECTION id, never by uid. A uid is the
        // lock re-admission key (see the allowlist check in onConnect), and
        // while it is also the current hostId, a connection presenting it is
        // handed role "host" outright — so broadcasting it room-wide handed
        // every listener both a way past a locked room and the credential for
        // the lock. Clients compare this against their own connection id from
        // "connected".
        const hostConnId = this.clientIdForUid(this.hostId, conn.id);
        if (hostConnId) {
          this.room.broadcast(
            JSON.stringify({ type: "host-changed", hostId: hostConnId, timestamp: Date.now() })
          );
        }
      }
    }
  }

  onError(conn: Party.Connection, err: Error) {
    console.error(`Error for ${conn.id}:`, err);
  }

  // Reap connections that heartbeat once and then went silent — a peer that
  // died without a close frame (sleep, crash, dropped network) otherwise
  // haunts the room for minutes on the platform's TCP timing: it holds the
  // cap-2 stranger slot and keeps the survivor's count at 2 ("still
  // connected"). close() drives all onClose cleanup.
  async maybeSweep(): Promise<Set<string>> {
    const reaped = new Set<string>();
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_MIN_INTERVAL_MS) return reaped;
    this.lastSweep = now;
    for (const c of this.room.getConnections()) {
      const cs = c.state as ConnState | null;
      if (cs && cs.pinger && cs.lastSeen && now - cs.lastSeen > REAP_SILENCE_MS) {
        reaped.add(c.id);
        try {
          c.close(4003, "timeout");
        } catch {
          /* already gone */
        }
      }
    }
    return reaped;
  }

  // The alarm is the guaranteed zombie sweep (see syncAlarm): it runs even
  // when the room has gone otherwise silent.
  async onAlarm() {
    await this.ensureLoaded();
    this.lastSweep = 0; // the alarm is the guaranteed sweep — never skip it
    await this.maybeSweep();
    await this.syncAlarm();
  }

  // ── helpers ──
  count() {
    return [...this.room.getConnections()].length;
  }

  broadcastClientCount() {
    this.room.broadcast(
      JSON.stringify({ type: "client-count", count: this.count(), timestamp: Date.now() })
    );
  }

  // Live connection id for a uid (optionally ignoring a closing conn). When a
  // device holds several connections (second tab, or a zombie socket briefly
  // outliving a reconnect), prefer the NEWEST — connections enumerate in
  // insertion order, and a zombie is always older than its replacement.
  clientIdForUid(uid: string, excludeId?: string): string | null {
    let found: string | null = null;
    for (const c of this.room.getConnections()) {
      if (excludeId && c.id === excludeId) continue;
      const cs = c.state as ConnState | null;
      if (cs && cs.uid === uid) found = c.id;
    }
    return found;
  }

  // Keep the storage alarm set for the next zombie sweep while any
  // heartbeat-capable connection exists — there is no other alarm, and a
  // silent zombie would otherwise never be reaped in a quiet room.
  async syncAlarm() {
    try {
      let hasPinger = false;
      for (const c of this.room.getConnections()) {
        const cs = c.state as ConnState | null;
        if (cs && cs.pinger) {
          hasPinger = true;
          break;
        }
      }
      if (hasPinger) {
        await this.room.storage.setAlarm(Date.now() + 30_000);
      } else {
        await this.room.storage.deleteAlarm();
      }
    } catch {
      /* best-effort — a missed alarm only delays the sweep */
    }
  }

  persist() {
    return Promise.all([
      this.room.storage.put("locked", this.locked),
      this.hostId
        ? this.room.storage.put("hostId", this.hostId)
        : this.room.storage.delete("hostId"),
      this.room.storage.put("members", [...this.members]),
    ]);
  }

  notifyLobbyVacate() {
    try {
      const path =
        "/vacate?s=" +
        encodeURIComponent(internalSecret(this.room.env)) +
        "&room=" +
        encodeURIComponent(this.room.id);
      void this.room.context.parties.lobby.get("main").fetch(path);
    } catch {
      /* best-effort */
    }
  }
}

FluidPartyServer satisfies Party.Worker;
