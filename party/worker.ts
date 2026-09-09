// Runs the UNCHANGED PartyKit relay classes (party/index.ts, party/lobby.ts)
// on partyserver — Cloudflare's open-source successor to PartyKit — so the
// same code deploys to our own Cloudflare account with `wrangler deploy`
// (see wrangler.jsonc). Hosted PartyKit's own cloud-prem deploy is dead for
// new accounts: its backend still creates key-value-backed Durable Objects,
// which Cloudflare no longer allows, so this adapter is the way onto
// swirltogether.com.
//
// The relay only touches a small slice of PartyKit's `Party.Room`
// (storage, broadcast, getConnections, id, env, and one party-to-party
// fetch); `roomFor` rebuilds exactly that slice over the hosting Server.
// Storage IS the Durable Object's own storage in both worlds, so persisted
// keys, alarms and their semantics carry over untouched. The URL scheme
// (/parties/fluid/<room>, /parties/lobby/main) is preserved by
// routePartykitRequest, so the browser client and shipped desktop builds
// need no change.
import { Server, routePartykitRequest, getServerByName } from "partyserver";
import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import FluidPartyServer from "./index";
import LobbyServer from "./lobby";

type Env = {
  fluid: DurableObjectNamespace<FluidRoom>;
  lobby: DurableObjectNamespace<LobbyRoom>;
  INTERNAL_SECRET?: string;
};

// Hibernation stays OFF, matching the hosted PartyKit deploy (the relay never
// opted in). Both parties keep deliberate in-memory state that assumes the
// instance lives as long as a socket is open — the lobby's waiter connection
// id, a room's pending turn invite, sweep timestamps — and a hibernating
// instance can be evicted between two messages, which would silently revive
// the "stranded seeker" behaviour the lobby was rewritten to close. Turning it
// on later is a cost optimisation to be done together with those fields.
const NO_HIBERNATE = { hibernate: false };

function roomFor(host: Server<Env>, storage: DurableObjectStorage, env: Env) {
  return {
    get id() {
      return host.name;
    },
    env,
    storage,
    broadcast: (msg: string, without?: string[]) => host.broadcast(msg, without),
    getConnections: () => host.getConnections(),
    getConnection: (id: string) => host.getConnection(id),
    context: {
      parties: {
        lobby: {
          get: (name: string) => ({
            // A PartyKit party stub accepts a bare path; a Durable Object stub
            // wants an absolute URL. The origin is never seen by anyone.
            fetch: async (pathOrReq: string | Request, init?: RequestInit) => {
              const stub = await getServerByName(env.lobby, name);
              const req =
                typeof pathOrReq === "string"
                  ? new Request("https://internal" + pathOrReq, init)
                  : pathOrReq;
              return stub.fetch(req);
            },
          }),
        },
      },
    },
  };
}

// partyserver's hooks mirror PartyKit's, except onMessage, whose argument
// order is (connection, message) instead of (message, sender).
export class FluidRoom extends Server<Env> {
  static options = NO_HIBERNATE;
  relay: FluidPartyServer;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.relay = new FluidPartyServer(roomFor(this, ctx.storage, env) as any);
  }
  onStart() {
    return this.relay.onStart();
  }
  onConnect(conn: Connection, ctx: ConnectionContext) {
    // KNOWN LOG NOISE: when the relay refuses a peer (room full / locked) by
    // closing the socket inside onConnect, workerd logs one uncaught
    // "Network connection lost" per refusal. Verified harmless — the room,
    // its state and its other peers are untouched, and the refused client
    // still receives the relay's 4001/4002 close code. Deferring the close
    // past the 101 response did not silence it, so it is left alone.
    return this.relay.onConnect(conn as any, ctx as any);
  }
  onMessage(conn: Connection, message: WSMessage) {
    return this.relay.onMessage(message as any, conn as any);
  }
  onClose(conn: Connection, code: number, reason: string, wasClean: boolean) {
    return this.relay.onClose(conn as any, code, reason, wasClean);
  }
  onError(conn: Connection, err: unknown) {
    return this.relay.onError(conn as any, err as Error);
  }
  onAlarm() {
    return this.relay.onAlarm();
  }
  onRequest(_req: Request) {
    return new Response("not found", { status: 404 });
  }
}

export class LobbyRoom extends Server<Env> {
  static options = NO_HIBERNATE;
  relay: LobbyServer;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.relay = new LobbyServer(roomFor(this, ctx.storage, env) as any);
  }
  onStart() {
    return this.relay.onStart();
  }
  onMessage(conn: Connection, message: WSMessage) {
    return this.relay.onMessage(message as any, conn as any);
  }
  onClose(conn: Connection) {
    return this.relay.onClose(conn as any);
  }
  onAlarm() {
    return this.relay.onAlarm();
  }
  onRequest(req: Request) {
    return this.relay.onRequest(req as any);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Static files never reach here in production (wrangler.jsonc
    // run_worker_first is scoped to /parties/*); anything else unmatched is
    // a genuine 404.
    return (await routePartykitRequest(request, env as any)) || new Response("Not found", { status: 404 });
  },
};
