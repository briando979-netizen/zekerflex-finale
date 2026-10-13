import { createHmac } from "crypto";
import { env } from "@/lib/env";

export interface TurnCredential {
  urls: string[];
  username: string;
  credential: string;
}

// coturn's REST API auth convention (--use-auth-secret): username is
// "<expiry-unix-ts>:<userid>", password is base64(HMAC-SHA1(secret, username)).
// A 1-hour TTL only gates the initial allocation — once a call has connected,
// the relay keeps working independently of this credential's expiry.
const TTL_SEC = 3600;

/** Returns null when self-hosted TURN isn't configured — callers fall back to STUN-only. */
export function mintTurnCredential(userId: string): TurnCredential | null {
  if (!env.TURN_HOST || !env.TURN_SHARED_SECRET) return null;
  const username = `${Math.floor(Date.now() / 1000) + TTL_SEC}:${userId}`;
  const credential = createHmac("sha1", env.TURN_SHARED_SECRET).update(username).digest("base64");
  return {
    urls: [`turn:${env.TURN_HOST}:3478?transport=udp`, `turn:${env.TURN_HOST}:3478?transport=tcp`],
    username,
    credential,
  };
}
