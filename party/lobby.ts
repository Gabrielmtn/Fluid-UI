import type * as Party from "partykit/server";
import {
  generateRoomCode,
  WAIT_TTL_MS,
  MATCHMAKE_THROTTLE_MS,
  internalSecret,
} from "./shared";

// Singleton matchmaking coordinator, always addressed with the constant id
// "main" (/parties/lobby/main). Pairs two strangers 1:1: the first seeker mints
// a fresh public room and waits; the next seeker is handed that same room, which
// fills the pair.
//
// CONCURRENCY: a Durable Object processes events serially but CAN interleave at
// `await` points. So the pairing decision — the read+mutate of the in-memory
// `waitingRoomId` — is done SYNCHRONOUSLY with no `await` between read and write;
// storage persistence happens afterward. That synchronous critical section is
// what actually closes the pairing race (two simultaneous seekers can never both
// mint their own room and miss each other).
export default class LobbyServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  waitingRoomId: string | null = null;
  waitingSince = 0;
  // Who is holding the waiting room. Without this a second matchmake from the
  // SAME device is handed its own room with waiting:false — "matched" alone.
  waitingUid: string | null = null;
  loaded = false;
  ready: Promise<void> | null = null;
  lastSeen: Map<string, number> = new Map(); // uid -> last matchmake ts (best-effort throttle)

  async onStart() {
    const w = await this.room.storage.get<{ id: string; since: number; uid?: string }>("waiting");
    if (w && Date.now() - w.since < WAIT_TTL_MS) {
      this.waitingRoomId = w.id;
      this.waitingSince = w.since;
      this.waitingUid = w.uid || null;
    } else {
      this.waitingRoomId = null;
      this.waitingUid = null;
    }
    this.loaded = true;
  }

  // Rehydrate the waiting pointer once after any eviction/wake, before pairing.
  async ensureLoaded() {
    if (this.loaded) return;
    if (!this.ready) this.ready = this.onStart();
    await this.ready;
  }

  async onMessage(message: string, sender: Party.Connection) {
    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    if (!data || data.type !== "matchmake") return;
    await this.ensureLoaded();

    const uid = typeof data.uid === "string" && data.uid ? data.uid : sender.id;
    const now = Date.now();

    // Best-effort per-uid throttle (in-memory; resets on hibernation, which is fine).
    const last = this.lastSeen.get(uid) || 0;
    if (now - last < MATCHMAKE_THROTTLE_MS) {
      sender.send(JSON.stringify({ type: "matchmake-error", message: "One moment…" }));
      return;
    }
    this.lastSeen.set(uid, now);

    // ── Synchronous critical section (no await between read and mutate) ──
    let roomId: string;
    let waiting: boolean;
    const pointerLive = !!this.waitingRoomId && now - this.waitingSince < WAIT_TTL_MS;
    if (pointerLive && this.waitingUid === uid) {
      // Same seeker still waiting — this is a keep-alive, not a pairing. Refresh
      // the TTL and hand back the SAME room. Two things depend on this: a lone
      // waiter can hold the slot past WAIT_TTL_MS (before, the alarm dropped the
      // pointer at 60s while they sat in the room, so a later seeker minted a
      // different room and the two never met), and a double-click can no longer
      // "match" someone with themselves.
      roomId = this.waitingRoomId as string;
      this.waitingSince = now;
      waiting = true;
    } else if (pointerLive) {
      roomId = this.waitingRoomId as string;
      this.waitingRoomId = null; // paired — the pair is now full
      this.waitingUid = null;
      waiting = false;
    } else {
      roomId = "pub-" + generateRoomCode();
      this.waitingRoomId = roomId;
      this.waitingSince = now;
      this.waitingUid = uid;
      waiting = true;
    }
    // ────────────────────────────────────────────────────────────────────

    // Commit the waiting-pointer mutation BEFORE replying, so the seeker never
    // acts on a pairing decision an eviction could lose (which would strand both
    // seekers alone in separate rooms). The in-memory mutation already happened
    // synchronously above, so concurrent seekers still pair correctly.
    await this.persistWaiting();
    if (waiting) await this.room.storage.setAlarm(now + WAIT_TTL_MS + 1000);

    sender.send(JSON.stringify({ type: "matched", roomId, waiting }));
  }

  // Server-only endpoint: a public play room reports it emptied, so we can clear
  // a stale waiting pointer immediately rather than waiting for the alarm.
  async onRequest(req: Party.Request) {
    const url = new URL(req.url);
    if (url.searchParams.get("s") !== internalSecret(this.room.env)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (url.pathname.split("/").pop() === "vacate") {
      const room = url.searchParams.get("room");
      if (room && this.waitingRoomId === room) {
        this.waitingRoomId = null;
        this.waitingUid = null;
        await this.persistWaiting();
      }
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  }

  async onAlarm() {
    const now = Date.now();
    if (this.waitingRoomId && now - this.waitingSince >= WAIT_TTL_MS) {
      // Only fires if the waiter stopped sending keep-alives (tab closed, went
      // offline). A live waiter refreshes waitingSince well inside the TTL.
      this.waitingRoomId = null;
      this.waitingUid = null;
      await this.persistWaiting();
    }
    // Prune stale throttle entries so the map can't grow unbounded.
    for (const [uid, ts] of this.lastSeen) {
      if (now - ts > WAIT_TTL_MS) this.lastSeen.delete(uid);
    }
  }

  persistWaiting() {
    return this.waitingRoomId
      ? this.room.storage.put("waiting", { id: this.waitingRoomId, since: this.waitingSince, uid: this.waitingUid })
      : this.room.storage.delete("waiting");
  }
}

LobbyServer satisfies Party.Worker;
