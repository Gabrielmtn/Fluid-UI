import type * as Party from "partykit/server";
import {
  roomKind,
  capacityFor,
  uidFromRequestUrl,
  internalSecret,
  MAX_MESSAGE_BYTES,
} from "./shared";

interface ConnState {
  uid: string;
  role: "host" | "guest";
}

// Take-turns mode: message types only the current painter may relay. Cursor and
// pointer-up stay open so spectators can still point at things while watching.
const TURN_HOLDER_ONLY = new Set([
  "splat",
  "stroke",
  "stroke-chunk",
  "clear",
  "preset",
  "turn-look",
]);

// Message types only this relay may author. A client-sent copy is a forgery —
// e.g. a fake 'turn-state' would gate every other member's painting and
// settings — so the relay never forwards one (managed rooms; sys- rooms stay
// pure passthrough for the legacy sub-app).
const SERVER_AUTHORED = new Set([
  "connected",
  "client-count",
  "lock-state",
  "host-changed",
  "turn-state",
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
  locked = false;
  hostId: string | null = null;
  members: Set<string> = new Set(); // uids ever admitted = the lock allowlist
  // Take-turns mode: one member paints at a time, everyone else watches.
  // Keyed by uid (stable across reconnects); broadcast to clients as connection
  // ids so members' uids — the lock re-admission key — never reach other clients.
  turnsOn = false;
  turnQueue: string[] = []; // uids of connected members, rotation order
  turnHolder: string | null = null; // uid of the current painter
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
    this.turnsOn = (await this.room.storage.get<boolean>("turnsOn")) || false;
    this.turnQueue = (await this.room.storage.get<string[]>("turnQueue")) || [];
    this.turnHolder = (await this.room.storage.get<string>("turnHolder")) || null;
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

    // Capacity. Count "others + self" so it is correct whether or not
    // getConnections() already includes the just-accepted connection.
    const others = [...this.room.getConnections()].filter((c) => c.id !== conn.id).length;
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
    // a host or a running rotation means the previous instance died without
    // closes (redeploy/eviction). The named members may never return — rebuild
    // around this member instead of pinning the room on ghosts.
    if (others === 0) {
      if (this.hostId && this.hostId !== uid) this.hostId = uid;
      if (this.turnsOn) {
        this.turnQueue = [uid];
        this.turnHolder = uid;
      }
    }

    // Host election — synchronous compare-and-set on in-memory state (no await
    // between read and write, so two simultaneous first-joiners can't both win).
    if (!this.hostId) this.hostId = uid;
    const role: "host" | "guest" = uid === this.hostId ? "host" : "guest";
    conn.setState({ uid, role } as ConnState);

    this.members.add(uid);
    // Joining while turns are running: append to the rotation (no holder change).
    if (this.turnsOn && !this.turnQueue.includes(uid)) this.turnQueue.push(uid);
    if (this.turnsOn && !this.turnHolder) this.turnHolder = uid;
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
    // Everyone (including the joiner, and the holder whose conn id may have
    // changed across a reconnect) re-syncs the rotation.
    if (this.turnsOn) this.broadcastTurnState();
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

    // ── Host-only take-turns toggle ──
    if (data.type === "turns" && this.managed) {
      await this.ensureLoaded();
      const st = sender.state as ConnState | null;
      const isHost = !!st && (st.role === "host" || st.uid === this.hostId);
      if (!isHost) return;
      this.turnsOn = !!data.on;
      if (this.turnsOn) {
        // Rotation = the enabling host first, then everyone else connected.
        const uids: string[] = st ? [st.uid] : [];
        for (const c of this.room.getConnections()) {
          const cs = c.state as ConnState | null;
          if (cs && !uids.includes(cs.uid)) uids.push(cs.uid);
        }
        this.turnQueue = uids;
        this.turnHolder = uids[0] || null;
      } else {
        this.turnQueue = [];
        this.turnHolder = null;
      }
      await this.persist(); // commit before announcing (same rule as the lock)
      this.broadcastTurnState();
      return;
    }

    // ── Pass the brush: the painter passes, or the host skips an AFK painter ──
    if (data.type === "turn-pass" && this.managed) {
      await this.ensureLoaded();
      if (!this.turnsOn) return;
      const st = sender.state as ConnState | null;
      const isHost = !!st && (st.role === "host" || st.uid === this.hostId);
      const isHolder = !!st && st.uid === this.turnHolder;
      if (!isHost && !isHolder) return;
      this.advanceTurn();
      await this.persist();
      this.broadcastTurnState();
      return;
    }

    // ── Take-turns enforcement: only the painter's actions relay ──
    // (Belt to the client-side braces: a stale or modified client can't paint,
    // wipe, or restyle the room out of turn.)
    if (this.managed) {
      if (!this.loaded) await this.ensureLoaded();
      if (this.turnsOn) {
        if (data.type === "settings-lock") return; // superseded while taking turns
        if (TURN_HOLDER_ONLY.has(data.type)) {
          const st = sender.state as ConnState | null;
          if (!st || st.uid !== this.turnHolder) return;
        }
      } else if (data.type === "turn-look") {
        // No painter exists while turns are off — a stray or forged look
        // snapshot must not reach (and restyle) other members.
        return;
      }
    }

    // ── Default relay: stamp sender id/timestamp + broadcast to everyone else ──
    if (!data.clientId) data.clientId = sender.id;
    if (!data.timestamp) data.timestamp = Date.now();
    this.room.broadcast(JSON.stringify(data), [sender.id]);
  }

  async onClose(conn: Party.Connection) {
    this.broadcastClientCount();
    if (!this.managed) return;
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
      this.turnsOn = false;
      this.turnQueue = [];
      this.turnHolder = null;
      await this.room.storage.deleteAll();
      if (this.kind === "public") this.notifyLobbyVacate();
      return;
    }

    const st = conn.state as ConnState | null;

    // Host left but others remain → transfer host so lock/unlock stays usable.
    if (st && st.uid === this.hostId) {
      const nextState = remaining[0].state as ConnState | null;
      this.hostId = nextState ? nextState.uid : null;
      await this.persist();
      if (this.hostId) {
        this.room.broadcast(
          JSON.stringify({ type: "host-changed", hostId: this.hostId, timestamp: Date.now() })
        );
      }
    }

    // Rotation upkeep: a member with no remaining connection leaves the queue;
    // if the painter left, the brush passes to whoever was next after them.
    if (this.turnsOn && st) {
      const stillHere = remaining.some((c) => {
        const cs = c.state as ConnState | null;
        return !!cs && cs.uid === st.uid;
      });
      if (!stillHere && this.turnQueue.includes(st.uid)) {
        const wasHolder = st.uid === this.turnHolder;
        const idx = this.turnQueue.indexOf(st.uid);
        this.turnQueue = this.turnQueue.filter((u) => u !== st.uid);
        if (wasHolder) {
          this.turnHolder = null;
          if (this.turnQueue.length) {
            // idx now points at the member who was after the departed painter
            for (let step = 0; step < this.turnQueue.length; step++) {
              const cand = this.turnQueue[(idx + step) % this.turnQueue.length];
              if (this.clientIdForUid(cand, conn.id)) {
                this.turnHolder = cand;
                break;
              }
            }
            if (!this.turnHolder) this.turnHolder = this.turnQueue[0];
          }
        }
        await this.persist();
        this.broadcastTurnState(conn.id);
      } else if (stillHere) {
        // The uid survives on another connection (second tab, or a zombie
        // socket outliving a quick reconnect). Uid-keyed state is unchanged,
        // but clients key on CONNECTION ids — re-advertise so the holder and
        // order map to live ids, or the room stays keyed to a dead one.
        this.broadcastTurnState(conn.id);
      }
    }
  }

  onError(conn: Party.Connection, err: Error) {
    console.error(`Error for ${conn.id}:`, err);
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

  // Advance the brush to the next connected member after the current holder.
  advanceTurn() {
    const q = this.turnQueue;
    if (!q.length) {
      this.turnHolder = null;
      return;
    }
    const i = this.turnHolder ? q.indexOf(this.turnHolder) : -1;
    for (let step = 1; step <= q.length; step++) {
      const cand = q[(i + step) % q.length];
      if (this.clientIdForUid(cand)) {
        this.turnHolder = cand;
        return;
      }
    }
    this.turnHolder = q[0] || null;
  }

  // Rotation snapshot for clients. Members ride as connection ids (clients
  // already see those on every relayed message) — never as uids.
  broadcastTurnState(excludeConnId?: string) {
    const order = this.turnQueue
      .map((u) => this.clientIdForUid(u, excludeConnId))
      .filter((id): id is string => !!id);
    this.room.broadcast(
      JSON.stringify({
        type: "turn-state",
        on: this.turnsOn,
        holder: this.turnHolder ? this.clientIdForUid(this.turnHolder, excludeConnId) : null,
        order,
        timestamp: Date.now(),
      })
    );
  }

  persist() {
    return Promise.all([
      this.room.storage.put("locked", this.locked),
      this.hostId
        ? this.room.storage.put("hostId", this.hostId)
        : this.room.storage.delete("hostId"),
      this.room.storage.put("members", [...this.members]),
      this.room.storage.put("turnsOn", this.turnsOn),
      this.room.storage.put("turnQueue", this.turnQueue),
      this.turnHolder
        ? this.room.storage.put("turnHolder", this.turnHolder)
        : this.room.storage.delete("turnHolder"),
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
