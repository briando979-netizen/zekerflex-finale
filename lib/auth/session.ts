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

function secretKey(): Uint8Array {
  return new TextEncoder().encode(AUTH_SECRET);
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

export async function decodeSession(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      !isRoleGrantArray(payload.roles)
    ) {
      return null;
    }
    return { ...payload, remember: payload.remember === true } as SessionClaims;
  } catch {
    return null;
  }
}
