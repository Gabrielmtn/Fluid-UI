// Shared helpers + constants for the Fluid-UI multiplayer parties.
//
// NOTE: this module is SERVER-ONLY — it is bundled into the PartyKit worker and
// is never served to the browser. INTERNAL_SECRET therefore stays private and
// can authenticate server-to-server (play room -> lobby) calls.

export const PUBLIC_CAP = 2;            // "paint with a stranger" = a 1:1 pair
export const PRIVATE_CAP = 8;           // invite/code rooms
export const WAIT_TTL_MS = 60_000;      // how long a lone matchmaking waiter lingers
export const MATCHMAKE_THROTTLE_MS = 3_000;
export const MAX_MESSAGE_BYTES = 16 * 1024;

// Authenticates the play-room -> lobby "vacate" call so a browser client cannot
// forge directory updates. Server-only (never shipped to the client bundle).
export const INTERNAL_SECRET = "fluid-mp-internal-7Q3M2K-no-ship";

export type RoomKind = "public" | "private" | "system";

// Room id prefixes are the namespace discriminator:
//   pub-XXXXXX  -> public, matchmade 1:1 (minted by the lobby, never typed)
//   sys-...     -> system/sub-app rooms: pure passthrough relay (legacy behavior)
//   anything else (bare 6-char codes) -> private invite rooms (lock + capacity)
// Bare codes stay un-prefixed so existing/older clients remain cross-compatible.
export function roomKind(id: string): RoomKind {
  if (id.startsWith("pub-")) return "public";
  if (id.startsWith("sys-")) return "system";
  return "private";
}

export function capacityFor(id: string): number {
  return roomKind(id) === "public" ? PUBLIC_CAP : PRIVATE_CAP;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// Pull the client's stable device id off the WS upgrade URL (?uid=...).
export function uidFromRequestUrl(url: string): string | null {
  try {
    const uid = new URL(url).searchParams.get("uid");
    return uid && uid.length > 0 && uid.length <= 64 ? uid : null;
  } catch {
    return null;
  }
}
