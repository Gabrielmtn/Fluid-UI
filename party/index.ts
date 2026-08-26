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
  // Liveness: stamped on every message. `pinger` marks a client that has
  // sent at least one heartbeat — only those may be reaped for silence
  // (old deployed clients never ping and must never be reaped).
  lastSeen?: number;
  pinger?: boolean;
}

// A pinger silent this long is presumed dead (client pings every ~20s, so
// this tolerates two missed beats plus jitter). Reaping drives the normal
// onClose cleanup: counts, host transfer, turn handoff, room reset.
const REAP_SILENCE_MS = 65_000;
const SWEEP_MIN_INTERVAL_MS = 10_000;

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
  "turn-invite-offer",
  "turn-invite-result",
  "turn-invite-sent",
  "share-state",
]);

// How long a "shall we take turns?" invite stands before it goes stale.
const INVITE_TTL_MS = 30_000;

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
  turnMs = 60_000; // host-chosen turn length (0 = no timer)
  turnDeadline = 0; // epoch ms when the current turn auto-passes (0 = none)
  // How a turn ENDS. "timer": the alarm auto-passes at turnDeadline. "stroke"
  // ("One swirl each"): no clock at all — the painter tweaks, lays down one
  // stroke, and their own client passes the brush when that stroke has fully
  // landed. The relay stays the authority either way; it just has no deadline
  // to enforce in stroke mode, so turnMs is pinned to 0 there.
  turnMode: "timer" | "stroke" = "timer";
  // Stranger-pair consent, in memory only: it lives ~30s inside a room with two
  // live connections, so there is nothing worth persisting — and a lost invite
  // simply reads as "no answer", which the proposer's client already handles.
  pendingInvite: {
    from: string;
    seconds: number;
    mode: "timer" | "stroke";
    at: number;
  } | null = null;
  // Settings shares: opt-in circles inside the room, keyed by uid and
  // advertised to clients as connection ids (same rule as the rotation).
  // A member belongs to at most one; uids[0] is the circle's ANCHOR, the
  // member whose look a joiner converges onto.
  shares: Map<string, string[]> = new Map();
  shareSeq = 0; // per-room counter behind the opaque share ids
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
    this.turnsOn = (await this.room.storage.get<boolean>("turnsOn")) || false;
    this.turnQueue = (await this.room.storage.get<string[]>("turnQueue")) || [];
    this.turnHolder = (await this.room.storage.get<string>("turnHolder")) || null;
    const tm = await this.room.storage.get<number>("turnMs");
    this.turnMs = typeof tm === "number" ? tm : 60_000;
    this.turnDeadline = (await this.room.storage.get<number>("turnDeadline")) || 0;
    this.turnMode =
      (await this.room.storage.get<string>("turnMode")) === "stroke" ? "stroke" : "timer";
    this.shares = new Map(
      (await this.room.storage.get<[string, string[]][]>("shares")) || []
    );
    this.shareSeq = (await this.room.storage.get<number>("shareSeq")) || 0;
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
    // a host or a running rotation means the previous instance died without
    // closes (redeploy/eviction). The named members may never return — rebuild
    // around this member instead of pinning the room on ghosts.
    if (others === 0) {
      if (this.hostId && this.hostId !== uid) this.hostId = uid;
      if (this.turnsOn) {
        this.turnQueue = [uid];
        this.turnHolder = uid;
        this.turnDeadline = this.turnMs > 0 ? Date.now() + this.turnMs : 0;
        await this.syncTurnAlarm();
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
        // Which circles were already open when this member arrived. Their
        // client needs to tell those apart from one opened while they are
        // here: the first is context, the second is an offer worth a prompt.
        shares: this.shareRoster(),
      })
    );
    this.broadcastClientCount();
    // Everyone (including the joiner, and the holder whose conn id may have
    // changed across a reconnect) re-syncs the rotation.
    if (this.turnsOn) this.broadcastTurnState();
    // Same for the settings shares: a joiner needs to see which circles are
    // open before they can join one, and everyone else needs the newcomer's
    // connection id in place of whatever id they held before a reconnect.
    if (this.shares.size) this.broadcastShareState();
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
          await this.syncTurnAlarm();
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

    // ── Take-turns toggle (also carries the turn length) ──
    // Private rooms: host-only, as with the lock. Stranger pairs have no real
    // host (it is just whoever connected first), so either member may start
    // turns — but starting requires the partner's consent, so the direct "on"
    // path is refused there and must go through turn-invite below. Either
    // member may switch turns OFF: leaving the mode needs no permission.
    if (data.type === "turns" && this.managed) {
      await this.ensureLoaded();
      const st = sender.state as ConnState | null;
      if (!st) return;
      const isHost = st.role === "host" || st.uid === this.hostId;
      const pair = this.kind === "public";
      const wantOn = !!data.on;
      if (!isHost && !(pair && !wantOn)) return;
      if (pair && wantOn && !this.turnsOn) return; // needs consent — use turn-invite
      if (wantOn) {
        this.enableTurns(st.uid, data.seconds, data.mode);
      } else {
        this.turnsOn = false;
        this.turnQueue = [];
        this.turnHolder = null;
        this.turnDeadline = 0;
        this.turnMode = "timer";
        this.pendingInvite = null;
      }
      await this.persist(); // commit before announcing (same rule as the lock)
      await this.syncTurnAlarm();
      this.broadcastTurnState();
      // The room's look regime just changed hands, so the share roster is
      // announced with it: enableTurns dissolved the circles, and saying so
      // beats leaving every client to infer it from the turn state.
      this.broadcastShareState();
      return;
    }

    // ── Stranger-pair consent: "shall we take turns?" ──
    // Either member proposes; the partner accepts or declines. Nothing changes
    // until they agree, so neither person can impose the mode on the other.
    if (data.type === "turn-invite" && this.kind === "public") {
      await this.ensureLoaded();
      const st = sender.state as ConnState | null;
      if (!st || this.turnsOn) return;
      // ALWAYS answer the asker. A silent drop here strands them on
      // "Waiting for their answer…" with no way to tell whether the partner
      // is ignoring them, absent, or the room simply cannot do this.
      const others = [...this.room.getConnections()].filter((c) => c.id !== sender.id);
      const other = others.find((c) => {
        const cs = c.state as ConnState | null;
        return !!cs && cs.uid !== st.uid;
      });
      if (!other) {
        // No partner with a DIFFERENT device id. Either we are alone, or both
        // windows are the same browser profile (they share the localStorage
        // device id), which turn-taking cannot tell apart into two painters.
        sender.send(
          JSON.stringify({
            type: "turn-invite-result",
            accepted: false,
            reason: others.length ? "same-device" : "alone",
            timestamp: Date.now(),
          })
        );
        return;
      }
      const seconds = typeof data.seconds === "number" ? data.seconds : 60;
      const mode: "timer" | "stroke" = data.mode === "stroke" ? "stroke" : "timer";

      // Crossing invites (both clicked at once): the second one is consent.
      const p = this.livePendingInvite();
      const otherState = other.state as ConnState | null;
      if (p && otherState && p.from === otherState.uid) {
        this.pendingInvite = null;
        this.enableTurns(p.from, p.seconds, p.mode);
        await this.persist();
        await this.syncTurnAlarm();
        this.broadcastTurnState();
        this.broadcastShareState(); // the circles just dissolved — say so
        return;
      }

      this.pendingInvite = { from: st.uid, seconds, mode, at: Date.now() };
      other.send(
        JSON.stringify({
          type: "turn-invite-offer",
          from: sender.id,
          seconds,
          mode,
          expiresIn: INVITE_TTL_MS,
          timestamp: Date.now(),
        })
      );
      // Ack the asker: its absence is how a client detects a relay too old to
      // understand invites (which otherwise looks exactly like a silent partner).
      sender.send(
        JSON.stringify({ type: "turn-invite-sent", to: other.id, timestamp: Date.now() })
      );
      return;
    }

    if (data.type === "turn-invite-response" && this.kind === "public") {
      await this.ensureLoaded();
      const st = sender.state as ConnState | null;
      const p = this.livePendingInvite();
      // Only the person who was ASKED may answer, and only once.
      if (!st || !p || p.from === st.uid) return;
      this.pendingInvite = null;
      if (data.accept) {
        this.enableTurns(p.from, p.seconds, p.mode);
        await this.persist();
        await this.syncTurnAlarm();
        this.broadcastTurnState();
        this.broadcastShareState(); // the circles just dissolved — say so
      } else {
        const proposer = this.connForUid(p.from);
        if (proposer) {
          proposer.send(
            JSON.stringify({ type: "turn-invite-result", accepted: false, by: sender.id, timestamp: Date.now() })
          );
        }
      }
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
      this.turnDeadline = this.turnMs > 0 ? Date.now() + this.turnMs : 0;
      await this.persist();
      await this.syncTurnAlarm();
      this.broadcastTurnState();
      return;
    }

    // ── Settings sharing: opt-in circles inside the room ──
    // Not a room-wide mode and not a host power. Anyone opens a share, anyone
    // may join it or leave it, and inside one every member's look changes
    // reach every other member — including whoever opened it. Sharing takes
    // nothing away (you keep every control), which is why this needs no
    // consent handshake the way taking turns does: the offer IS the open
    // circle, and answering it is joining.
    if (
      this.managed &&
      (data.type === "share-open" ||
        data.type === "share-join" ||
        data.type === "share-leave" ||
        data.type === "share-look")
    ) {
      await this.ensureLoaded();
      const st = sender.state as ConnState | null;
      if (!st) return;
      // Take Turns owns the room's look while it runs (the painter's settings
      // mirror to everyone, watchers are gated), so shares stand down for the
      // duration: enableTurns dissolves them, and this refuses new ones.
      if (this.turnsOn) return;

      if (data.type === "share-look") {
        const gid = this.shareOf(st.uid);
        if (!gid) return; // no circle to speak into
        // Routed, not broadcast: a look delta belongs to one circle, and the
        // rest of the room must never be restyled by a share they are not in.
        const out = JSON.stringify({ ...data, clientId: sender.id, timestamp: Date.now() });
        for (const uid of this.shares.get(gid) || []) {
          if (uid === st.uid) continue;
          const c = this.connForUid(uid);
          if (c) c.send(out);
        }
        return;
      }

      if (data.type === "share-open") {
        this.leaveShare(st.uid);
        this.shares.set("s" + ++this.shareSeq, [st.uid]);
      } else if (data.type === "share-join") {
        const gid = typeof data.group === "string" ? data.group : "";
        const g = this.shares.get(gid);
        // A stale offer — the circle dissolved while the prompt was still up —
        // must leave the sender exactly where they are, not drop them out of
        // the share they are already in for a circle that no longer exists.
        if (!g || this.shareOf(st.uid) === gid) return;
        this.leaveShare(st.uid);
        g.push(st.uid);
      } else if (!this.leaveShare(st.uid)) {
        return; // share-leave with nothing to leave
      }
      await this.persist(); // commit before announcing (same rule as the lock)
      this.broadcastShareState();
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
      this.turnDeadline = 0;
      this.turnMode = "timer";
      this.pendingInvite = null;
      this.shares.clear();
      this.shareSeq = 0;
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

    // A pending invite dies with either party: the asker leaving makes it
    // moot, and the asked leaving means nobody can answer it.
    if (this.pendingInvite && st) {
      const stillHereForInvite = remaining.some((c) => {
        const cs = c.state as ConnState | null;
        return !!cs && cs.uid === st.uid;
      });
      if (!stillHereForInvite) this.pendingInvite = null;
    }

    // Settings-share upkeep: a member with no remaining connection leaves
    // their circle, and the circle dissolves if they were the last one in it.
    if (st && this.shares.size) {
      const stillHereForShare = remaining.some((c) => {
        const cs = c.state as ConnState | null;
        return !!cs && cs.uid === st.uid;
      });
      if (!stillHereForShare) {
        if (this.leaveShare(st.uid)) {
          await this.persist();
          this.broadcastShareState(conn.id);
        }
      } else if (this.shareOf(st.uid)) {
        // The uid survives on another connection (second tab, or a zombie
        // outliving a reconnect). Clients key the circle on CONNECTION ids —
        // re-advertise, or the roster stays keyed to a dead one.
        this.broadcastShareState(conn.id);
      }
    }

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
          this.turnDeadline = this.turnMs > 0 ? Date.now() + this.turnMs : 0;
          await this.syncTurnAlarm();
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

  // Reap connections that heartbeat once and then went silent — a peer that
  // died without a close frame (sleep, crash, dropped network) otherwise
  // haunts the room for minutes on the platform's TCP timing: it holds the
  // cap-2 stranger slot, keeps the survivor's count at 2 ("still connected"),
  // and can capture the turn rotation. close() drives all onClose cleanup.
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

  // Alarm double-duty: zombie sweep + turn-timer expiry (the brush
  // auto-passes even if everyone is idle).
  async onAlarm() {
    await this.ensureLoaded();
    this.lastSweep = 0; // the alarm is the guaranteed sweep — never skip it
    await this.maybeSweep();
    if (this.turnsOn && this.turnDeadline && Date.now() >= this.turnDeadline - 250) {
      this.advanceTurn();
      this.turnDeadline = this.turnMs > 0 ? Date.now() + this.turnMs : 0;
      await this.persist();
      this.broadcastTurnState();
    }
    await this.syncTurnAlarm();
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

  // The pending invite, or null if there is none / it went stale.
  livePendingInvite() {
    const p = this.pendingInvite;
    if (!p) return null;
    if (Date.now() - p.at > INVITE_TTL_MS) {
      this.pendingInvite = null;
      return null;
    }
    return p;
  }

  // Newest live connection for a uid (see clientIdForUid for why newest).
  connForUid(uid: string): Party.Connection | null {
    let found: Party.Connection | null = null;
    for (const c of this.room.getConnections()) {
      const cs = c.state as ConnState | null;
      if (cs && cs.uid === uid) found = c;
    }
    return found;
  }

  // Switch turns on with `starterUid` painting first, then everyone else
  // connected. Shared by the host toggle and an accepted stranger invite.
  // Caller persists, syncs the alarm, and broadcasts.
  enableTurns(starterUid: string, seconds?: unknown, mode?: unknown) {
    const wasOn = this.turnsOn;
    this.turnsOn = true;
    this.pendingInvite = null;
    // One painter's look now mirrors to the whole room, which is what a share
    // was for — so the circles dissolve rather than fight the rotation over
    // the same settings. (Callers persist and broadcast right after.)
    this.shares.clear();
    this.turnMode = mode === "stroke" ? "stroke" : "timer";
    // Turn length: 0 = no timer; otherwise clamp to something sane. "One swirl
    // each" has no clock by definition — the stroke ending is the deadline.
    if (this.turnMode === "stroke") {
      this.turnMs = 0;
    } else if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const s = Math.floor(seconds);
      this.turnMs = s <= 0 ? 0 : Math.max(10, Math.min(600, s)) * 1000;
    }
    if (!wasOn) {
      const uids: string[] = [starterUid];
      for (const c of this.room.getConnections()) {
        const cs = c.state as ConnState | null;
        if (cs && !uids.includes(cs.uid)) uids.push(cs.uid);
      }
      this.turnQueue = uids;
      this.turnHolder = uids[0] || null;
    }
    // A (re)enable or a timer change restarts the current turn's clock.
    this.turnDeadline = this.turnMs > 0 ? Date.now() + this.turnMs : 0;
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

  // Keep the storage alarm aligned with whichever comes first: the turn
  // deadline, or the next zombie sweep (needed while any heartbeat-capable
  // connection exists — with the turn timer off there is no other alarm, and
  // a silent zombie would otherwise never be reaped in a quiet room).
  async syncTurnAlarm() {
    try {
      let next = 0;
      if (this.turnsOn && this.turnDeadline) next = this.turnDeadline;
      let hasPinger = false;
      for (const c of this.room.getConnections()) {
        const cs = c.state as ConnState | null;
        if (cs && cs.pinger) {
          hasPinger = true;
          break;
        }
      }
      if (hasPinger) {
        const sweepAt = Date.now() + 30_000;
        next = next ? Math.min(next, sweepAt) : sweepAt;
      }
      if (next) {
        await this.room.storage.setAlarm(next);
      } else {
        await this.room.storage.deleteAlarm();
      }
    } catch {
      /* best-effort — a missed alarm only delays the auto-pass/sweep */
    }
  }

  // Rotation snapshot for clients. Members ride as connection ids (clients
  // already see those on every relayed message) — never as uids. `timestamp`
  // doubles as the server-clock reference for the countdown (clients compute
  // their skew from it, so `deadline` needs no synchronized clocks).
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
        turnMs: this.turnMs,
        mode: this.turnMode,
        deadline: this.turnDeadline || null,
        timestamp: Date.now(),
      })
    );
  }

  // The share a member belongs to, or null.
  shareOf(uid: string): string | null {
    for (const [id, uids] of this.shares) if (uids.includes(uid)) return id;
    return null;
  }

  // Drop a member from whatever share they are in; a circle with nobody left
  // dissolves rather than lingering as an empty one others could still join.
  // Returns whether anything actually changed — callers persist + broadcast.
  leaveShare(uid: string): boolean {
    const id = this.shareOf(uid);
    if (!id) return false;
    const left = (this.shares.get(id) || []).filter((u) => u !== uid);
    if (left.length) this.shares.set(id, left);
    else this.shares.delete(id);
    return true;
  }

  // Who is sharing settings with whom. Members ride as connection ids — never
  // uids, which are the lock re-admission key — exactly as the rotation does.
  // members[0] is the anchor; a circle whose members have all gone is omitted.
  shareRoster(excludeConnId?: string) {
    return [...this.shares.entries()]
      .map(([id, uids]) => ({
        id,
        members: uids
          .map((u) => this.clientIdForUid(u, excludeConnId))
          .filter((c): c is string => !!c),
      }))
      .filter((g) => g.members.length > 0);
  }

  broadcastShareState(excludeConnId?: string) {
    this.room.broadcast(
      JSON.stringify({
        type: "share-state",
        groups: this.shareRoster(excludeConnId),
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
      this.room.storage.put("turnMs", this.turnMs),
      this.room.storage.put("turnDeadline", this.turnDeadline),
      this.room.storage.put("turnMode", this.turnMode),
      this.turnHolder
        ? this.room.storage.put("turnHolder", this.turnHolder)
        : this.room.storage.delete("turnHolder"),
      this.room.storage.put("shares", [...this.shares.entries()]),
      this.room.storage.put("shareSeq", this.shareSeq),
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
