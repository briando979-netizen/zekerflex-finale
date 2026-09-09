import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// Edge-safe session token primitives.
//
// The session cookie is a plain HS256 JWT (jose) so it can be verified both in
// the Edge middleware and in Node route handlers without pulling in Prisma or
// the Node crypto-heavy NextAuth internals. NextAuth v5 is wired to mint/read
// exactly these tokens via its `jwt.encode` / `jwt.decode` hooks.
//
// This module intentionally reads `process.env` directly (static keys, so they
// inline into the Edge bundle) rather than the full `@/lib/env` schema.
// ---------------------------------------------------------------------------

function requireAuthSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET is missing or shorter than 32 characters");
  }
  return value;
}
const AUTH_SECRET = requireAuthSecret();

/**
 * Retired signing secrets, comma-separated, tried only for *verifying* an
 * existing token — never for signing new ones. Rotation procedure: move the
 * current AUTH_SECRET value into AUTH_SECRET_PREVIOUS, generate a new
 * AUTH_SECRET, deploy. Sessions minted before the rotation keep working
 * until they expire naturally (up to REMEMBER_MAX_AGE_SECONDS); after that
 * window has passed, AUTH_SECRET_PREVIOUS can be removed.
 */
function previousAuthSecrets(): string[] {
  const raw = process.env.AUTH_SECRET_PREVIOUS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 32);
}
const AUTH_SECRET_PREVIOUS = previousAuthSecrets();

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-zekerflex.session"
    : "zekerflex.session";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours (default)
export const REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days ("ingelogd blijven")

const ISSUER = "zekerflex";
const AUDIENCE = "zekerflex.app";

/** One role the principal holds, scoped to an organization (+ optional locations). */
export interface RoleGrant {
  role: UserRole;
  /** Tenant.id of the organization. */
  organizationId: string;
  /** Branch.id[] the grant is scoped to; empty => every location in the org. */
  locationIds: string[];
}

export interface SessionClaims extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  roles: RoleGrant[];
  /** true when the user chose "ingelogd blijven" — drives the token lifetime */
  remember?: boolean;
}

function secretKey(secret: string = AUTH_SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface SessionInput {
  sub: string;
  email: string;
  name: string;
  roles: RoleGrant[];
  remember?: boolean;
}

export async function encodeSession(
  input: SessionInput,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: input.email,
    name: input.name,
    roles: input.roles,
    ...(input.remember ? { remember: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.sub)
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(now + maxAgeSeconds)
    .sign(secretKey());
}

function isRoleGrantArray(value: unknown): value is RoleGrant[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        v != null &&
        typeof (v as RoleGrant).role === "string" &&
        typeof (v as RoleGrant).organizationId === "string" &&
        Array.isArray((v as RoleGrant).locationIds),
    )
  );
}

async function verifyWithSecret(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export async function decodeSession(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;

  let payload = await verifyWithSecret(token, AUTH_SECRET);
  for (const secret of AUTH_SECRET_PREVIOUS) {
    if (payload) break;
    payload = await verifyWithSecret(token, secret);
  }
  if (!payload) return null;

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    !isRoleGrantArray(payload.roles)
  ) {
    return null;
  }
  return { ...payload, remember: payload.remember === true } as SessionClaims;
}
