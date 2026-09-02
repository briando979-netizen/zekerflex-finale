import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Confirm tokens.
//
// When the console detects a mutation intent it mints a short-lived HS256 JWT
// carrying the action name + validated params + the operator's id. The
// separate confirm endpoint verifies it before executing - so the client can
// never smuggle different params, and a token can't be replayed by another
// user or after 5 minutes.
// ---------------------------------------------------------------------------

const ISSUER = "zekerflex.admin-console";
const AUDIENCE = "zekerflex.admin-console.confirm";
const TTL_SECONDS = 5 * 60;

function key(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export interface ConfirmClaim {
  action: string;
  params: Record<string, unknown>;
  actorUserId: string;
  /** Unique token id, for single-use enforcement. */
  jti: string;
}

export async function mintConfirmToken(
  claim: Omit<ConfirmClaim, "jti">,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ action: claim.action, params: claim.params })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claim.actorUserId)
    .setJti(randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(key());
}

export async function verifyConfirmToken(token: string): Promise<ConfirmClaim> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.action !== "string" ||
      typeof payload.params !== "object" ||
      payload.params === null
    ) {
      throw new Error("malformed confirm claim");
    }
    return {
      action: payload.action,
      params: payload.params as Record<string, unknown>,
      actorUserId: payload.sub,
      jti: payload.jti,
    };
  } catch {
    throw AppError.forbidden("Ongeldige of verlopen bevestigingstoken");
  }
}

/**
 * Atomically claim a confirm token's single use. Returns false if it was
 * already spent (or Redis is unreachable - fail closed).
 */
export async function claimConfirmToken(jti: string): Promise<boolean> {
  try {
    const ok = await redis.set(
      `zf:admin-console:used:${jti}`,
      "1",
      "EX",
      TTL_SECONDS + 60,
      "NX",
    );
    return ok === "OK";
  } catch {
    return false;
  }
}
